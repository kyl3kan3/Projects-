/**
 * src/server/waitlist.ts
 *
 * Backfilling a freed slot. A cancellation is a hole in the day; the waitlist is how it
 * closes itself.
 *
 * The whole design turns on one line of SQL. When an offer is claimed, the update is
 * guarded by `status = 'offered'` **and** the token hash, in a single statement — so two
 * people tapping the same link at the same second produce exactly one winner, and the
 * loser is told "just missed it" rather than double-booked. Checking-then-updating in
 * two steps would produce two winners at exactly the moment it matters.
 *
 * Offers expire after 60 minutes and cascade to the next match.
 */

import { and, asc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clients,
  services,
  stylists,
  waitlistEntries,
  type Client,
  type Service,
  type Stylist,
  type WaitlistEntry,
} from "@/db/schema";
import { audit } from "@/server/audit";
import { bookAppointment } from "@/server/appointments";
import { sendMessage, waitlistOfferBody } from "@/server/notify";
import { parseDayPreference, preferenceMatches } from "@/lib/availability";
import { hourInTimezone, weekdayOfDay, dayOfInstant } from "@/lib/dates";
import { env } from "@/lib/env";
import { featureAllowed, type Billable } from "@/lib/plans";
import { claimUrl, hashMatches, mintToken, verifyToken } from "@/lib/tokens";

export const OFFER_MINUTES = 60;

export interface FreedSlot {
  stylistId: string;
  serviceId: string;
  startsAt: Date;
  endsAt: Date;
}

export interface OfferedSlotJson {
  startsAt: string;
  endsAt: string;
  serviceId: string;
}

/**
 * Offer a freed slot to the first matching waiting entry.
 *
 * One offer at a time, deliberately: sending the same slot to six people and letting
 * them race is how a waitlist earns a reputation for wasting people's time. FIFO by
 * join date, and the cascade picks the next one up when an offer lapses.
 */
export async function offerFreedSlot(
  slot: FreedSlot,
  now = new Date(),
): Promise<{ offered: boolean; entryId?: string; reason?: string }> {
  const db = getDb();
  const [stylist] = await db.select().from(stylists).where(eq(stylists.id, slot.stylistId));
  if (!stylist) return { offered: false, reason: "No such stylist." };

  const allowed = featureAllowed(stylist as Billable, "waitlist", now);
  if (!allowed.ok) return { offered: false, reason: allowed.reason };

  const day = dayOfInstant(stylist.timezone, slot.startsAt);
  const weekday = weekdayOfDay(day);
  const hour = hourInTimezone(stylist.timezone, slot.startsAt);

  const waiting = await db
    .select({ entry: waitlistEntries, client: clients, service: services })
    .from(waitlistEntries)
    .innerJoin(clients, eq(clients.id, waitlistEntries.clientId))
    .innerJoin(services, eq(services.id, waitlistEntries.serviceId))
    .where(
      and(
        eq(waitlistEntries.stylistId, slot.stylistId),
        eq(waitlistEntries.serviceId, slot.serviceId),
        eq(waitlistEntries.status, "waiting"),
        eq(clients.status, "active"),
      ),
    )
    .orderBy(asc(waitlistEntries.createdAt));

  const match = waiting.find((row) =>
    preferenceMatches(parseDayPreference(row.entry.dayPreference), { weekday, hour }),
  );
  if (!match) return { offered: false, reason: "Nobody on the waitlist wants that time." };

  const { token, hash } = await mintToken("waitlist_claim", match.entry.id);
  const expiresAt = new Date(now.getTime() + OFFER_MINUTES * 60_000);
  const offeredSlot: OfferedSlotJson = {
    startsAt: slot.startsAt.toISOString(),
    endsAt: slot.endsAt.toISOString(),
    serviceId: slot.serviceId,
  };

  const claimed = await db
    .update(waitlistEntries)
    .set({
      status: "offered",
      offeredAppointmentSlot: offeredSlot,
      offerExpiresAt: expiresAt,
      claimTokenHash: hash,
      updatedAt: now,
    })
    .where(and(eq(waitlistEntries.id, match.entry.id), eq(waitlistEntries.status, "waiting")))
    .returning({ id: waitlistEntries.id });
  if (!claimed[0]) return { offered: false, reason: "That entry was taken by another pass." };

  const body = waitlistOfferBody({
    stylist,
    client: match.client,
    serviceName: match.service.name,
    startsAt: slot.startsAt,
    claimUrl: claimUrl(env.appUrl, token),
    expiresInMinutes: OFFER_MINUTES,
  });
  await sendMessage({
    stylistId: slot.stylistId,
    clientId: match.client.id,
    kind: "waitlist_offer",
    subject: body.subject,
    body: body.body,
  });

  await audit({
    actor: { kind: "system" },
    action: "waitlist.offered",
    target: match.entry.id,
    stylistId: slot.stylistId,
    metadata: { startsAt: offeredSlot.startsAt, clientId: match.client.id },
  });

  return { offered: true, entryId: match.entry.id };
}

