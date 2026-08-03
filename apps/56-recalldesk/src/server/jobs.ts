/**
 * src/server/jobs.ts
 *
 * Everything background, written once as plain functions and driven from either
 * end — `/api/cron/tick` (the only shape Vercel supports, since functions are
 * invoked and never run) or `npm run worker` (a long-lived loop for a host that
 * does). ARCHITECTURE specifies BullMQ workers; the jobs, their order and their
 * boundaries are exactly as specified, but the transport is a tick, because a
 * queue consumer needs a process to consume in and Vercel has none.
 *
 * Two ticks running at once must not send the same message twice, so every unit
 * of work takes a lease first. Leases live in `job_leases` and **every comparison
 * happens in SQL against `now()`** — never against a JavaScript `Date`. Postgres
 * keeps microseconds where JS truncates to milliseconds, and a lease compared
 * across that boundary is the classic scheduler that looks fine and silently
 * never runs.
 */

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { campaigns, jobLeases, locations, practices } from "@/db/schema";
import { visitValueCentsFor } from "@/lib/attribution";
import { enrollSegment, runDueSteps, type StepOutcome } from "@/server/campaigns";
import { attributeBookingsForLocation } from "@/server/ledger";
import { recomputeOverdue } from "@/server/overdue";
import { buildQueue, queueDateFor, DEFAULT_QUEUE_SIZE } from "@/server/queue";

/**
 * Take a lease, or return false because somebody else holds it.
 *
 * `minIntervalSeconds` doubles as the "has this run recently enough" gate, so a
 * per-minute tick can carry work that is only meant to happen daily without
 * needing its own schedule.
 */
export async function takeLease(input: {
  name: string;
  holdSeconds: number;
  minIntervalSeconds?: number;
}): Promise<boolean> {
  const db = getDb();
  const hold = sql`now() + make_interval(secs => ${input.holdSeconds})`;
  const gate =
    input.minIntervalSeconds && input.minIntervalSeconds > 0
      ? sql`and (${jobLeases.lastRunAt} is null or ${jobLeases.lastRunAt} < now() - make_interval(secs => ${input.minIntervalSeconds}))`
      : sql``;

  const rows = await db
    .insert(jobLeases)
    .values({ name: input.name, lockedUntil: hold, lastRunAt: sql`now()` })
    .onConflictDoUpdate({
      target: jobLeases.name,
      set: { lockedUntil: hold, lastRunAt: sql`now()` },
      setWhere: sql`${jobLeases.lockedUntil} < now() ${gate}`,
    })
    .returning({ name: jobLeases.name });

  return rows.length > 0;
}

/** Give a lease back early, so the next tick can pick the work up. */
export async function releaseLease(name: string, note?: string): Promise<void> {
  await getDb()
    .update(jobLeases)
    .set({ lockedUntil: sql`now() - interval '1 second'`, note: note ?? null })
    .where(eq(jobLeases.name, name));
}

export interface TickReport {
  ranFor: number;
  locations: number;
  recomputed: number;
  queuesBuilt: number;
  attributed: number;
  attributionsSkipped: number;
  autoEnrolled: number;
  steps: { sent: number; deferred: number; stopped: number; completed: number };
  skippedBusy: boolean;
}

const EMPTY_STEPS = { sent: 0, deferred: 0, stopped: 0, completed: 0 };

/**
 * One pass of every scheduled job, bounded by `deadline`.
 *
 * Order matters: recompute due dates before building a queue from them, build the
 * queue before the office opens, attribute before anybody reads the dashboard,
 * and send campaign steps last so the expensive, rate-limited work is what gets
 * cut short when the budget runs out rather than the cheap bookkeeping.
 */
