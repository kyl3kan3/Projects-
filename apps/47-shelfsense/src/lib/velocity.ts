/**
 * Sales-velocity maths over the `sales_daily` spine. Pure functions, no I/O.
 *
 * Everything here exists to answer one question — *how many units a day does
 * this SKU really sell?* — and to answer it in a way a merchant can audit. The
 * three decisions that make it different from `sum / 30`:
 *
 *  1. **Stockout days are censored, not zero.** A SKU that sold nothing because
 *     it had nothing to sell has no observation for that day. Counting those days
 *     in the denominator is the single most expensive bug in this category: it
 *     divides a real 5/day best-seller down to 1.7/day, under-orders it, and the
 *     stockout repeats forever. Censored days leave both the numerator and the
 *     denominator.
 *
 *  2. **History shorter than the window shrinks the denominator.** A product
 *     launched two weeks ago has a 30-day window containing 14 observed days. Its
 *     velocity is `units / 14`, not `units / 30`.
 *
 *  3. **Blending is trend-aware, and asymmetric on purpose.** When the recent
 *     window is accelerating, the recent window leads — a seasonal spike that
 *     gets averaged against 90 quiet days arrives as a stockout. When it is flat
 *     or falling, the longer windows lead, because one slow week is usually noise
 *     and reacting to it under-orders a healthy SKU.
 *
 * Windows are the trailing *complete* days before `asOf`: a window of 7 ending
 * `asOf = 2026-07-15` covers Jul 8 … Jul 14. The current day is deliberately
 * excluded — the nightly run happens at 02:00 local, so "today" is two hours of
 * data and would halve every velocity if it were counted.
 */

import type { Confidence, Trend } from "@/db/schema";
import { addDays, daysBetween, toEpochDay } from "@/lib/dates";

export interface DailySales {
  /** ISO yyyy-mm-dd. */
  date: string;
  unitsSold: number;
  /** False for a day the variant had nothing to sell — a censored observation. */
  inStock: boolean;
}

export interface WindowStat {
  windowDays: number;
  /** Units sold on observed days only. */
  units: number;
  /** Days in the denominator: in-window, in-stock, and at or after first sale. */
  observedDays: number;
  /** Days dropped because the variant was out of stock. */
  censoredDays: number;
  /** units / observedDays, or 0 when there is nothing to divide by. */
  velocity: number;
  hasData: boolean;
}

export interface VelocityProfile {
  asOf: string;
  w7: WindowStat;
  w30: WindowStat;
  w90: WindowStat;
  blended: number;
  weights: { w7: number; w30: number; w90: number };
  trend: Trend;
  confidence: Confidence;
  /** Observed days across the 90-day window — the history length that matters. */
  observedDays: number;
  /** True when no window had a single observed day: demand is unknown, not zero. */
  demandCensored: boolean;
  /** Coefficient of variation of daily units across observed 90-day history. */
  variation: number;
}

/**
 * A trend flip needs this much relative change, so a SKU's arrow does not
 * flicker between rising and falling on ordinary day-to-day noise.
 */
export const TREND_DEADBAND = 0.15;

/**
 * Below this many units a day, relative comparisons are meaningless — 0.1 vs
 * 0.2/day is a doubling that means "two sales instead of one last month".
 */
const TREND_FLOOR = 0.2;

/**
 * Fewer observed days than this and the number is a hint, not a forecast. Three
 * weeks is the point at which a weekly sales rhythm has repeated enough times to be
 * distinguishable from a launch spike.
 */
const LOW_CONFIDENCE_DAYS = 21;
const HIGH_CONFIDENCE_DAYS = 45;
/** Coefficient of variation above which a SKU is called volatile. */
const HIGH_VARIATION = 1.25;

/* ------------------------------------------------------------- one window --- */

/**
 * Stats for the `windowDays` complete days ending the day before `asOf`.
 *
 * `firstSaleOn`, when known, is the history floor: days before a variant existed
 * are not observations of zero demand either.
 */
