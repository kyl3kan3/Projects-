/**
 * src/server/jobs.ts
 *
 * ChairFlow's background work, as plain functions with a lease in front of each one.
 *
 * ARCHITECTURE.md specifies BullMQ workers, which assumes a host with always-on
 * processes. The deployment target is Vercel, where functions are invoked and never run,
 * so the queue table's eight jobs are implemented here once and driven from either end —
 * `/api/cron/tick` (secret-gated, time-budgeted) or `npm run worker` (a loop). Both take
 * the same `job_leases` row first, so running both at once is safe rather than a
 * double-send.
 *
 * ARCHITECTURE's queue table, mapped:
 *
 *   send-reminders       -> remindersStep       (48h and 2h, deduped by a unique index)
 *   flag-noshows         -> unmarkedStep        (counts only; the flag is derived, see
 *                                                lib/appointments.ts)
 *   capture-fee          -> not scheduled       (the stylist's mark drives it; a cron
 *                                                that retried a declined card would
 *                                                charge people at random hours)
 *   cadence-scan         -> cadenceStep
 *   send-nudge           -> cadenceStep         (inside the same pass, under its caps)
 *   offer-waitlist       -> waitlistStep        (expire lapsed offers and cascade)
 *   rent-rollover        -> rentStep
 *   process-stripe-event -> stripeEventsStep    (webhook_events is the queue: the route
 *                                                verifies and persists, this applies)
 *
 * Every step is bounded — by a SQL-side window, a row limit, and the tick's deadline —
 * because the failure mode of a sweep with no bound is a sweep that runs for an hour and
 * then gets killed halfway.
 */

import { and, asc, eq, gt, gte, isNull, lt, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  appointments,
  clients,
  jobLeases,
  services,
  stylists,
  webhookEvents,
} from "@/db/schema";
import {
  currentPolicy,
  dayAppointments,
  policyTerms,
} from "@/server/appointments";
import { activeShops, rolloverShop } from "@/server/rent";
import { activeStylists, sendDueNudges, recomputeStylistCadences } from "@/server/cadence";
import { applySubscription, markWebhookProcessed, refreshConnectStatus, stylistForStripe } from "@/server/billing";
import { expireAndCascade } from "@/server/waitlist";
import { reminderBody, sendMessage } from "@/server/notify";
import { MARK_PROMPT_AFTER_MINUTES } from "@/lib/appointments";
import { addDaysToDay, todayInTimezone } from "@/lib/dates";
import { env } from "@/lib/env";
import { entitled, type Billable } from "@/lib/plans";
import { policySummary } from "@/lib/policy";
import { manageUrl, mintToken } from "@/lib/tokens";

export interface StepReport {
  name: string;
  ran: boolean;
  detail: Record<string, unknown>;
}

export interface TickReport {
  startedAt: string;
  finishedAt: string;
  steps: StepReport[];
  budgetExhausted: boolean;
}

/**
 * Take a named lease, or report that somebody else holds it.
 *
 * The expiry is compared **in SQL**. Comparing a JS `Date` against a `timestamptz` here
 * is the classic scheduler-that-never-runs bug: JS truncates to milliseconds where
 * Postgres keeps microseconds, so a row whose `locked_until` came from `now()` reads as
 * expired and then fails its own guarded update, forever.
 */
async function takeLease(name: string, holdSeconds: number): Promise<boolean> {
  const db = getDb();
  const rows = await db.execute(sql`
    insert into ${jobLeases} (name, locked_until)
    values (${name}, now() + make_interval(secs => ${holdSeconds}))
    on conflict (name) do update
      set locked_until = now() + make_interval(secs => ${holdSeconds})
      where ${jobLeases.lockedUntil} < now()
    returning name
  `);
  return rows.length > 0;
}

async function releaseLease(name: string, report: Record<string, unknown>): Promise<void> {
  const db = getDb();
  await db
    .update(jobLeases)
    .set({ lockedUntil: new Date(), lastRunAt: new Date(), lastReport: report })
    .where(eq(jobLeases.name, name));
}

export interface TickOptions {
  /** Wall-clock deadline (ms since epoch). Steps stop when it passes. */
  deadline: number;
  now?: Date;
  /** Skip the lease — used by tests that drive a single step deliberately. */
  ignoreLeases?: boolean;
}

