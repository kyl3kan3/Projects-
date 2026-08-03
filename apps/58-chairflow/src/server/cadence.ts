/**
 * src/server/cadence.ts
 *
 * The nightly rhythm work: recompute every cadence, then send the nudges that are due
 * inside the caps. The decisions are all made by `lib/cadence.ts` (pure, tested); this
 * file supplies the facts and writes the results.
 *
 * The scan is bounded in three ways, on purpose:
 *
 *   - only cadences whose `next_due_on` has actually passed are considered (SQL-side);
 *   - at most two nudges exist per cycle, and the cycle is keyed to the visit that
 *     opened it, so an eternally-overdue client is not texted forever;
 *   - the unique index on `(cadence_id, cycle_key, cycle_count)` means a re-run of the
 *     same scan cannot send rung N twice even if two ticks overlap.
 */

import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  appointments,
  cadences,
  clients,
  nudges,
  services,
  stylists,
  type Cadence,
  type Client,
  type Service,
  type Stylist,
} from "@/db/schema";
import { hasUpcomingAppointment, recomputeCadenceFor } from "@/server/appointments";
import { nudgeBody, sendMessage } from "@/server/notify";
import {
  decideNudge,
  parseSettings,
  type NudgeDenial,
} from "@/lib/cadence";
import {
  addDaysToDay,
  dayOfInstant,
  daysBetweenDays,
  hourInTimezone,
  todayInTimezone,
} from "@/lib/dates";
import { env } from "@/lib/env";
import { featureAllowed, type Billable } from "@/lib/plans";
import { mintToken, nudgeBookingUrl } from "@/lib/tokens";

/**
 * Recompute every cadence this stylist has visit history for.
 *
 * Bounded to (client, service) pairs that have a completed appointment: nothing else
 * can have a rhythm, so nothing else needs recomputing. This is what stops the nightly
 * pass from being an unbounded rescan of records whose answer cannot change.
 */
export async function recomputeStylistCadences(stylistId: string): Promise<{ recomputed: number }> {
  const db = getDb();
  const pairs = await db
    .selectDistinct({ clientId: appointments.clientId, serviceId: appointments.serviceId })
    .from(appointments)
    .where(and(eq(appointments.stylistId, stylistId), eq(appointments.status, "completed")));
  for (const pair of pairs) {
    await recomputeCadenceFor(pair.clientId, pair.serviceId);
  }
  return { recomputed: pairs.length };
}

export interface DueCadence {
  cadence: Cadence;
  client: Client;
  service: Service;
}

/** Cadences past due, oldest-overdue first. Selected in SQL, so the set is bounded. */
export async function dueCadences(
  stylistId: string,
  today: string,
  limit = 50,
): Promise<DueCadence[]> {
  const db = getDb();
  return db
    .select({ cadence: cadences, client: clients, service: services })
    .from(cadences)
    .innerJoin(clients, eq(clients.id, cadences.clientId))
    .innerJoin(services, eq(services.id, cadences.serviceId))
    .where(
      and(
        eq(cadences.stylistId, stylistId),
        eq(clients.status, "active"),
        lte(cadences.nextDueOn, today),
      ),
    )
    .orderBy(asc(cadences.nextDueOn))
    .limit(limit);
}

export interface NudgeReport {
  considered: number;
  sent: number;
  skipped: Array<{ clientId: string; reason: NudgeDenial | "not_entitled" | "send_failed"; detail: string }>;
}

/**
 * Send the nudges that are due for one stylist.
 *
 * Every send is gated twice: by the plan (nudges are a Book-tier feature and a lapsed
 * account sends nothing) and then by the cadence engine's own decision, which knows
 * about consent, caps, spacing and quiet hours.
 */