export type ClaimResult =
  | { ok: true; appointmentId: string }
  | { ok: false; reason: "missed" | "expired" | "invalid" | "slot_taken"; message: string };

/**
 * Claim an offered slot. First tap wins.
 *
 * The atomic flip is the guard: `status = 'offered'` plus the stored token hash, in one
 * UPDATE. Whoever loses reads a calm "just missed it" and stays on the waitlist for the
 * next opening rather than being dropped.
 */
export async function claimOffer(token: string, now = new Date()): Promise<ClaimResult> {
  const db = getDb();
  const verified = await verifyToken("waitlist_claim", token);
  if (!verified) {
    return { ok: false, reason: "invalid", message: "This link is not valid any more." };
  }

  const [entry] = await db
    .select()
    .from(waitlistEntries)
    .where(eq(waitlistEntries.id, verified.subjectId));
  if (!entry) {
    return { ok: false, reason: "invalid", message: "This link is not valid any more." };
  }
  if (!hashMatches(entry.claimTokenHash, verified.hash)) {
    return {
      ok: false,
      reason: "invalid",
      message: "This link has been replaced by a newer offer.",
    };
  }
  if (entry.status === "claimed") {
    return { ok: false, reason: "missed", message: "Just missed it — that slot is taken." };
  }
  if (entry.status !== "offered") {
    return { ok: false, reason: "expired", message: "That offer has expired." };
  }
  if (entry.offerExpiresAt && entry.offerExpiresAt.getTime() < now.getTime()) {
    return { ok: false, reason: "expired", message: "That offer has expired." };
  }

  const slot = entry.offeredAppointmentSlot as OfferedSlotJson | null;
  if (!slot) return { ok: false, reason: "expired", message: "That offer has expired." };

  // The single guarded UPDATE: exactly one caller can move this row out of `offered`.
  const won = await db
    .update(waitlistEntries)
    .set({ status: "claimed", updatedAt: now })
    .where(
      and(
        eq(waitlistEntries.id, entry.id),
        eq(waitlistEntries.status, "offered"),
        eq(waitlistEntries.claimTokenHash, verified.hash),
      ),
    )
    .returning({ id: waitlistEntries.id });
  if (!won[0]) {
    return { ok: false, reason: "missed", message: "Just missed it — that slot is taken." };
  }

  const [stylist] = await db.select().from(stylists).where(eq(stylists.id, entry.stylistId));
  const [client] = await db.select().from(clients).where(eq(clients.id, entry.clientId));
  if (!stylist || !client) {
    return { ok: false, reason: "invalid", message: "This link is not valid any more." };
  }

  // Booked through the normal flow: policy agreement and deposit rules included. The
  // waitlist is a way in, not a way around the policy.
  const booked = await bookAppointment({
    stylist,
    serviceId: slot.serviceId,
    startsAtIso: slot.startsAt,
    client: {
      firstName: client.firstName,
      lastName: client.lastName,
      phone: client.phone,
      email: client.email,
      smsConsent: client.smsConsent,
    },
    source: "waitlist",
    now,
  });

  if (!booked.ok) {
    // Put them back on the list rather than losing them over a race we lost.
    await db
      .update(waitlistEntries)
      .set({ status: "waiting", claimTokenHash: null, offerExpiresAt: null, updatedAt: now })
      .where(eq(waitlistEntries.id, entry.id));
    return {
      ok: false,
      reason: booked.error === "slot_taken" ? "slot_taken" : "invalid",
      message: booked.message,
    };
  }
  if ("hosted" in booked) {
    return {
      ok: false,
      reason: "invalid",
      message: "This slot needs a card before it can be held. Use the booking page.",
    };
  }

  await db
    .update(waitlistEntries)
    .set({ claimedAppointmentId: booked.appointmentId, updatedAt: now })
    .where(eq(waitlistEntries.id, entry.id));

  await audit({
    actor: { kind: "client_token" },
    action: "waitlist.claimed",
    target: entry.id,
    stylistId: entry.stylistId,
    metadata: { appointmentId: booked.appointmentId },
  });

  return { ok: true, appointmentId: booked.appointmentId };
}