export async function runTick(options: TickOptions): Promise<TickReport> {
  const now = options.now ?? new Date();
  const steps: StepReport[] = [];
  let budgetExhausted = false;

  const order: Array<{ name: string; hold: number; run: () => Promise<Record<string, unknown>> }> = [
    { name: "process-stripe-event", hold: 120, run: () => stripeEventsStep() },
    { name: "send-reminders", hold: 300, run: () => remindersStep(now) },
    { name: "flag-noshows", hold: 300, run: () => unmarkedStep(now) },
    { name: "offer-waitlist", hold: 300, run: () => waitlistStep(now) },
    { name: "cadence-scan", hold: 900, run: () => cadenceStep(now) },
    { name: "rent-rollover", hold: 900, run: () => rentStep(now) },
  ];

  for (const step of order) {
    if (Date.now() > options.deadline) {
      budgetExhausted = true;
      break;
    }
    const held = options.ignoreLeases ? true : await takeLease(step.name, step.hold);
    if (!held) {
      steps.push({ name: step.name, ran: false, detail: { skipped: "lease held elsewhere" } });
      continue;
    }
    try {
      const detail = await step.run();
      steps.push({ name: step.name, ran: true, detail });
      if (!options.ignoreLeases) await releaseLease(step.name, detail);
    } catch (err) {
      const detail = { error: err instanceof Error ? err.message : String(err) };
      steps.push({ name: step.name, ran: true, detail });
      if (!options.ignoreLeases) await releaseLease(step.name, detail);
    }
  }

  return {
    startedAt: now.toISOString(),
    finishedAt: new Date().toISOString(),
    steps,
    budgetExhausted,
  };
}

/* ------------------------------------------------------------------ */
/* send-reminders                                                      */
/* ------------------------------------------------------------------ */

const REMINDER_RUNGS = [
  { kind: "reminder_48h" as const, hoursBefore: 48, floorHours: 2 },
  { kind: "reminder_2h" as const, hoursBefore: 2, floorHours: 0 },
];

/**
 * Send the 48h and 2h reminders that are due.
 *
 * Pinned to fixed distances from the appointment and bounded to the future, which is what
 * keeps this from becoming the sweep that mails somebody every day forever: an
 * appointment that has already started is outside every window, and the unique index on
 * `(appointment, kind, channel)` refuses a second copy of a rung.
 *
 * The rungs are evaluated tightest-first per appointment, so an appointment created
 * three hours before its start gets the 2h reminder rather than only the 48h one it
 * technically never crossed.
 */
export async function remindersStep(now: Date): Promise<Record<string, unknown>> {
  const db = getDb();
  const sent: Record<string, number> = { reminder_48h: 0, reminder_2h: 0 };
  const skipped: string[] = [];

  for (const rung of [...REMINDER_RUNGS].reverse()) {
    const upper = new Date(now.getTime() + rung.hoursBefore * 3_600_000);
    const lower = new Date(now.getTime() + rung.floorHours * 3_600_000);
    const due = await db
      .select({ appointment: appointments, client: clients, service: services, stylist: stylists })
      .from(appointments)
      .innerJoin(clients, eq(clients.id, appointments.clientId))
      .innerJoin(services, eq(services.id, appointments.serviceId))
      .innerJoin(stylists, eq(stylists.id, appointments.stylistId))
      .where(
        and(
          eq(appointments.status, "booked"),
          gt(appointments.startsAt, lower),
          lte(appointments.startsAt, upper),
        ),
      )
      .orderBy(asc(appointments.startsAt))
      .limit(200);

    for (const row of due) {
      if (!entitled(row.stylist as Billable, now)) {
        skipped.push(`${row.appointment.id}: account not entitled`);
        continue;
      }
      const policy = await currentPolicy(row.stylist.id);
      const { token } = await mintToken("manage", row.appointment.id);
      const body = reminderBody(
        {
          stylist: row.stylist,
          client: row.client,
          appointment: row.appointment,
          serviceName: row.service.name,
          manageUrl: manageUrl(env.appUrl, token),
          policySummary: policy ? policySummary(policyTerms(policy)) : undefined,
        },
        rung.kind,
      );
      const outcome = await sendMessage({
        stylistId: row.stylist.id,
        clientId: row.client.id,
        appointmentId: row.appointment.id,
        kind: rung.kind,
        subject: body.subject,
        body: body.body,
      });
      if (outcome.sent) sent[rung.kind] += 1;
      else if (outcome.reason !== "duplicate") {
        skipped.push(`${row.appointment.id}: ${outcome.reason}`);
      }
    }
  }

  return { sent, skipped: skipped.slice(0, 20), skippedCount: skipped.length };
}

