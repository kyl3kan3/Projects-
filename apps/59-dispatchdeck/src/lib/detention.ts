/**
 * src/lib/detention.ts
 *
 * The database side of the detention clock: the sweep that drafts an accessorial
 * line when a stop runs past its free window, and the settle-on-departure call.
 *
 * The arithmetic lives in `detention-clock.ts` (pure, tested, and imported by
 * the cab's ticking client component). This module is server-only — it touches
 * the db client.
 *
 * Two failure modes it is written against:
 *
 *  - **A sweep that drafts forever.** "Arrived and past the free window" stays
 *    true for the rest of time, so a five-minute job inserting on that condition
 *    inserts a line every five minutes. The line is keyed to its stop by a real
 *    column with a unique index (schema.ts) and written with
 *    onConflictDoNothing, so a second insert is refused by the database rather
 *    than by a read-then-write race.
 *  - **A stored figure that goes stale.** The amount is recomputed while the
 *    stop is open and frozen the moment a departure is stamped.
 *
 * No timestamp comparison happens in SQL here. A JS `Date` compared against a
 * `timestamptz` truncates to milliseconds while Postgres keeps microseconds,
 * which is exactly how a sweep finds rows "due" and then never claims them.
 * Rows are selected on `arrived_at IS NOT NULL` and the clock is computed in
 * JavaScript.
 */

import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { accessorialLines, carriers, loads, stops, type Stop } from "@/db/schema";
import {
  detentionConfig,
  detentionDescription,
  detentionState,
  type DetentionConfig,
  type DetentionState,
} from "@/lib/detention-clock";

export {
  DEFAULT_FREE_HOURS,
  DEFAULT_RATE_CENTS,
  billedAccessorialsCents,
  detentionConfig,
  detentionDescription,
  detentionState,
} from "@/lib/detention-clock";
export type { DetentionConfig, DetentionState } from "@/lib/detention-clock";

export interface DetentionSweepResult {
  stopsExamined: number;
  drafted: number;
  updated: number;
  finalised: number;
  /** True when the time budget ran out before every stop was examined. */
  deferred: boolean;
}

/**
 * The five-minute sweep, also reachable from the cron route. Bounded by
 * `deadline` (epoch ms) so a serverless invocation can never run past its
 * duration cap; whatever is left is picked up on the next tick.
 */
export async function sweepDetention(
  opts: { carrierId?: string; now?: Date; deadline?: number } = {},
): Promise<DetentionSweepResult> {
  const db = getDb();
  const now = opts.now ?? new Date();
  const result: DetentionSweepResult = {
    stopsExamined: 0,
    drafted: 0,
    updated: 0,
    finalised: 0,
    deferred: false,
  };

  const conditions = [isNotNull(stops.arrivedAt)];
  if (opts.carrierId) conditions.push(eq(loads.carrierId, opts.carrierId));

  const rows = await db
    .select({ stop: stops, loadId: loads.id, carrierId: loads.carrierId })
    .from(stops)
    .innerJoin(loads, eq(stops.loadId, loads.id))
    .where(and(...conditions));

  if (rows.length === 0) return result;

  const carrierIds = [...new Set(rows.map((r) => r.carrierId))];
  const carrierRows = await db
    .select({ id: carriers.id, settings: carriers.settings })
    .from(carriers)
    .where(inArray(carriers.id, carrierIds));
  const configByCarrier = new Map(
    carrierRows.map((c) => [c.id, detentionConfig(c.settings)] as const),
  );

  for (const row of rows) {
    if (opts.deadline && Date.now() > opts.deadline) {
      result.deferred = true;
      break;
    }
    result.stopsExamined += 1;
    const config = configByCarrier.get(row.carrierId) ?? detentionConfig(null);
    const state = detentionState(row.stop, config, now);
    if (!state.overdue) continue;

    const outcome = await upsertDetentionLine(row.stop, row.loadId, state, config);
    if (outcome === "drafted") result.drafted += 1;
    if (outcome === "updated") result.updated += 1;
    if (outcome === "finalised") result.finalised += 1;
  }

  return result;
}

type UpsertOutcome = "drafted" | "updated" | "finalised" | "untouched";

async function upsertDetentionLine(
  stop: Stop,
  loadId: string,
  state: DetentionState,
  config: DetentionConfig,
): Promise<UpsertOutcome> {
  const db = getDb();
  const description = detentionDescription(stop, state, config);
  const evidence = {
    stopId: stop.id,
    facility: stop.facility ?? undefined,
    arrivedAt: stop.arrivedAt?.toISOString(),
    departedAt: stop.departedAt?.toISOString(),
    freeHours: config.detentionFreeHours,
    rateCents: config.detentionRateCents,
    billableHours: state.billableHours,
    accruing: state.running,
  };

  const existing = await db
    .select()
    .from(accessorialLines)
    .where(and(eq(accessorialLines.stopId, stop.id), eq(accessorialLines.kind, "detention")));

  if (existing.length === 0) {
    const inserted = await db
      .insert(accessorialLines)
      .values({
        loadId,
        stopId: stop.id,
        kind: "detention",
        description,
        amountCents: state.accruedCents,
        evidence,
        status: "draft",
      })
      .onConflictDoNothing()
      .returning({ id: accessorialLines.id });
    return inserted.length > 0 ? "drafted" : "untouched";
  }

  const line = existing[0];
  // A line the driver has already confirmed, billed or rejected is history.
  if (line.status !== "draft") return "untouched";
  if (line.amountCents === state.accruedCents && line.evidence.accruing === state.running) {
    return "untouched";
  }
  await db
    .update(accessorialLines)
    .set({ description, amountCents: state.accruedCents, evidence, updatedAt: new Date() })
    .where(eq(accessorialLines.id, line.id));
  return state.running ? "updated" : "finalised";
}

/**
 * Called the moment a departure is stamped, so the driver sees a final figure
 * without waiting up to five minutes for the sweep.
 */
export async function settleDetentionForStop(stopId: string, now: Date = new Date()): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ stop: stops, loadId: loads.id, carrierId: loads.carrierId })
    .from(stops)
    .innerJoin(loads, eq(stops.loadId, loads.id))
    .where(eq(stops.id, stopId))
    .limit(1);
  if (rows.length === 0) return;
  const [carrier] = await db
    .select({ settings: carriers.settings })
    .from(carriers)
    .where(eq(carriers.id, rows[0].carrierId));
  const config = detentionConfig(carrier?.settings);
  const state = detentionState(rows[0].stop, config, now);
  if (!state.overdue) return;
  await upsertDetentionLine(rows[0].stop, rows[0].loadId, state, config);
}

/** Keep loads.accessorials_cents in step with its billed lines. */
export async function syncAccessorialTotal(loadId: string): Promise<number> {
  const db = getDb();
  const { billedAccessorialsCents } = await import("@/lib/detention-clock");
  const lines = await db
    .select({ amountCents: accessorialLines.amountCents, status: accessorialLines.status })
    .from(accessorialLines)
    .where(eq(accessorialLines.loadId, loadId));
  const total = billedAccessorialsCents(lines);
  await db
    .update(loads)
    .set({ accessorialsCents: total, updatedAt: new Date() })
    .where(eq(loads.id, loadId));
  return total;
}

/** Open (arrived, not departed) stops for a load — what the cab clock renders. */
export async function openStops(loadId: string): Promise<Stop[]> {
  const db = getDb();
  return db
    .select()
    .from(stops)
    .where(and(eq(stops.loadId, loadId), isNotNull(stops.arrivedAt), isNull(stops.departedAt)));
}
