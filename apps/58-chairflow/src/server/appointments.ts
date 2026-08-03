/**
 * src/server/appointments.ts
 *
 * The booking spine: availability, taking a booking with the policy stamp, moving one,
 * cancelling one, and the stylist's three-way verdict at the end of the day.
 *
 * Two things here are load-bearing and worth reading before changing:
 *
 *  1. **The slot is re-checked inside a transaction that holds a per-stylist advisory
 *     lock.** Two clients tapping the same 6pm from two phones is the ordinary case,
 *     not the exotic one, and a lock keyed to the stylist means the loser gets "just
 *     missed it" instead of a double booking. The check re-uses `slotsForDay` — the
 *     same function that drew the picker — so there is no second, looser notion of
 *     what is bookable.
 *  2. **The policy version and the agreement timestamp are written at booking and
 *     never touched again.** Every fee is later computed from *that* version, which is
 *     why editing a policy appends rather than updates.
 */

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, gte, inArray, lt, lte, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  appointments,
  cadences,
  charges,
  clients,
  messages,
  nudges,
  policies,
  services,
  stylists,
  waitlistEntries,
  type Appointment,
  type Client,
  type Policy,
  type Service,
  type Stylist,
} from "@/db/schema";
import { audit, type Actor } from "@/server/audit";
import { gateway, PaymentDeclined } from "@/server/payments";
import {
  cancellationBody,
  confirmationBody,
  feeReceiptBody,
  sendMessage,
} from "@/server/notify";
import { countsAsVisit } from "@/lib/appointments";
import { computeCadence, parseSettings } from "@/lib/cadence";
import {
  parseWorkingHours,
  slotsForDay,
  type Interval,
} from "@/lib/availability";
import {
  addDaysToDay,
  dayOfInstant,
  todayInTimezone,
} from "@/lib/dates";
import { env } from "@/lib/env";
import { fullName, normalizePhone } from "@/lib/format";
import { bookingPageLive, type Billable } from "@/lib/plans";
import {
  cancellationOutcome,
  computeFee,
  depositFor,
  parseDepositRule,
  policySummary,
  type PolicyTerms,
} from "@/lib/policy";
import { manageUrl, mintToken, bookingUrl as publicBookingUrl } from "@/lib/tokens";

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

export function policyTerms(policy: Policy): PolicyTerms {
  return {
    version: policy.version,
    cancelWindowHours: policy.cancelWindowHours,
    lateCancelFeePercent: policy.lateCancelFeePercent,
    noShowFeePercent: policy.noShowFeePercent,
  };
}

/** The version in force now — the one a booking today agrees to. */
export async function currentPolicy(stylistId: string): Promise<Policy | null> {
  const db = getDb();
  const [policy] = await db
    .select()
    .from(policies)
    .where(eq(policies.stylistId, stylistId))
    .orderBy(desc(policies.version))
    .limit(1);
  return policy ?? null;
}

/** The version an appointment was booked under. Never the current one. */
export async function policyForVersion(
  stylistId: string,
  version: number,
): Promise<Policy | null> {
  const db = getDb();
  const [policy] = await db
    .select()
    .from(policies)
    .where(and(eq(policies.stylistId, stylistId), eq(policies.version, version)));
  return policy ?? null;
}

export async function allPolicies(stylistId: string): Promise<Policy[]> {
  const db = getDb();
  return db
    .select()
    .from(policies)
    .where(eq(policies.stylistId, stylistId))
    .orderBy(desc(policies.version));
}

export async function activeServices(stylistId: string): Promise<Service[]> {
  const db = getDb();
  return db
    .select()
    .from(services)
    .where(and(eq(services.stylistId, stylistId), eq(services.status, "active")))
    .orderBy(asc(services.priceCents));
}

export async function serviceById(id: string): Promise<Service | null> {
  const db = getDb();
  const [service] = await db.select().from(services).where(eq(services.id, id));
  return service ?? null;
}

/**
 * The intervals a stylist is not free, between two instants.
 *
 * Typed operators (`gt`, `lt`) rather than a raw `sql` fragment: interpolating a `Date`
 * into one bypasses Drizzle's column encoder and throws inside postgres.js at runtime,
 * which nothing in the build catches.
 */
export async function busyIntervals(
  stylistId: string,
  from: Date,
  to: Date,
  options: { excludeAppointmentId?: string } = {},
): Promise<Interval[]> {
  const db = getDb();
  const conditions = [
    eq(appointments.stylistId, stylistId),
    inArray(appointments.status, ["booked", "completed", "no_show"]),
    lt(appointments.startsAt, to),
    gt(appointments.endsAt, from),
  ];
  if (options.excludeAppointmentId) {
    conditions.push(ne(appointments.id, options.excludeAppointmentId));
  }
  const rows = await db
    .select({ startsAt: appointments.startsAt, endsAt: appointments.endsAt })
    .from(appointments)
    .where(and(...conditions));
  return rows;
}

export interface DaySlots {
  day: string;
  slots: Interval[];
}

/** The next `dayCount` calendar days from today, where the chair is. */
export function bookableDays(stylist: Pick<Stylist, "timezone">, dayCount: number, now = new Date()): string[] {
  const first = todayInTimezone(stylist.timezone, now);
  return Array.from({ length: dayCount }, (_, i) => addDaysToDay(first, i));
}