/* ------------------------------------------------------------------ */
/* flag-noshows                                                        */
/* ------------------------------------------------------------------ */

/**
 * Count the appointments waiting on a verdict.
 *
 * ARCHITECTURE.md has this job *writing* a flagged state 30 minutes after the end time.
 * It does not write anything, on purpose: the flag is a pure function of the clock
 * (`lib/appointments.ts`), so a stored copy is wrong between sweeps and a screen ends up
 * showing "Booked" on Tuesday's appointment. Counting is all that is left to do, and the
 * number goes in the tick's report so a stylist who never marks anything is visible in
 * the logs rather than invisible.
 *
 * Nothing here ever charges: a fee needs the stylist's mark.
 */
export async function unmarkedStep(now: Date): Promise<Record<string, unknown>> {
  const db = getDb();
  const cutoff = new Date(now.getTime() - MARK_PROMPT_AFTER_MINUTES * 60_000);
  // Bounded to a fortnight: older than that is a stylist who stopped using the product,
  // not a queue to work through.
  const floor = new Date(now.getTime() - 14 * 86_400_000);
  const rows = await db
    .select({ stylistId: appointments.stylistId, id: appointments.id })
    .from(appointments)
    .where(
      and(
        eq(appointments.status, "booked"),
        lt(appointments.endsAt, cutoff),
        gte(appointments.endsAt, floor),
        isNull(appointments.markedAt),
      ),
    )
    .limit(500);

  const byStylist: Record<string, number> = {};
  for (const row of rows) {
    byStylist[row.stylistId] = (byStylist[row.stylistId] ?? 0) + 1;
  }
  return { awaitingMark: rows.length, stylists: Object.keys(byStylist).length };
}

/* ------------------------------------------------------------------ */
/* offer-waitlist                                                      */
/* ------------------------------------------------------------------ */

export async function waitlistStep(now: Date): Promise<Record<string, unknown>> {
  const result = await expireAndCascade(now);
  return { ...result };
}

/* ------------------------------------------------------------------ */
/* cadence-scan + send-nudge                                           */
/* ------------------------------------------------------------------ */

export async function cadenceStep(now: Date): Promise<Record<string, unknown>> {
  // Bounded to stylists with an appointment in the last 90 days: a rhythm cannot change
  // without a visit, so re-examining the rest for eternity computes the same answer.
  const since = new Date(now.getTime() - 90 * 86_400_000);
  const active = await activeStylists(since);
  let recomputed = 0;
  let sent = 0;
  const skipped: string[] = [];

  for (const stylist of active) {
    const result = await recomputeStylistCadences(stylist.id);
    recomputed += result.recomputed;
    const nudged = await sendDueNudges({ stylist, now });
    sent += nudged.sent;
    for (const skip of nudged.skipped) skipped.push(`${skip.reason}: ${skip.detail}`);
  }

  return {
    stylists: active.length,
    recomputed,
    nudgesSent: sent,
    skipped: skipped.slice(0, 20),
    skippedCount: skipped.length,
  };
}

/* ------------------------------------------------------------------ */
/* rent-rollover                                                       */
/* ------------------------------------------------------------------ */

export async function rentStep(now: Date): Promise<Record<string, unknown>> {
  const since = addDaysToDay(todayInTimezone("UTC", now), -90);
  const shops = await activeShops(since);
  let opened = 0;
  for (const shop of shops) {
    const result = await rolloverShop({ shopId: shop.id, now });
    opened += result.opened;
  }
  return { shops: shops.length, opened };
}

/* ------------------------------------------------------------------ */
/* process-stripe-event                                                */
/* ------------------------------------------------------------------ */

/**
 * Apply persisted Stripe events.
 *
 * `webhook_events` *is* the queue. The route verifies the signature, records the event by
 * id (a duplicate is an ack and a stop) and returns — it never does the work inline, per
 * ARCHITECTURE's webhook law. This step applies what was recorded, and because the state
 * transition is idempotent, replaying an event changes nothing.
 */