export async function sendDueNudges(input: {
  stylist: Stylist;
  now?: Date;
  limit?: number;
}): Promise<NudgeReport> {
  const db = getDb();
  const now = input.now ?? new Date();
  const report: NudgeReport = { considered: 0, sent: 0, skipped: [] };

  const allowed = featureAllowed(input.stylist as Billable, "cadence_nudges", now);
  if (!allowed.ok) {
    return { ...report, skipped: [{ clientId: "-", reason: "not_entitled", detail: allowed.reason }] };
  }

  const settings = parseSettings(input.stylist.settings);
  const today = todayInTimezone(input.stylist.timezone, now);
  const hour = hourInTimezone(input.stylist.timezone, now);
  const due = await dueCadences(input.stylist.id, today, input.limit ?? 50);

  for (const row of due) {
    report.considered += 1;

    const sentThisCycle = await db
      .select({ id: nudges.id, sentAt: nudges.sentAt })
      .from(nudges)
      .where(
        and(
          eq(nudges.cadenceId, row.cadence.id),
          eq(nudges.cycleKey, row.cadence.lastVisitOn),
          inArray(nudges.status, ["queued", "sent", "delivered", "booked"]),
        ),
      );
    const lastNudgeOn =
      sentThisCycle
        .map((n) => n.sentAt)
        .filter((d): d is Date => Boolean(d))
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    const decision = decideNudge({
      today,
      nextDueOn: row.cadence.nextDueOn,
      graceDays: settings.nudgeGraceDays,
      sentThisCycle: sentThisCycle.length,
      lastNudgeOn: lastNudgeOn ? dayOfInstant(input.stylist.timezone, lastNudgeOn) : null,
      hasUpcomingAppointment: await hasUpcomingAppointment(row.client.id, now),
      phone: row.client.phone,
      email: row.client.email,
      smsConsent: row.client.smsConsent,
      smsOptedOut: Boolean(row.client.smsOptedOutAt),
      hour,
      quietStartHour: settings.quietStartHour,
      quietEndHour: settings.quietEndHour,
    });

    if (!decision.ok) {
      report.skipped.push({
        clientId: row.client.id,
        reason: decision.reason,
        detail: decision.detail,
      });
      continue;
    }

    // The row is claimed first: the unique index on (cadence, cycle, rung) is what
    // makes two overlapping ticks unable to send the same rung twice.
    const claimed = await db
      .insert(nudges)
      .values({
        stylistId: input.stylist.id,
        clientId: row.client.id,
        cadenceId: row.cadence.id,
        cycleKey: row.cadence.lastVisitOn,
        cycleCount: decision.rung,
        channel: decision.channel,
        status: "queued",
      })
      .onConflictDoNothing()
      .returning({ id: nudges.id });
    const nudge = claimed[0];
    if (!nudge) {
      report.skipped.push({
        clientId: row.client.id,
        reason: "cap_reached",
        detail: "Another pass already sent this rung.",
      });
      continue;
    }

    const { token, hash } = await mintToken("nudge_booking", nudge.id, {
      serviceId: row.service.id,
    });
    const weeksSince = Math.max(
      1,
      Math.round(daysBetweenDays(row.cadence.lastVisitOn, today) / 7),
    );
    const body = nudgeBody({
      stylist: input.stylist,
      client: row.client,
      serviceName: row.service.name,
      weeksSince,
      bookingUrl: nudgeBookingUrl(env.appUrl, input.stylist.handle, token),
    });

    const outcome = await sendMessage({
      stylistId: input.stylist.id,
      clientId: row.client.id,
      kind: "nudge",
      channels: [decision.channel],
      subject: body.subject,
      body: body.body,
    });

    await db
      .update(nudges)
      .set({
        status: outcome.sent ? "sent" : outcome.reason === "opted_out" ? "opted_out" : "failed",
        sentAt: outcome.sent ? now : null,
        bookingTokenHash: hash,
        updatedAt: now,
      })
      .where(eq(nudges.id, nudge.id));

    if (outcome.sent) report.sent += 1;
    else {
      report.skipped.push({
        clientId: row.client.id,
        reason: "send_failed",
        detail: outcome.detail,
      });
    }
  }

  return report;
}

/** The drifted clients a stylist should see on the Clients screen. */
export async function driftedClients(stylistId: string, today: string) {
  const db = getDb();
  return db
    .select({ cadence: cadences, client: clients, service: services })
    .from(cadences)
    .innerJoin(clients, eq(clients.id, cadences.clientId))
    .innerJoin(services, eq(services.id, cadences.serviceId))
    .where(
      and(
        eq(cadences.stylistId, stylistId),
        eq(clients.status, "active"),
        lte(cadences.nextDueOn, today),
      ),
    )
    .orderBy(asc(cadences.nextDueOn));
}

export async function cadencesForClient(clientId: string) {
  const db = getDb();
  return db
    .select({ cadence: cadences, service: services })
    .from(cadences)
    .innerJoin(services, eq(services.id, cadences.serviceId))
    .where(eq(cadences.clientId, clientId));
}

export async function nudgeHistory(clientId: string) {
  const db = getDb();
  return db
    .select({ nudge: nudges, service: services })
    .from(nudges)
    .innerJoin(cadences, eq(cadences.id, nudges.cadenceId))
    .innerJoin(services, eq(services.id, cadences.serviceId))
    .where(eq(nudges.clientId, clientId))
    .orderBy(asc(nudges.createdAt));
}

/**
 * Seed a cadence from an imported last-visit date.
 *
 * One date is not a rhythm, so the interval starts at the service's own default gap
 * (four weeks for a cut) with `sampleCount: 1`. The screen says "estimated" for those,
 * and the first real completed visit replaces the estimate with arithmetic.
 */
export async function seedCadence(input: {
  stylistId: string;
  clientId: string;
  serviceId: string;
  lastVisitOn: string;
  assumedIntervalDays: number;
}): Promise<void> {
  const db = getDb();
  await db
    .insert(cadences)
    .values({
      stylistId: input.stylistId,
      clientId: input.clientId,
      serviceId: input.serviceId,
      medianIntervalDays: input.assumedIntervalDays,
      sampleCount: 1,
      lastVisitOn: input.lastVisitOn,
      nextDueOn: addDaysToDay(input.lastVisitOn, input.assumedIntervalDays),
    })
    .onConflictDoNothing();
}

/** Stylists with any cadence at all — the set the nightly scan walks. */
export async function stylistsWithCadences(limit = 200): Promise<Stylist[]> {
  const db = getDb();
  return db
    .select()
    .from(stylists)
    .where(
      sql`exists (select 1 from ${cadences} where ${cadences.stylistId} = ${stylists.id})`,
    )
    .limit(limit);
}

/** Stylists with an appointment in the last 90 days — the recompute's bounded set. */
export async function activeStylists(since: Date, limit = 200): Promise<Stylist[]> {
  const db = getDb();
  const rows = await db
    .selectDistinct({ stylistId: appointments.stylistId })
    .from(appointments)
    .where(gte(appointments.startsAt, since))
    .limit(limit);
  if (rows.length === 0) return [];
  return db
    .select()
    .from(stylists)
    .where(
      inArray(
        stylists.id,
        rows.map((r) => r.stylistId),
      ),
    );
}
