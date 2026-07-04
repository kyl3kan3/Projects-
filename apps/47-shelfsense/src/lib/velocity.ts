/**
 * src/lib/velocity.ts
 *
 * Sales-velocity math over the sales_daily spine. Pure functions -- no I/O.
 * The forecast worker feeds these; the UI shows their inputs verbatim
 * ("the math" panel), so keep every intermediate value in the result.
 *
 * TODO:
 * - [ ] windowVelocity(days: DailySales[], windowDays): units/day over the
 *       trailing window, ignoring days before the variant's first sale.
 * - [ ] blendVelocity(v7, v30, v90): trend-weighted blend -- weight recent
 *       windows more when accelerating, 30/90 more when flat or falling.
 * - [ ] trendDirection(v7, v30): "rising" | "flat" | "falling" with a
 *       deadband so noise doesn't flip arrows daily.
 * - [ ] confidence(days): "high" | "medium" | "low" from history length
 *       and variance -- volatile SKUs get labeled, not hidden.
 * - [ ] Zero-inventory days must not count as zero demand (stockout days
 *       are censored, not observed zeros) -- exclude them from windows.
 */

export interface DailySales {
  date: string; // ISO yyyy-mm-dd
  unitsSold: number;
  inStock: boolean;
}

export type Trend = "rising" | "flat" | "falling";
export type Confidence = "high" | "medium" | "low";

export function windowVelocity(_days: DailySales[], _windowDays: number): number {
  throw new Error("Not implemented");
}

export function blendVelocity(_v7: number, _v30: number, _v90: number): number {
  throw new Error("Not implemented");
}