export async function openSlots(input: {
  stylist: Stylist;
  service: Service;
  days: string[];
  now?: Date;
  excludeAppointmentId?: string;
}): Promise<DaySlots[]> {
  const now = input.now ?? new Date();
  if (input.days.length === 0) return [];
  const settings = parseSettings(input.stylist.settings);
  const hours = parseWorkingHours(input.stylist.workingHours);
  const from = new Date(now.getTime() - 86_400_000);
  const to = new Date(
    Date.parse(`${addDaysToDay(input.days[input.days.length - 1], 2)}T00:00:00.000Z`),
  );
  const busy = await busyIntervals(input.stylist.id, from, to, {
    excludeAppointmentId: input.excludeAppointmentId,
  });
  return input.days.map((day) => ({
    day,
    slots: slotsForDay({
      timezone: input.stylist.timezone,
      day,
      hours,
      durationMinutes: input.service.durationMinutes,
      busy,
      now,
      minNoticeMinutes: settings.minNoticeMinutes,
    }),
  }));
}

export async function dayAppointments(
  stylistId: string,
  timezone: string,
  day: string,
): Promise<
  Array<{ appointment: Appointment; client: Client; service: Service; charge: typeof charges.$inferSelect | null }>
> {
  const db = getDb();
  const from = new Date(Date.parse(`${day}T00:00:00.000Z`) - 86_400_000);
  const to = new Date(Date.parse(`${addDaysToDay(day, 1)}T00:00:00.000Z`) + 86_400_000);
  const rows = await db
    .select({ appointment: appointments, client: clients, service: services })
    .from(appointments)
    .innerJoin(clients, eq(clients.id, appointments.clientId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .where(
      and(
        eq(appointments.stylistId, stylistId),
        gte(appointments.startsAt, from),
        lte(appointments.startsAt, to),
      ),
    )
    .orderBy(asc(appointments.startsAt));

  // Narrow to the stylist's own calendar day, which the ±1 day window over-selects.
  const onDay = rows.filter((r) => dayOfInstant(timezone, r.appointment.startsAt) === day);
  if (onDay.length === 0) return [];

  const feeRows = await db
    .select()
    .from(charges)
    .where(
      and(
        inArray(
          charges.appointmentId,
          onDay.map((r) => r.appointment.id),
        ),
        inArray(charges.kind, ["no_show_fee", "late_cancel_fee"]),
      ),
    );
  return onDay.map((r) => ({
    ...r,
    charge: feeRows.find((c) => c.appointmentId === r.appointment.id) ?? null,
  }));
}

export async function upcomingAppointments(
  stylistId: string,
  limit = 20,
  now = new Date(),
): Promise<Array<{ appointment: Appointment; client: Client; service: Service }>> {
  const db = getDb();
  return db
    .select({ appointment: appointments, client: clients, service: services })
    .from(appointments)
    .innerJoin(clients, eq(clients.id, appointments.clientId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .where(
      and(
        eq(appointments.stylistId, stylistId),
        eq(appointments.status, "booked"),
        gte(appointments.startsAt, now),
      ),
    )
    .orderBy(asc(appointments.startsAt))
    .limit(limit);
}

export async function hasUpcomingAppointment(
  clientId: string,
  now = new Date(),
): Promise<boolean> {
  const db = getDb();
  const [found] = await db
    .select({ id: appointments.id })
    .from(appointments)
    .where(
      and(
        eq(appointments.clientId, clientId),
        eq(appointments.status, "booked"),
        gte(appointments.startsAt, now),
      ),
    )
    .limit(1);
  return Boolean(found);
}

/* ------------------------------------------------------------------ */
/* Clients                                                             */
/* ------------------------------------------------------------------ */

export interface ClientInput {
  firstName: string;
  lastName?: string | null;
  phone: string;
  email?: string | null;
  smsConsent: boolean;
}

/**
 * Find-or-create by phone, which is the client's identity in this stylist's book.
 *
 * A returning client keeps their history, their cadence and their card: their phone is
 * how the booking page recognises them without ever asking them to make an account.
 * Consent is only ever *added* here — a booking without the box ticked must not silently
 * revoke consent given last month, and never un-does a STOP.
 */
export async function upsertClient(
  stylistId: string,
  input: ClientInput,
): Promise<Client> {
  const db = getDb();
  const phone = normalizePhone(input.phone);
  if (!phone) throw new Error("Enter a mobile number we can text");

  const [existing] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.stylistId, stylistId), eq(clients.phone, phone)));

  if (existing) {
    const patch: Partial<typeof clients.$inferInsert> = { updatedAt: new Date() };
    if (input.email && !existing.email) patch.email = input.email.toLowerCase();
    if (input.lastName && !existing.lastName) patch.lastName = input.lastName;
    if (input.smsConsent && !existing.smsConsent && !existing.smsOptedOutAt) {
      patch.smsConsent = true;
    }
    const [updated] = await db
      .update(clients)
      .set(patch)
      .where(eq(clients.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(clients)
    .values({
      stylistId,
      firstName: input.firstName.trim(),
      lastName: input.lastName?.trim() || null,
      phone,
      email: input.email?.toLowerCase().trim() || null,
      smsConsent: input.smsConsent,
    })
    .returning();
  return created;
}

/* ------------------------------------------------------------------ */
/* Booking                                                             */
/* ------------------------------------------------------------------ */

export type BookResult =
  | { ok: true; appointmentId: string; manageToken: string; simulatedCard: boolean }
  | { ok: true; hosted: true; url: string }
  | { ok: false; error: BookError; message: string };

export type BookError =
  | "page_closed"
  | "slot_taken"
  | "invalid"
  | "declined"
  | "no_policy";

export interface BookInput {
  stylist: Stylist;
  serviceId: string;
  /** The exact instant the client tapped, as an ISO string from the picker. */
  startsAtIso: string;
  client: ClientInput;
  /** Digits typed into the demo card field, when the recorded gateway is in play. */
  cardHint?: string | null;
  source?: "booking_page" | "manual" | "nudge" | "waitlist";
  /** Set when this booking came from a nudge link, so the receipt can be stamped. */
  nudgeId?: string | null;
  now?: Date;
}

export async function bookAppointment(input: BookInput): Promise<BookResult> {
  const db = getDb();
  const now = input.now ?? new Date();
  const stylist = input.stylist;

  if (!bookingPageLive(stylist as Billable, now)) {
    return {
      ok: false,
      error: "page_closed",
      message: "This booking page is not taking bookings right now.",
    };
  }

  const service = await serviceById(input.serviceId);
  if (!service || service.stylistId !== stylist.id || service.status !== "active") {
    return { ok: false, error: "invalid", message: "That service is no longer offered." };
  }

  const policy = await currentPolicy(stylist.id);
  if (!policy) {
    return {
      ok: false,
      error: "no_policy",
      message: "This chair has no policy set up yet, so bookings are paused.",
    };
  }

  const startsAt = new Date(input.startsAtIso);
  if (Number.isNaN(startsAt.getTime())) {
    return { ok: false, error: "invalid", message: "Pick a time from the list." };
  }
  const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);

  if (!input.client.firstName.trim()) {
    return { ok: false, error: "invalid", message: "Tell us your first name." };
  }
  if (!normalizePhone(input.client.phone)) {
    return { ok: false, error: "invalid", message: "Enter a mobile number we can text." };
  }

  const client = await upsertClient(stylist.id, input.client);
  const depositCents = depositFor(parseDepositRule(service.depositRule), service.priceCents);
  const appointmentId = randomUUID();

  // --- The card, before the slot is claimed -------------------------------
  //
  // Connect not finished? The booking still works, cardless: a booking page that
  // refuses to take a booking is worse than one that cannot hold a card yet, and the
  // stylist gets nudged to finish onboarding.
  let savedCard: { customerId: string; paymentMethodId: string; last4: string } | null = null;
  let depositPaymentIntentId: string | null = null;
  let simulatedCard = false;

  const connectLive = stylist.connectStatus === "active" && Boolean(stylist.stripeAccountId);
  if (connectLive) {
    const gw = gateway();
    try {
      const collected = await gw.collectCard({
        accountId: stylist.stripeAccountId ?? "",
        clientName: fullName(client),
        phone: client.phone,
        email: client.email,
        cardHint: input.cardHint ?? undefined,
        depositCents,
        description: `${service.name} with ${stylist.displayName}`,
        metadata: {
          chairflow_stylist_id: stylist.id,
          chairflow_client_id: client.id,
          chairflow_service_id: service.id,
          chairflow_starts_at: startsAt.toISOString(),
          chairflow_policy_version: String(policy.version),
        },
        successUrl: `${env.appUrl}/b/${stylist.handle}/booked?a=${appointmentId}`,
        cancelUrl: `${env.appUrl}/b/${stylist.handle}`,
      });
      if (collected.kind === "hosted") {
        // Stripe is configured: the client finishes on Stripe's own page and the
        // Connect webhook creates the appointment. Nothing is held here, so a client
        // who abandons checkout leaves no phantom booking behind.
        return { ok: true, hosted: true, url: collected.url };
      }
      savedCard = collected.card;
      depositPaymentIntentId = collected.depositPaymentIntentId;
      simulatedCard = collected.simulated;
    } catch (err) {
      if (err instanceof PaymentDeclined) {
        return { ok: false, error: "declined", message: err.message };
      }
      throw err;
    }
  }

  // --- The slot, claimed under a lock -------------------------------------
  const settings = parseSettings(stylist.settings);
  const hours = parseWorkingHours(stylist.workingHours);
  const day = dayOfInstant(stylist.timezone, startsAt);

  const claimed = await db.transaction(async (tx) => {
    // One lock per stylist for the length of the transaction. Two clients tapping the
    // same 6pm is the ordinary case; the loser must be told, not double-booked.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${stylist.id}))`);

    const conflicts = await tx
      .select({ startsAt: appointments.startsAt, endsAt: appointments.endsAt })
      .from(appointments)
      .where(
        and(
          eq(appointments.stylistId, stylist.id),
          inArray(appointments.status, ["booked", "completed", "no_show"]),
          lt(appointments.startsAt, new Date(endsAt.getTime() + 86_400_000)),
          gt(appointments.endsAt, new Date(startsAt.getTime() - 86_400_000)),
        ),
      );

    const available = slotsForDay({
      timezone: stylist.timezone,
      day,
      hours,
      durationMinutes: service.durationMinutes,
      busy: conflicts,
      now,
      minNoticeMinutes: settings.minNoticeMinutes,
    });
    if (!available.some((s) => s.startsAt.getTime() === startsAt.getTime())) return null;

    const { token, hash } = await mintToken("manage", appointmentId);
    await tx.insert(appointments).values({
      id: appointmentId,
      stylistId: stylist.id,
      clientId: client.id,
      serviceId: service.id,
      startsAt,
      endsAt,
      priceCents: service.priceCents,
      status: "booked",
      policyVersion: policy.version,
      policyAgreedAt: now,
      depositCents: savedCard ? depositCents : 0,
      depositPaymentIntentId,
      manageTokenHash: hash,
      source: input.source ?? "booking_page",
    });

    if (savedCard) {
      await tx
        .update(clients)
        .set({
          stripeCustomerId: savedCard.customerId,
          defaultPaymentMethodId: savedCard.paymentMethodId,
          cardLast4: savedCard.last4,
          updatedAt: new Date(),
        })
        .where(eq(clients.id, client.id));

      if (depositCents > 0) {
        // `charged` — the money moved and is going towards the service. It only
        // becomes protection (`captured`) if the appointment does not happen.
        await tx.insert(charges).values({
          appointmentId,
          kind: "deposit",
          amountCents: depositCents,
          status: "charged",
          policyVersion: policy.version,
          stripePaymentIntentId: depositPaymentIntentId,
          simulated: simulatedCard,
        });
      }
    }

    return { token };
  });

  if (!claimed) {
    return {
      ok: false,
      error: "slot_taken",
      message: "Just missed it — somebody took that time. Pick another.",
    };
  }

  if (input.nudgeId) {
    await db
      .update(nudges)
      .set({ status: "booked", resultedAppointmentId: appointmentId, updatedAt: new Date() })
      .where(eq(nudges.id, input.nudgeId));
  }

  await audit({
    actor: { kind: "client_token" },
    action: "appointment.booked",
    target: appointmentId,
    stylistId: stylist.id,
    metadata: {
      policyVersion: policy.version,
      depositCents: savedCard ? depositCents : 0,
      cardOnFile: Boolean(savedCard),
      source: input.source ?? "booking_page",
    },
  });

  const confirmation = confirmationBody({
    stylist,
    client,
    appointment: { startsAt, priceCents: service.priceCents, depositCents: savedCard ? depositCents : 0 },
    serviceName: service.name,
    manageUrl: manageUrl(env.appUrl, claimed.token),
    policySummary: policySummary(policyTerms(policy)),
  });
  await sendMessage({
    stylistId: stylist.id,
    clientId: client.id,
    appointmentId,
    kind: "confirmation",
    subject: confirmation.subject,
    body: confirmation.body,
  });

  return { ok: true, appointmentId, manageToken: claimed.token, simulatedCard };
}

/* ------------------------------------------------------------------ */
/* Moving and cancelling                                               */
/* ------------------------------------------------------------------ */

export interface AppointmentBundle {
  appointment: Appointment;
  client: Client;
  service: Service;
  stylist: Stylist;
  policy: Policy | null;
}

export async function appointmentBundle(id: string): Promise<AppointmentBundle | null> {
  const db = getDb();
  const [row] = await db
    .select({ appointment: appointments, client: clients, service: services, stylist: stylists })
    .from(appointments)
    .innerJoin(clients, eq(clients.id, appointments.clientId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .innerJoin(stylists, eq(stylists.id, appointments.stylistId))
    .where(eq(appointments.id, id));
  if (!row) return null;
  const policy = await policyForVersion(row.stylist.id, row.appointment.policyVersion);
  return { ...row, policy };
}

/**
 * Move an appointment, minting a fresh manage link and revoking the old one.
 *
 * A reschedule inside the fee window is deliberately *not* a late cancellation: the
 * client is still coming, and charging them for moving would teach them to no-show
 * instead. The freed slot is offered to the waitlist by the caller.
 */
export async function rescheduleAppointment(input: {
  appointmentId: string;
  startsAtIso: string;
  actor: Actor;
  now?: Date;
}): Promise<{ ok: true; manageToken: string } | { ok: false; message: string }> {
  const db = getDb();
  const now = input.now ?? new Date();
  const bundle = await appointmentBundle(input.appointmentId);
  if (!bundle) return { ok: false, message: "That appointment no longer exists." };
  if (bundle.appointment.status !== "booked") {
    return { ok: false, message: "That appointment is already closed." };
  }

  const startsAt = new Date(input.startsAtIso);
  if (Number.isNaN(startsAt.getTime())) return { ok: false, message: "Pick a time from the list." };
  const endsAt = new Date(startsAt.getTime() + bundle.service.durationMinutes * 60_000);
  const settings = parseSettings(bundle.stylist.settings);
  const hours = parseWorkingHours(bundle.stylist.workingHours);
  const day = dayOfInstant(bundle.stylist.timezone, startsAt);

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${bundle.stylist.id}))`);
    const conflicts = await tx
      .select({ startsAt: appointments.startsAt, endsAt: appointments.endsAt })
      .from(appointments)
      .where(
        and(
          eq(appointments.stylistId, bundle.stylist.id),
          ne(appointments.id, bundle.appointment.id),
          inArray(appointments.status, ["booked", "completed", "no_show"]),
          lt(appointments.startsAt, new Date(endsAt.getTime() + 86_400_000)),
          gt(appointments.endsAt, new Date(startsAt.getTime() - 86_400_000)),
        ),
      );
    const available = slotsForDay({
      timezone: bundle.stylist.timezone,
      day,
      hours,
      durationMinutes: bundle.service.durationMinutes,
      busy: conflicts,
      now,
      minNoticeMinutes: settings.minNoticeMinutes,
    });
    if (!available.some((s) => s.startsAt.getTime() === startsAt.getTime())) return null;

    const { token, hash } = await mintToken("manage", bundle.appointment.id);
    await tx
      .update(appointments)
      .set({ startsAt, endsAt, manageTokenHash: hash, updatedAt: new Date() })
      .where(eq(appointments.id, bundle.appointment.id));
    return { token };
  });

  if (!result) return { ok: false, message: "Just missed it — pick another time." };

  await audit({
    actor: input.actor,
    action: "appointment.rescheduled",
    target: bundle.appointment.id,
    stylistId: bundle.stylist.id,
    metadata: {
      from: bundle.appointment.startsAt.toISOString(),
      to: startsAt.toISOString(),
    },
  });

  const confirmation = confirmationBody({
    stylist: bundle.stylist,
    client: bundle.client,
    appointment: { startsAt, priceCents: bundle.appointment.priceCents, depositCents: bundle.appointment.depositCents },
    serviceName: bundle.service.name,
    manageUrl: manageUrl(env.appUrl, result.token),
    policySummary: bundle.policy ? policySummary(policyTerms(bundle.policy)) : undefined,
  });
  // A reschedule confirmation is its own kind of message, and the unique index is on
  // (appointment, kind, channel) — so it is written against the freed slot's
  // cancellation kind rather than colliding with the original confirmation.
  await sendMessage({
    stylistId: bundle.stylist.id,
    clientId: bundle.client.id,
    appointmentId: null,
    kind: "confirmation",
    subject: `Moved: ${confirmation.subject}`,
    body: confirmation.body,
  });

  return { ok: true, manageToken: result.token };
}

export interface CancelOutcome {
  status: "cancelled" | "late_cancelled";
  feeCents: number;
  depositAppliedCents: number;
  chargeId: string | null;
  freedSlot: { serviceId: string; startsAt: Date; endsAt: Date } | null;
}

/**
 * Cancel, applying the policy the client agreed to.
 *
 * Inside the window this becomes a late cancellation and the fee is captured through
 * the same path a no-show takes — one implementation, so the two cannot drift. Outside
 * it, the cancellation is free and the deposit is handed back.
 */
export async function cancelAppointment(input: {
  appointmentId: string;
  actor: Actor;
  byClient: boolean;
  now?: Date;
}): Promise<{ ok: true; outcome: CancelOutcome } | { ok: false; message: string }> {
  const db = getDb();
  const now = input.now ?? new Date();
  const bundle = await appointmentBundle(input.appointmentId);
  if (!bundle) return { ok: false, message: "That appointment no longer exists." };
  if (bundle.appointment.status !== "booked") {
    return { ok: false, message: "That appointment is already closed." };
  }

  const terms = bundle.policy ? policyTerms(bundle.policy) : null;
  const outcome = terms
    ? cancellationOutcome({
        startsAt: bundle.appointment.startsAt,
        now,
        cancelWindowHours: terms.cancelWindowHours,
      })
    : "free";

  const status = outcome === "late_cancel" ? "late_cancelled" : "cancelled";
  await db
    .update(appointments)
    .set({
      status,
      markedAt: now,
      markedBy: input.byClient ? "client_token" : describeActor(input.actor),
      updatedAt: now,
    })
    .where(eq(appointments.id, bundle.appointment.id));

  let feeCents = 0;
  let depositAppliedCents = 0;
  let chargeId: string | null = null;

  if (status === "late_cancelled" && terms) {
    const captured = await captureFee({
      appointmentId: bundle.appointment.id,
      kind: "late_cancel_fee",
      actor: input.actor,
      now,
    });
    if (captured.ok) {
      feeCents = captured.computation.feeCents;
      depositAppliedCents = captured.computation.depositAppliedCents;
      chargeId = captured.chargeId;
    }
  } else {
    // A free cancellation gives the deposit back. Keeping it would be the thing the
    // policy explicitly promises not to do.
    await refundDepositIfAny(bundle, now);
  }

  await audit({
    actor: input.actor,
    action: `appointment.${status}`,
    target: bundle.appointment.id,
    stylistId: bundle.stylist.id,
    metadata: { feeCents, byClient: input.byClient },
  });

  const feeNote =
    status === "late_cancelled" && feeCents > 0
      ? `A late-cancellation fee of $${(feeCents / 100).toFixed(2)} applied, per the policy you agreed to.`
      : status === "late_cancelled"
        ? "No fee applied."
        : bundle.appointment.depositCents > 0
          ? `Your $${(bundle.appointment.depositCents / 100).toFixed(2)} deposit is being returned.`
          : null;

  const notice = cancellationBody({
    stylist: bundle.stylist,
    client: bundle.client,
    serviceName: bundle.service.name,
    startsAt: bundle.appointment.startsAt,
    feeNote,
    bookingUrl: publicBookingUrl(env.appUrl, bundle.stylist.handle),
  });
  await sendMessage({
    stylistId: bundle.stylist.id,
    clientId: bundle.client.id,
    appointmentId: bundle.appointment.id,
    kind: "cancellation",
    subject: notice.subject,
    body: notice.body,
  });

  return {
    ok: true,
    outcome: {
      status,
      feeCents,
      depositAppliedCents,
      chargeId,
      freedSlot:
        bundle.appointment.startsAt.getTime() > now.getTime()
          ? {
              serviceId: bundle.service.id,
              startsAt: bundle.appointment.startsAt,
              endsAt: bundle.appointment.endsAt,
            }
          : null,
    },
  };
}

function describeActor(actor: Actor): string {
  return actor.kind === "user" ? `user:${actor.userId}` : actor.kind;
}

async function refundDepositIfAny(bundle: AppointmentBundle, now: Date): Promise<void> {
  if (bundle.appointment.depositCents <= 0) return;
  const db = getDb();
  await db
    .update(charges)
    .set({ status: "refunded", updatedAt: now })
    .where(and(eq(charges.appointmentId, bundle.appointment.id), eq(charges.kind, "deposit")));
}

/* ------------------------------------------------------------------ */
/* The verdict, and the fee                                            */
/* ------------------------------------------------------------------ */

export type Verdict = "completed" | "no_show" | "grace" | "no_show_waived";

export interface MarkResult {
  status: "completed" | "no_show";
  feeCents: number;
  depositAppliedCents: number;
  chargedCents: number;
  chargeStatus: ChargeOutcome | null;
  failureReason: string | null;
  chargeId: string | null;
  simulated: boolean;
}

/**
 * The stylist's three-way verdict at the end of the day.
 *
 * `grace` marks the appointment completed and charges nothing — a late arrival is not a
 * no-show, and the button exists so that judgement stays a tap rather than a workaround.
 * `no_show_waived` records the no-show *and* the fee the policy named, marked waived
 * without the card ever being touched: that is the one-tap grace DESIGN.md puts beneath
 * "Charge per policy", and keeping the row is what preserves the evidence that the policy
 * was applied and then forgiven.
 */
export async function markOutcome(input: {
  appointmentId: string;
  verdict: Verdict;
  actor: Actor;
  now?: Date;
}): Promise<{ ok: true; result: MarkResult } | { ok: false; message: string }> {
  const db = getDb();
  const now = input.now ?? new Date();
  const bundle = await appointmentBundle(input.appointmentId);
  if (!bundle) return { ok: false, message: "That appointment no longer exists." };
  if (bundle.appointment.status !== "booked") {
    return { ok: false, message: "That appointment has already been marked." };
  }

  const noShow = input.verdict === "no_show" || input.verdict === "no_show_waived";
  const status = noShow ? "no_show" : "completed";
  await db
    .update(appointments)
    .set({ status, markedAt: now, markedBy: describeActor(input.actor), updatedAt: now })
    .where(eq(appointments.id, bundle.appointment.id));

  await audit({
    actor: input.actor,
    action: `appointment.marked.${input.verdict}`,
    target: bundle.appointment.id,
    stylistId: bundle.stylist.id,
    metadata: { priceCents: bundle.appointment.priceCents },
  });

  if (status === "completed") {
    if (countsAsVisit(status)) await recomputeCadenceFor(bundle.client.id, bundle.service.id);
    return {
      ok: true,
      result: {
        status,
        feeCents: 0,
        depositAppliedCents: 0,
        chargedCents: 0,
        chargeStatus: null,
        failureReason: null,
        chargeId: null,
        simulated: false,
      },
    };
  }

  await db
    .update(clients)
    .set({ noShowCount: bundle.client.noShowCount + 1, updatedAt: now })
    .where(eq(clients.id, bundle.client.id));

  const captured = await captureFee({
    appointmentId: bundle.appointment.id,
    kind: "no_show_fee",
    actor: input.actor,
    now,
    waive: input.verdict === "no_show_waived",
  });
  if (!captured.ok) {
    return {
      ok: true,
      result: {
        status,
        feeCents: 0,
        depositAppliedCents: 0,
        chargedCents: 0,
        chargeStatus: null,
        failureReason: captured.message,
        chargeId: null,
        simulated: false,
      },
    };
  }

  return {
    ok: true,
    result: {
      status,
      feeCents: captured.computation.feeCents,
      depositAppliedCents: captured.computation.depositAppliedCents,
      chargedCents: captured.computation.chargeCents,
      chargeStatus: captured.chargeStatus,
      failureReason: captured.failureReason,
      chargeId: captured.chargeId,
      simulated: captured.simulated,
    },
  };
}

export type ChargeOutcome = "charged" | "captured" | "failed" | "waived";

export type CaptureResult =
  | {
      ok: true;
      chargeId: string;
      chargeStatus: ChargeOutcome;
      computation: ReturnType<typeof computeFee>;
      failureReason: string | null;
      simulated: boolean;
    }
  | { ok: false; message: string };

function outcomeOf(status: string): ChargeOutcome {
  if (status === "failed") return "failed";
  if (status === "captured") return "captured";
  if (status === "waived") return "waived";
  return "charged";
}

/**
 * Capture a fee under the policy version the client agreed to.
 *
 * Deposit-first: the money already held is applied before the card is touched, and the
 * remainder goes off-session with `appointment:{id}:fee` as the idempotency key so a
 * retry cannot charge twice. Belt and braces: the unique index on
 * `(appointment_id, kind)` makes a double row impossible even if the key were lost.
 *
 * A decline is not swallowed. The row is written with the reason, the day view shows
 * it, and the stylist decides how hard to pursue it.
 */
export async function captureFee(input: {
  appointmentId: string;
  kind: "no_show_fee" | "late_cancel_fee";
  actor: Actor;
  now?: Date;
  /** Record the fee the policy named and forgive it in the same breath. */
  waive?: boolean;
}): Promise<CaptureResult> {
  const db = getDb();
  const now = input.now ?? new Date();
  const bundle = await appointmentBundle(input.appointmentId);
  if (!bundle) return { ok: false, message: "That appointment no longer exists." };
  if (!bundle.policy) {
    return {
      ok: false,
      message: `The policy version this was booked under (v${bundle.appointment.policyVersion}) is missing, so no fee can be justified.`,
    };
  }

  const existing = await db
    .select()
    .from(charges)
    .where(and(eq(charges.appointmentId, input.appointmentId), eq(charges.kind, input.kind)));
  if (existing[0]) {
    const row = existing[0];
    return {
      ok: true,
      chargeId: row.id,
      chargeStatus: outcomeOf(row.status),
      computation: computeFee({
        priceCents: bundle.appointment.priceCents,
        depositCents: bundle.appointment.depositCents,
        terms: policyTerms(bundle.policy),
        kind: input.kind,
      }),
      failureReason: row.failureReason,
      simulated: row.simulated,
    };
  }

  const computation = computeFee({
    priceCents: bundle.appointment.priceCents,
    depositCents: bundle.appointment.depositCents,
    terms: policyTerms(bundle.policy),
    kind: input.kind,
  });

  if (computation.feeCents === 0) {
    return { ok: false, message: "This policy charges nothing for that outcome." };
  }

  // Forgiven at the moment of marking: the row records what the policy said, the card is
  // never touched, and any deposit goes back rather than being quietly kept against a
  // fee that was waived.
  if (input.waive) {
    const [waivedRow] = await db
      .insert(charges)
      .values({
        appointmentId: input.appointmentId,
        kind: input.kind,
        amountCents: computation.chargeCents,
        depositAppliedCents: computation.depositAppliedCents,
        status: "waived",
        policyVersion: bundle.policy.version,
        waivedBy: input.actor.kind === "user" ? input.actor.userId : null,
        occurredAt: now,
      })
      .onConflictDoNothing()
      .returning();
    if (bundle.appointment.depositCents > 0) {
      await db
        .update(charges)
        .set({ status: "refunded", updatedAt: now })
        .where(and(eq(charges.appointmentId, input.appointmentId), eq(charges.kind, "deposit")));
    }
    await audit({
      actor: input.actor,
      action: "fee.waived_at_mark",
      target: waivedRow?.id ?? input.appointmentId,
      stylistId: bundle.stylist.id,
      metadata: {
        appointmentId: input.appointmentId,
        kind: input.kind,
        feeCents: computation.feeCents,
        policyVersion: bundle.policy.version,
      },
    });
    return {
      ok: true,
      chargeId: waivedRow?.id ?? "",
      chargeStatus: "waived",
      computation,
      failureReason: null,
      simulated: false,
    };
  }

  // The deposit is kept first: it becomes protection rather than service money.
  if (computation.depositAppliedCents > 0) {
    await db
      .update(charges)
      .set({ status: "captured", updatedAt: now })
      .where(and(eq(charges.appointmentId, input.appointmentId), eq(charges.kind, "deposit")));
    if (computation.depositRefundCents > 0) {
      await db.insert(charges).values({
        appointmentId: input.appointmentId,
        kind: "refund",
        amountCents: computation.depositRefundCents,
        status: "refunded",
        policyVersion: bundle.policy.version,
      });
    }
  }

  let chargeStatus: "charged" | "captured" | "failed" = "captured";
  let paymentIntentId: string | null = null;
  let failureReason: string | null = null;
  let simulated = false;

  if (computation.chargeCents > 0) {
    const cardOnFile =
      bundle.client.stripeCustomerId && bundle.client.defaultPaymentMethodId
        ? {
            customerId: bundle.client.stripeCustomerId,
            paymentMethodId: bundle.client.defaultPaymentMethodId,
          }
        : null;
    if (!cardOnFile || !bundle.stylist.stripeAccountId) {
      chargeStatus = "failed";
      failureReason = cardOnFile
        ? "This chair has not finished Stripe onboarding, so nothing can be charged."
        : "No card on file for this client.";
    } else {
      const gw = gateway();
      const result = await gw.chargeFee({
        accountId: bundle.stylist.stripeAccountId,
        customerId: cardOnFile.customerId,
        paymentMethodId: cardOnFile.paymentMethodId,
        amountCents: computation.chargeCents,
        description: `${input.kind === "no_show_fee" ? "No-show" : "Late cancellation"} fee — ${bundle.service.name}`,
        metadata: feeMetadataFor(bundle, computation),
        idempotencyKey: `appointment:${input.appointmentId}:fee`,
      });
      simulated = result.simulated;
      if (result.ok) {
        chargeStatus = "charged";
        paymentIntentId = result.paymentIntentId;
      } else {
        chargeStatus = "failed";
        failureReason = `${result.message} (${result.code})`;
      }
    }
  }

  const [row] = await db
    .insert(charges)
    .values({
      appointmentId: input.appointmentId,
      kind: input.kind,
      amountCents: computation.chargeCents,
      depositAppliedCents: computation.depositAppliedCents,
      status: chargeStatus,
      policyVersion: bundle.policy.version,
      stripePaymentIntentId: paymentIntentId,
      failureReason,
      simulated,
      occurredAt: now,
    })
    .onConflictDoNothing()
    .returning();

  if (!row) {
    // Somebody else won the race; report theirs rather than inventing a second fee.
    const [winner] = await db
      .select()
      .from(charges)
      .where(and(eq(charges.appointmentId, input.appointmentId), eq(charges.kind, input.kind)));
    return {
      ok: true,
      chargeId: winner.id,
      chargeStatus: outcomeOf(winner.status),
      computation,
      failureReason: winner.failureReason,
      simulated: winner.simulated,
    };
  }

  await audit({
    actor: input.actor,
    action: `fee.${chargeStatus}`,
    target: row.id,
    stylistId: bundle.stylist.id,
    metadata: {
      appointmentId: input.appointmentId,
      kind: input.kind,
      policyVersion: bundle.policy.version,
      policyAgreedAt: bundle.appointment.policyAgreedAt.toISOString(),
      feeCents: computation.feeCents,
      depositAppliedCents: computation.depositAppliedCents,
      chargedCents: computation.chargeCents,
      failureReason,
    },
  });

  if (chargeStatus !== "failed") {
    const receipt = feeReceiptBody({
      stylist: bundle.stylist,
      client: bundle.client,
      serviceName: bundle.service.name,
      startsAt: bundle.appointment.startsAt,
      kindLabel: input.kind === "no_show_fee" ? "no-show fee" : "late-cancellation fee",
      priceCents: bundle.appointment.priceCents,
      percent: computation.percent,
      feeCents: computation.feeCents,
      depositAppliedCents: computation.depositAppliedCents,
      chargedCents: computation.chargeCents,
      policyText: bundle.policy.policyText,
      policyAgreedAt: bundle.appointment.policyAgreedAt,
    });
    await sendMessage({
      stylistId: bundle.stylist.id,
      clientId: bundle.client.id,
      appointmentId: input.appointmentId,
      kind: "receipt",
      subject: receipt.subject,
      body: receipt.body,
    });
  }

  return { ok: true, chargeId: row.id, chargeStatus, computation, failureReason, simulated };
}

function feeMetadataFor(
  bundle: AppointmentBundle,
  computation: ReturnType<typeof computeFee>,
): Record<string, string> {
  return {
    chairflow_appointment_id: bundle.appointment.id,
    chairflow_kind: computation.kind,
    chairflow_client: fullName(bundle.client),
    chairflow_service: bundle.service.name,
    chairflow_appointment_at: bundle.appointment.startsAt.toISOString(),
    chairflow_policy_version: String(bundle.appointment.policyVersion),
    chairflow_policy_agreed_at: bundle.appointment.policyAgreedAt.toISOString(),
    chairflow_fee_percent: String(computation.percent),
    chairflow_fee_cents: String(computation.feeCents),
    chairflow_deposit_applied_cents: String(computation.depositAppliedCents),
  };
}

/**
 * Waive a fee that has not been collected. One tap, always logged.
 *
 * Grace should be easy and charging should be deliberate, which is why this is a single
 * tap while charging is hold-to-confirm. The row survives the waive: deleting it would
 * erase the evidence that the policy was applied at all.
 *
 * A fee the card already paid cannot be waived here, and the message says why. Writing
 * "waived" over a collected fee without moving the money back would make the ledger claim
 * a refund that never happened — the one thing this ledger must never do.
 */
export async function waiveFee(input: {
  chargeId: string;
  userId: string;
  stylistId: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const db = getDb();
  const [row] = await db.select().from(charges).where(eq(charges.id, input.chargeId));
  if (!row) return { ok: false, message: "That charge no longer exists." };

  const bundle = await appointmentBundle(row.appointmentId);
  if (!bundle || bundle.stylist.id !== input.stylistId) {
    return { ok: false, message: "That charge is not yours to waive." };
  }
  if (row.status === "waived") return { ok: true };
  if (row.status === "charged") {
    return {
      ok: false,
      message:
        "That fee was already collected, so waiving it here would show a refund that never happened. Refund it in Stripe and it will come back as a refund row.",
    };
  }

  await db
    .update(charges)
    .set({ status: "waived", waivedBy: input.userId, updatedAt: new Date() })
    .where(eq(charges.id, row.id));

  // A waived fee releases the deposit that backed it, too: forgiving the fee while
  // keeping the deposit against it would be a waive in name only.
  if (row.depositAppliedCents > 0) {
    await db
      .update(charges)
      .set({ status: "refunded", updatedAt: new Date() })
      .where(and(eq(charges.appointmentId, row.appointmentId), eq(charges.kind, "deposit")));
  }

  await audit({
    actor: { kind: "user", userId: input.userId },
    action: "fee.waived",
    target: row.id,
    stylistId: input.stylistId,
    metadata: {
      appointmentId: row.appointmentId,
      amountCents: row.amountCents,
      depositAppliedCents: row.depositAppliedCents,
    },
  });
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Cadence recompute, called wherever a visit completes                */
/* ------------------------------------------------------------------ */

/**
 * Recompute one client x service cadence from their completed visits.
 *
 * Lives here rather than in `server/cadence.ts` because completing an appointment is
 * what changes it, and a rhythm recomputed only by the nightly scan is a rhythm that
 * is wrong all day.
 */
export async function recomputeCadenceFor(clientId: string, serviceId: string): Promise<void> {
  const db = getDb();
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client) return;
  const [service] = await db.select().from(services).where(eq(services.id, serviceId));
  if (!service) return;
  const [stylist] = await db.select().from(stylists).where(eq(stylists.id, client.stylistId));
  if (!stylist) return;

  const visits = await db
    .select({ startsAt: appointments.startsAt })
    .from(appointments)
    .where(
      and(
        eq(appointments.clientId, clientId),
        eq(appointments.serviceId, serviceId),
        eq(appointments.status, "completed"),
      ),
    )
    .orderBy(asc(appointments.startsAt));

  const days = visits.map((v) => dayOfInstant(stylist.timezone, v.startsAt));
  const computed = computeCadence(days);
  if (!computed) return;

  await db
    .insert(cadences)
    .values({
      stylistId: stylist.id,
      clientId,
      serviceId,
      medianIntervalDays: computed.medianIntervalDays,
      sampleCount: computed.sampleCount,
      lastVisitOn: computed.lastVisitOn,
      nextDueOn: computed.nextDueOn,
      computedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [cadences.clientId, cadences.serviceId],
      set: {
        medianIntervalDays: computed.medianIntervalDays,
        sampleCount: computed.sampleCount,
        lastVisitOn: computed.lastVisitOn,
        nextDueOn: computed.nextDueOn,
        computedAt: new Date(),
      },
    });
}

/** Message history for one client, newest first — the comms audit trail. */
export async function clientMessages(clientId: string, limit = 20) {
  const db = getDb();
  return db
    .select()
    .from(messages)
    .where(eq(messages.clientId, clientId))
    .orderBy(desc(messages.occurredAt))
    .limit(limit);
}

/** Everything the client detail screen shows about one client's visits. */
export async function clientHistory(clientId: string) {
  const db = getDb();
  return db
    .select({ appointment: appointments, service: services })
    .from(appointments)
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .where(eq(appointments.clientId, clientId))
    .orderBy(desc(appointments.startsAt));
}

export async function clientWaitlist(clientId: string) {
  const db = getDb();
  return db
    .select({ entry: waitlistEntries, service: services })
    .from(waitlistEntries)
    .innerJoin(services, eq(services.id, waitlistEntries.serviceId))
    .where(and(eq(waitlistEntries.clientId, clientId), inArray(waitlistEntries.status, ["waiting", "offered"])));
}