export async function stripeEventsStep(): Promise<Record<string, unknown>> {
  const db = getDb();
  const pending = await db
    .select()
    .from(webhookEvents)
    .where(and(eq(webhookEvents.provider, "stripe"), isNull(webhookEvents.processedAt)))
    .orderBy(asc(webhookEvents.createdAt))
    .limit(50);

  let applied = 0;
  const failures: string[] = [];
  for (const event of pending) {
    try {
      await applyStripeEvent(event.type, event.payload as Record<string, unknown>);
      await markWebhookProcessed("stripe", event.externalId);
      applied += 1;
    } catch (err) {
      failures.push(`${event.externalId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { pending: pending.length, applied, failures };
}

/**
 * The state each Stripe event type implies.
 *
 * The payload is the compact projection the webhook route stored, not Stripe's whole
 * object: everything needed to decide is in it, and keeping a client's full payload in
 * our database would be storing somebody else's data for no reason.
 */
export async function applyStripeEvent(
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const str = (key: string): string | null => {
    const v = payload[key];
    return typeof v === "string" ? v : null;
  };

  switch (type) {
    case "checkout.session.completed":
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const stylist = await stylistForStripe({
        stylistId: str("stylistId"),
        customerId: str("customerId"),
      });
      if (!stylist) return;
      await applySubscription({
        stylistId: stylist.id,
        subscriptionId: str("subscriptionId"),
        status: str("status") ?? "active",
        priceId: str("priceId"),
        planHint: str("plan"),
        customerId: str("customerId"),
      });
      return;
    }
    case "customer.subscription.deleted": {
      const stylist = await stylistForStripe({
        stylistId: str("stylistId"),
        customerId: str("customerId"),
      });
      if (!stylist) return;
      // Cancelled means cancelled. `lib/plans.ts` reads this status and closes the
      // booking page; the plan column is left alone so a re-subscribe restores the tier.
      await applySubscription({
        stylistId: stylist.id,
        subscriptionId: str("subscriptionId"),
        status: "canceled",
      });
      return;
    }
    case "invoice.payment_failed": {
      const stylist = await stylistForStripe({ customerId: str("customerId") });
      if (!stylist) return;
      // past_due is grace: the booking page stays up. A stylist's public page going dark
      // because their card expired is an injury we would be inflicting on them.
      await applySubscription({
        stylistId: stylist.id,
        subscriptionId: stylist.stripeSubscriptionId,
        status: "past_due",
      });
      return;
    }
    case "account.updated": {
      const accountId = str("accountId");
      if (!accountId) return;
      const stylist = await stylistForStripe({ accountId });
      if (!stylist) return;
      await refreshConnectStatus(stylist.id, accountId);
      return;
    }
    default:
      return;
  }
}

/* ------------------------------------------------------------------ */
/* A read the dashboard uses, kept beside the job that reports it       */
/* ------------------------------------------------------------------ */

/** Appointments on the stylist's own today, for the day view. */
export async function todayForStylist(stylist: {
  id: string;
  timezone: string;
}, now = new Date()) {
  const day = todayInTimezone(stylist.timezone, now);
  return dayAppointments(stylist.id, stylist.timezone, day);
}

/**
 * Unmarked appointments past the prompt window, oldest first.
 *
 * Bounded to the last 30 days: the point is the resolve card at the top of Today, and a
 * list that reaches back forever is a list nobody clears.
 */
export async function awaitingVerdict(stylistId: string, now = new Date()) {
  const db = getDb();
  const cutoff = new Date(now.getTime() - MARK_PROMPT_AFTER_MINUTES * 60_000);
  const floor = new Date(now.getTime() - 30 * 86_400_000);
  const rows = await db
    .select({ appointment: appointments, client: clients, service: services })
    .from(appointments)
    .innerJoin(clients, eq(clients.id, appointments.clientId))
    .innerJoin(services, eq(services.id, appointments.serviceId))
    .where(
      and(
        eq(appointments.stylistId, stylistId),
        eq(appointments.status, "booked"),
        lt(appointments.endsAt, cutoff),
        gte(appointments.endsAt, floor),
      ),
    )
    .orderBy(asc(appointments.startsAt))
    .limit(20);
  return rows;
}
