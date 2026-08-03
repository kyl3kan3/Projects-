/**
 * Budgets: burn state, and the alert ladder.
 *
 * The ladder is the part that goes wrong. Two opposite failure modes:
 *
 * - **Never stopping.** "Over budget" stays true for the rest of the month, so a
 *   naive daily sweep messages the team every morning until the 1st. Fixed by
 *   recording each rung that fires and never re-firing it in the same period
 *   (a unique index on (budget, period, threshold) backs this up in the db).
 * - **Going silent.** If the sweep picks the *loosest* crossed rung, a budget
 *   that shoots from 0% to 130% fires "80% used" and then nothing ever again,
 *   because 80 is now recorded and 100 is never selected. Fixed by always
 *   selecting the **tightest** crossed rung, and marking every looser rung as
 *   superseded in the same write.
 *
 * Pure module.
 */

import { daysRemainingInMonth, type ForecastResult } from "@/lib/forecast";

export type BurnLevel = "ok" | "warn" | "over";

export interface BurnState {
  spentMicros: number;
  limitMicros: number;
  /** Spent ÷ limit, unclamped — 1.3 means 30% over. */
  fraction: number;
  projectedMicros: number;
  projectedFraction: number;
  level: BurnLevel;
  daysRemaining: number;
  /** "$3,120 OF $4,000 · RESETS IN 9D" is assembled from these by the UI. */
  resetsInDays: number;
}

/** DESIGN.md: the burn meter turns amber past 80%. */
export const WARN_FRACTION = 0.8;

export function burnState(opts: {
  spentMicros: number;
  limitMicros: number;
  forecast: ForecastResult;
  asOf: Date;
}): BurnState {
  const limit = Math.max(1, opts.limitMicros);
  const fraction = opts.spentMicros / limit;
  const projectedFraction = opts.forecast.projectedMicros / limit;
  const daysRemaining = daysRemainingInMonth(opts.asOf);
  const level: BurnLevel =
    fraction >= 1 ? "over" : fraction >= WARN_FRACTION || projectedFraction >= 1 ? "warn" : "ok";
  return {
    spentMicros: opts.spentMicros,
    limitMicros: opts.limitMicros,
    fraction,
    projectedMicros: opts.forecast.projectedMicros,
    projectedFraction,
    level,
    daysRemaining,
    resetsInDays: daysRemaining,
  };
}

export interface RungDecision {
  /** The rung to alert on. */
  threshold: number;
  /** Whether the trigger was actual spend or the month-end projection. */
  basis: "actual" | "projected";
  /** Looser rungs to record as sent in the same write, so they never fire late. */
  superseded: number[];
}

/**
 * Choose the rung to fire, or null. `alreadySent` is the set of thresholds
 * already recorded for this budget in this month.
 */
export function nextRung(opts: {
  thresholds: number[];
  fraction: number;
  projectedFraction: number;
  alreadySent: number[];
}): RungDecision | null {
  const sent = new Set(opts.alreadySent);
  const rungs = [...new Set(opts.thresholds)].filter((t) => t > 0).sort((a, b) => b - a);
  const actualPct = opts.fraction * 100;
  const projectedPct = opts.projectedFraction * 100;

  for (const threshold of rungs) {
    if (sent.has(threshold)) continue;
    const byActual = actualPct >= threshold;
    // A burn-rate alert: not there yet, but the month-end projection is.
    const byProjection = projectedPct >= threshold;
    if (!byActual && !byProjection) continue;
    return {
      threshold,
      basis: byActual ? "actual" : "projected",
      superseded: rungs.filter((t) => t < threshold && !sent.has(t)),
    };
  }
  return null;
}

/** The alert sentence — specific, and it never says "over budget" when it isn't. */
export function rungMessage(opts: {
  budgetName: string;
  decision: RungDecision;
  state: BurnState;
  formatUsdWhole: (micros: number) => string;
}): string {
  const spent = opts.formatUsdWhole(opts.state.spentMicros);
  const limit = opts.formatUsdWhole(opts.state.limitMicros);
  const projected = opts.formatUsdWhole(opts.state.projectedMicros);
  if (opts.decision.basis === "actual") {
    const pct = Math.round(opts.state.fraction * 100);
    return `${opts.budgetName} is at ${pct}% of budget — ${spent} of ${limit}. Projected ${projected} by month end.`;
  }
  return `${opts.budgetName} is on track to hit ${opts.decision.threshold}% of budget — ${spent} of ${limit} so far, projected ${projected} with ${opts.state.daysRemaining}d left.`;
}

/** Human label for a budget's scope, used in the UI and the alert. */
export function scopeLabel(scope: string, scopeValue: string): string {
  if (scope === "tag") return scopeValue;
  if (scope === "account") return `account ${scopeValue}`;
  return scopeValue;
}