/**
 * Expire lapsed offers and cascade each freed slot to the next match.
 *
 * The `lt` comparison is a typed operator against a JS `Date` in a WHERE clause, which
 * Drizzle encodes properly — not a `Date` inside a raw `sql` fragment, which would throw
 * inside postgres.js at runtime.
 */
export async function expireAndCascade(now = new Date()): Promise<{ expired: number; recascaded: number }> {
  const db = getDb();
  const lapsed = await db
    .update(waitlistEntries)
    .set({ status: "waiting", claimTokenHash: null, offerExpiresAt: null, updatedAt: now })
    .where(
      and(
        eq(waitlistEntries.status, "offered"),
        isNotNull(waitlistEntries.offerExpiresAt),
        lt(waitlistEntries.offerExpiresAt, now),
      ),
    )
    .returning({
      id: waitlistEntries.id,
      stylistId: waitlistEntries.stylistId,
      slot: waitlistEntries.offeredAppointmentSlot,
    });

  let recascaded = 0;
  for (const row of lapsed) {
    const slot = row.slot as OfferedSlotJson | null;
    if (!slot) continue;
    const startsAt = new Date(slot.startsAt);
    // A slot in the past cannot be offered to anybody: the hour has gone.
    if (startsAt.getTime() <= now.getTime()) continue;
    const result = await offerFreedSlot(
      {
        stylistId: row.stylistId,
        serviceId: slot.serviceId,
        startsAt,
        endsAt: new Date(slot.endsAt),
      },
      now,
    );
    if (result.offered) recascaded += 1;
  }

  return { expired: lapsed.length, recascaded };
}

export async function addToWaitlist(input: {
  stylistId: string;
  clientId: string;
  serviceId: string;
  weekdays: number[];
  partOfDay?: "morning" | "afternoon" | "evening";
}): Promise<{ ok: true; entryId: string } | { ok: false; message: string }> {
  const db = getDb();
  const [existing] = await db
    .select({ id: waitlistEntries.id })
    .from(waitlistEntries)
    .where(
      and(
        eq(waitlistEntries.clientId, input.clientId),
        eq(waitlistEntries.serviceId, input.serviceId),
        inArray(waitlistEntries.status, ["waiting", "offered"]),
      ),
    );
  if (existing) return { ok: false, message: "They are already on the waitlist for that service." };

  const [row] = await db
    .insert(waitlistEntries)
    .values({
      stylistId: input.stylistId,
      clientId: input.clientId,
      serviceId: input.serviceId,
      dayPreference: { weekdays: input.weekdays, partOfDay: input.partOfDay },
      status: "waiting",
    })
    .returning({ id: waitlistEntries.id });
  return { ok: true, entryId: row.id };
}

export async function removeFromWaitlist(entryId: string, stylistId: string): Promise<void> {
  const db = getDb();
  await db
    .update(waitlistEntries)
    .set({ status: "expired", updatedAt: new Date() })
    .where(and(eq(waitlistEntries.id, entryId), eq(waitlistEntries.stylistId, stylistId)));
}

export interface WaitlistRow {
  entry: WaitlistEntry;
  client: Client;
  service: Service;
}

export async function waitlistFor(stylistId: string): Promise<WaitlistRow[]> {
  const db = getDb();
  return db
    .select({ entry: waitlistEntries, client: clients, service: services })
    .from(waitlistEntries)
    .innerJoin(clients, eq(clients.id, waitlistEntries.clientId))
    .innerJoin(services, eq(services.id, waitlistEntries.serviceId))
    .where(
      and(
        eq(waitlistEntries.stylistId, stylistId),
        inArray(waitlistEntries.status, ["waiting", "offered"]),
      ),
    )
    .orderBy(asc(waitlistEntries.createdAt));
}

/** Offers that have lapsed and need cascading — used by the tick's bounded query. */
export async function lapsedOfferCount(now = new Date()): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(waitlistEntries)
    .where(
      and(
        eq(waitlistEntries.status, "offered"),
        isNotNull(waitlistEntries.offerExpiresAt),
        lt(waitlistEntries.offerExpiresAt, now),
      ),
    );
  return row?.count ?? 0;
}

export type { Stylist };