export function windowStat(
  days: DailySales[],
  windowDays: number,
  asOf: string,
  firstSaleOn?: string | null,
): WindowStat {
  const from = addDays(asOf, -windowDays);
  const to = addDays(asOf, -1);
  const fromMs = toEpochDay(from);
  const toMs = toEpochDay(to);
  const floorMs = firstSaleOn ? toEpochDay(firstSaleOn) : -Infinity;

  let units = 0;
  let observedDays = 0;
  let censoredDays = 0;

  for (const day of days) {
    const ms = toEpochDay(day.date);
    if (ms < fromMs || ms > toMs) continue;
    if (ms < floorMs) continue;
    if (!day.inStock) {
      censoredDays += 1;
      continue;
    }
    observedDays += 1;
    units += Math.max(0, day.unitsSold);
  }

  return {
    windowDays,
    units,
    observedDays,
    censoredDays,
    velocity: observedDays > 0 ? units / observedDays : 0,
    hasData: observedDays > 0,
  };
}

/** Units per day over the trailing window. Zero when nothing was observed. */
export function windowVelocity(
  days: DailySales[],
  windowDays: number,
  asOf: string,
  firstSaleOn?: string | null,
): number {
  return windowStat(days, windowDays, asOf, firstSaleOn).velocity;
}

/* ------------------------------------------------------------------ trend --- */

/**
 * Direction of travel from the 30-day rate to the 7-day rate.
 *
 * Guarded three ways: a window with no observed days cannot vote, rates below
 * `TREND_FLOOR` are treated as flat, and the change must clear the deadband.
 */
export function trendDirection(
  v7: number,
  v30: number,
  opts: { v7HasData?: boolean; v30HasData?: boolean } = {},
): Trend {
  const { v7HasData = true, v30HasData = true } = opts;
  if (!v7HasData || !v30HasData) return "flat";
  if (v7 < TREND_FLOOR && v30 < TREND_FLOOR) return "flat";
  if (v30 <= 0) return v7 > TREND_FLOOR ? "rising" : "flat";
  const change = (v7 - v30) / v30;
  if (change > TREND_DEADBAND) return "rising";
  if (change < -TREND_DEADBAND) return "falling";
  return "flat";
}

/* ----------------------------------------------------------------- blend --- */

/**
 * Base weights per trend. Rising leans on the 7-day window; flat and falling
 * lean on 30/90, which is the conservative direction for a reorder decision.
 */
const WEIGHTS: Record<Trend, { w7: number; w30: number; w90: number }> = {
  rising: { w7: 0.5, w30: 0.35, w90: 0.15 },
  flat: { w7: 0.2, w30: 0.5, w90: 0.3 },
  falling: { w7: 0.15, w30: 0.45, w90: 0.4 },
};

/**
 * Trend-weighted blend of the three windows.
 *
 * Windows with no observed days are dropped and the remaining weights are
 * renormalised — a SKU that has been out of stock all week must not have its
 * velocity pulled toward zero by an empty 7-day window. That renormalisation is
 * the whole reason this takes `WindowStat`s rather than three numbers.
 */
export function blendWindows(
  w7: WindowStat,
  w30: WindowStat,
  w90: WindowStat,
  trend: Trend = trendDirection(w7.velocity, w30.velocity, {
    v7HasData: w7.hasData,
    v30HasData: w30.hasData,
  }),
): { blended: number; weights: { w7: number; w30: number; w90: number } } {
  const base = WEIGHTS[trend];
  const parts: [keyof typeof base, WindowStat, number][] = [
    ["w7", w7, base.w7],
    ["w30", w30, base.w30],
    ["w90", w90, base.w90],
  ];

  const live = parts.filter(([, stat]) => stat.hasData);
  const total = live.reduce((sum, [, , weight]) => sum + weight, 0);
  if (!live.length || total <= 0) {
    return { blended: 0, weights: { w7: 0, w30: 0, w90: 0 } };
  }

  const weights = { w7: 0, w30: 0, w90: 0 };
  let blended = 0;
  for (const [key, stat, weight] of live) {
    const normalised = weight / total;
    weights[key] = normalised;
    blended += stat.velocity * normalised;
  }
  return { blended, weights };
}