export async function runTick(input: { deadline?: number; now?: Date } = {}): Promise<TickReport> {
  const startedAt = Date.now();
  const deadline = input.deadline ?? startedAt + 20_000;
  const db = getDb();

  const gotTick = await takeLease({ name: "tick", holdSeconds: 120 });
  if (!gotTick) {
    return {
      ranFor: 0,
      locations: 0,
      recomputed: 0,
      queuesBuilt: 0,
      attributed: 0,
      attributionsSkipped: 0,
      autoEnrolled: 0,
      steps: { ...EMPTY_STEPS },
      skippedBusy: true,
    };
  }

  const report: TickReport = {
    ranFor: 0,
    locations: 0,
    recomputed: 0,
    queuesBuilt: 0,
    attributed: 0,
    attributionsSkipped: 0,
    autoEnrolled: 0,
    steps: { ...EMPTY_STEPS },
    skippedBusy: false,
  };

  try {
    const rows = await db
      .select({ location: locations, practice: practices })
      .from(locations)
      .innerJoin(practices, eq(practices.id, locations.practiceId))
      .where(eq(locations.status, "active"));
    report.locations = rows.length;

    for (const { location, practice } of rows) {
      if (Date.now() > deadline) break;
      const visitValueCents = visitValueCentsFor(practice.settings);

      // 1. recompute-overdue — nightly, plus after every import commit.
      if (await takeLease({ name: `recompute:${location.id}`, holdSeconds: 300, minIntervalSeconds: 6 * 3600 })) {
        const result = await recomputeOverdue({ locationId: location.id, today: input.now });
        report.recomputed += result.patientsUpdated;
      }

      // 2. build-call-queue — daily, before opening, in the location's own day.
      if (await takeLease({ name: `queue:${location.id}`, holdSeconds: 300, minIntervalSeconds: 3600 })) {
        await buildQueue({
          locationId: location.id,
          queueDate: queueDateFor(location.timezone, input.now),
          visitValueCents,
          limit: DEFAULT_QUEUE_SIZE,
          today: input.now,
        });
        report.queuesBuilt++;
      }

      // 3. attribute-bookings — cheap, and the dashboard reads it.
      const attribution = await attributeBookingsForLocation({
        locationId: location.id,
        practiceId: practice.id,
      });
      report.attributed += attribution.attributed;
      report.attributionsSkipped += attribution.skippedNoTouch;

      // 4. daily auto-enroll for campaigns that asked for it.
      if (await takeLease({ name: `enroll:${location.id}`, holdSeconds: 300, minIntervalSeconds: 20 * 3600 })) {
        const running = await db
          .select()
          .from(campaigns)
          .where(
            and(
              eq(campaigns.locationId, location.id),
              eq(campaigns.status, "running"),
              eq(campaigns.autoEnroll, true),
            ),
          );
        for (const campaign of running) {
          report.autoEnrolled += await enrollSegment({ campaign, today: input.now });
        }
      }
    }

    // 5. run-campaign-step / send-touch — the consent chokepoint lives inside.
    const outcomes = await runDueSteps({ deadline, now: input.now });
    report.steps = tallySteps(outcomes);
  } finally {
    await releaseLease("tick", `last tick ${new Date().toISOString()}`);
  }

  report.ranFor = Date.now() - startedAt;
  return report;
}

function tallySteps(outcomes: StepOutcome[]): TickReport["steps"] {
  const steps = { ...EMPTY_STEPS };
  for (const o of outcomes) steps[o.result]++;
  return steps;
}

/**
 * Everything for one location, right now, ignoring the "recently enough" gates.
 * Used by the "Refresh" action on the queue screen and after an import commit —
 * an office manager who has just imported 2,890 patients should not have to wait
 * for a cron to see their list.
 */
export async function runForLocation(input: {
  locationId: string;
  practiceId: string;
  timezone: string;
  visitValueCents: number;
  now?: Date;
}): Promise<{ recomputed: number; attributed: number; queueSize: number }> {
  const recompute = await recomputeOverdue({ locationId: input.locationId, today: input.now });
  const attribution = await attributeBookingsForLocation({
    locationId: input.locationId,
    practiceId: input.practiceId,
  });
  const queue = await buildQueue({
    locationId: input.locationId,
    queueDate: queueDateFor(input.timezone, input.now),
    visitValueCents: input.visitValueCents,
    today: input.now,
  });
  return {
    recomputed: recompute.patientsUpdated,
    attributed: attribution.attributed,
    queueSize: queue.tasksCreated + queue.tasksUpdated,
  };
}
