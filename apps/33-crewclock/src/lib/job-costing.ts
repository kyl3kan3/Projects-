/**
 * Live labor cost vs bid — the number that decides whether the company makes
 * money. Pure arithmetic here; the database rollup lives in src/lib/jobs.ts.
 *
 * ## Decisions
 *
 * - **Entries carry their own rate.** Every entry was priced at the worker's
 *   loaded rate when it was recorded, so a raise never rewrites last month's
 *   job cost. This module only sums what the entries already say.
 * - **Open shifts count at their running duration**, so the meter ticks while
 *   the crew is on the clock. That is the whole point of "live".
 * - **The projection is arithmetic, not a forecast model.** Two honest numbers:
 *   the bid's hour count priced at the crew mix actually working the job, and
 *   how many days of the current pace remain before the bid's hours are gone.
 *   Neither pretends to know a completion percentage we do not measure.
 * - **Threshold alerts fire once each, ever**, guarded by `budget_alert_*_sent_at`
 *   on the job row — re-running a rollup can never re-alert.
 */

import { SECONDS_PER_HOUR, laborCostCents, secondsToHours } from "@/lib/time";

export interface CostableEntry {
  clockInAt: Date;
  clockOutAt: Date | null;
  breakSeconds: number;
  rateCentsPerHour: number;
}

export interface BidLike {
  bidLaborMinutes: number | null;
  bidLaborCostCents: number | null;
}

export interface JobCostRollup {
  actualSeconds: number;
  actualHours: number;
  actualCostCents: number;
  openShiftCount: number;
  bidMinutes: number | null;
  bidCostCents: number | null;
  /** Percent of the bid dollars spent, or null with no dollar bid. */
  percentOfBidCost: number | null;
  /** Percent of the bid hours burned, or null with no hour bid. */
  percentOfBidHours: number | null;
  /** The percent the cost bar and the alerts use: dollars if bid, else hours. */
  percentOfBid: number | null;
}

/** The one place semantic colour fills width (DESIGN.md). */
export type CostBarState = "under" | "warning" | "over" | "unbid";

export function rollupEntries(entries: CostableEntry[], bid: BidLike, now: Date = new Date()): JobCostRollup {
  let actualSeconds = 0;
  let actualCostCents = 0;
  let openShiftCount = 0;

  for (const entry of entries) {
    const end = entry.clockOutAt ?? now;
    const seconds = Math.max(
      0,
      Math.floor((end.getTime() - entry.clockInAt.getTime()) / 1000) - Math.max(0, entry.breakSeconds),
    );
    if (!entry.clockOutAt) openShiftCount += 1;
    actualSeconds += seconds;
    actualCostCents += laborCostCents(seconds, entry.rateCentsPerHour);
  }

  const bidMinutes = bid.bidLaborMinutes ?? null;
  const bidCostCents = bid.bidLaborCostCents ?? null;
  const percentOfBidCost =
    bidCostCents && bidCostCents > 0 ? (actualCostCents / bidCostCents) * 100 : null;
  const percentOfBidHours =
    bidMinutes && bidMinutes > 0 ? (actualSeconds / (bidMinutes * 60)) * 100 : null;

  return {
    actualSeconds,
    actualHours: secondsToHours(actualSeconds),
    actualCostCents,
    openShiftCount,
    bidMinutes,
    bidCostCents,
    percentOfBidCost,
    percentOfBidHours,
    percentOfBid: percentOfBidCost ?? percentOfBidHours,
  };
}

export function costBarState(percentOfBid: number | null): CostBarState {
  if (percentOfBid === null) return "unbid";
  if (percentOfBid > 100) return "over";
  if (percentOfBid >= 80) return "warning";
  return "under";
}

/** Fraction of the bar to paint, clamped — a 300% overrun still draws full. */
export function costBarFill(percentOfBid: number | null): number {
  if (percentOfBid === null) return 0;
  return Math.max(0, Math.min(1, percentOfBid / 100));
}

/* ------------------------------------------------------------ projection --- */

export interface FinishProjection {
  /** The bid's hours priced at the crew mix actually on the job. */
  projectedCostCents: number | null;
  /** Positive = over bid at that point. */
  projectedOverrunCents: number | null;
  /** Blended actual cost per hour so far, in cents. */
  blendedRateCentsPerHour: number | null;
  /** Days of the current pace before the bid's hours are exhausted. */
  daysUntilBidHoursExhausted: number | null;
  /** Distinct local days that contributed hours — the pace's denominator. */
  basisDays: number;
}

export function projectFinish(
  rollup: JobCostRollup,
  opts: { basisDays: number } = { basisDays: 0 },
): FinishProjection {
  const blendedRateCentsPerHour =
    rollup.actualSeconds > 0
      ? Math.round((rollup.actualCostCents * SECONDS_PER_HOUR) / rollup.actualSeconds)
      : null;

  if (rollup.bidMinutes === null || blendedRateCentsPerHour === null) {
    return {
      projectedCostCents: null,
      projectedOverrunCents: null,
      blendedRateCentsPerHour,
      daysUntilBidHoursExhausted: null,
      basisDays: opts.basisDays,
    };
  }

  const bidHours = rollup.bidMinutes / 60;
  // Never project below what has already been spent.
  const projectedHours = Math.max(bidHours, rollup.actualHours);
  const projectedCostCents = Math.round(projectedHours * blendedRateCentsPerHour);
  const projectedOverrunCents =
    rollup.bidCostCents === null ? null : projectedCostCents - rollup.bidCostCents;

  const hoursPerDay = opts.basisDays > 0 ? rollup.actualHours / opts.basisDays : null;
  const remainingBidHours = Math.max(0, bidHours - rollup.actualHours);
  const daysUntilBidHoursExhausted =
    hoursPerDay && hoursPerDay > 0 ? Math.round((remainingBidHours / hoursPerDay) * 10) / 10 : null;

  return {
    projectedCostCents,
    projectedOverrunCents,
    blendedRateCentsPerHour,
    daysUntilBidHoursExhausted,
    basisDays: opts.basisDays,
  };
}

/* ------------------------------------------------------ threshold alerts --- */

export type BudgetThreshold = 80 | 100;

/**
 * Which budget alert (if any) this rollup should fire. Each threshold fires at
 * most once for the life of the job: the caller passes the timestamps already
 * stored on the job row, so re-running a rollup is always a no-op.
 *
 * When a job jumps straight past 100% between two rollups, the 100% alert is
 * the one that fires — the owner does not need to be told about 80% by an alert
 * that arrives at the same moment as "over budget".
 */
export function budgetThresholdToFire(
  percentOfBid: number | null,
  sent: { at80: Date | null; at100: Date | null },
): BudgetThreshold | null {
  if (percentOfBid === null) return null;
  if (percentOfBid >= 100 && !sent.at100) return 100;
  if (percentOfBid >= 80 && percentOfBid < 100 && !sent.at80) return 80;
  return null;
}