/** Convenience form matching the three-number call in the docs. */
export function blendVelocity(v7: number, v30: number, v90: number): number {
  const stat = (velocity: number, windowDays: number): WindowStat => ({
    windowDays,
    units: velocity * windowDays,
    observedDays: windowDays,
    censoredDays: 0,
    velocity,
    hasData: true,
  });
  return blendWindows(stat(v7, 7), stat(v30, 30), stat(v90, 90)).blended;
}

/* ------------------------------------------------------------ confidence --- */

/** Population coefficient of variation of daily units over observed days. */
export function variationOf(days: DailySales[]): number {
  const observed = days.filter((d) => d.inStock);
  if (observed.length < 2) return 0;
  const mean = observed.reduce((s, d) => s + Math.max(0, d.unitsSold), 0) / observed.length;
  if (mean <= 0) return 0;
  const variance =
    observed.reduce((s, d) => s + (Math.max(0, d.unitsSold) - mean) ** 2, 0) / observed.length;
  return Math.sqrt(variance) / mean;
}

/**
 * How much to trust the blend. Short history or a volatile daily series gets
 * labelled rather than hidden — the merchant decides what to do with a "low"
 * SKU, but they are never shown a confident number that is not one.
 */
export function confidenceFrom(observedDays: number, variation: number): Confidence {
  if (observedDays < LOW_CONFIDENCE_DAYS) return "low";
  if (variation > HIGH_VARIATION) return observedDays >= HIGH_CONFIDENCE_DAYS ? "medium" : "low";
  if (observedDays >= HIGH_CONFIDENCE_DAYS) return "high";
  return "medium";
}

/* ---------------------------------------------------------------- profile --- */

/**
 * The full velocity picture for one variant, as stored in `forecasts.inputs` and
 * rendered by the "show the math" panel.
 */
export function velocityProfile(
  days: DailySales[],
  asOf: string,
  firstSaleOn?: string | null,
): VelocityProfile {
  const w7 = windowStat(days, 7, asOf, firstSaleOn);
  const w30 = windowStat(days, 30, asOf, firstSaleOn);
  const w90 = windowStat(days, 90, asOf, firstSaleOn);

  const trend = trendDirection(w7.velocity, w30.velocity, {
    v7HasData: w7.hasData,
    v30HasData: w30.hasData,
  });
  const { blended, weights } = blendWindows(w7, w30, w90, trend);

  // Variance is measured over the same days the velocity is: in-window, and at or
  // after the first sale. Measuring it over days the variant did not exist for makes
  // every new product look volatile, and volatility is what downgrades confidence.
  const floorMs = firstSaleOn ? toEpochDay(firstSaleOn) : -Infinity;
  const inWindow = days.filter((d) => {
    const ms = toEpochDay(d.date);
    return (
      ms >= toEpochDay(addDays(asOf, -90)) && ms <= toEpochDay(addDays(asOf, -1)) && ms >= floorMs
    );
  });
  const variation = variationOf(inWindow);

  return {
    asOf,
    w7,
    w30,
    w90,
    blended,
    weights,
    trend,
    confidence: confidenceFrom(w90.observedDays, variation),
    observedDays: w90.observedDays,
    demandCensored: !w7.hasData && !w30.hasData && !w90.hasData,
    variation,
  };
}

/**
 * Days in the trailing window on which the variant had nothing to sell.
 *
 * Used to tell two very different SKUs apart: one that sells nothing while fully
 * stocked (dead) and one that sells nothing because it is empty (a stockout that
 * is costing money right now).
 */
export function censoredDaysIn(days: DailySales[], windowDays: number, asOf: string): number {
  return windowStat(days, windowDays, asOf).censoredDays;
}

/** Most recent date with a sale, or null. The dead-stock screen shows it. */
export function lastSaleDate(days: DailySales[]): string | null {
  let latest: string | null = null;
  for (const day of days) {
    if (day.unitsSold > 0 && (!latest || toEpochDay(day.date) > toEpochDay(latest))) {
      latest = day.date;
    }
  }
  return latest;
}

/** Days since the last sale, relative to `asOf`. Null when it never sold. */
export function daysSinceLastSale(days: DailySales[], asOf: string): number | null {
  const last = lastSaleDate(days);
  return last ? daysBetween(last, asOf) : null;
}
