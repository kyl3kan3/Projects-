/**
 * Month-end forecasting.
 *
 * Two ways to project, and the difference matters. A month-to-date run rate
 * (`mtd / elapsed × month`) is stable but wrong whenever spend changed partway
 * through — which is exactly the situation this product exists to catch. A
 * trailing-window rate reflects the estate as it is *now*, which is what an
 * engineer wants to know after a spike.
 *
 * So: use the trailing complete days when there are enough of them, and fall
 * back to the MTD run rate on the first days of a month. The projection always
 * includes what has already been spent, so it can never come out below MTD.
 *
 * Pure module.
 */

import { DAY_MS, hoursElapsedInMonth, hoursInMonth } from "@/lib/dates";

export interface ForecastInput {
  /** Spend so far this month, micro-dollars. */
  mtdMicros: number;
  /** Now. */
  asOf: Date;
  /**
   * Complete-day totals, oldest first, ending with yesterday. Partial days are
   * the caller's problem to exclude: including today drags the rate down all
   * morning and the forecast would visibly sag every night.
   */
  recentDailyMicros: number[];
}

export interface ForecastResult {
  projectedMicros: number;
  /** "trailing-7d" or "run-rate", so the UI can be honest about the method. */
  method: "trailing" | "run-rate";
  /** Micro-dollars per day the projection assumes from here. */
  dailyRateMicros: number;
}

const MIN_TRAILING_DAYS = 3;
const TRAILING_WINDOW = 7;

export function forecastMonth(input: ForecastInput): ForecastResult {
  const elapsedHours = hoursElapsedInMonth(input.asOf);
  const remainingHours = Math.max(0, hoursInMonth(input.asOf) - elapsedHours);

  const window = input.recentDailyMicros.slice(-TRAILING_WINDOW);
  if (window.length >= MIN_TRAILING_DAYS) {
    const dailyRate = window.reduce((a, b) => a + b, 0) / window.length;
    return {
      projectedMicros: Math.round(input.mtdMicros + (dailyRate / 24) * remainingHours),
      method: "trailing",
      dailyRateMicros: Math.round(dailyRate),
    };
  }

  const hourlyRate = input.mtdMicros / elapsedHours;
  return {
    projectedMicros: Math.round(input.mtdMicros + hourlyRate * remainingHours),
    method: "run-rate",
    dailyRateMicros: Math.round(hourlyRate * 24),
  };
}

/**
 * "Top movers": services whose spend moved most between two equal windows, by
 * absolute dollars. Percentages alone put a $0.02→$0.06 service at the top of a
 * $40k bill, which is why this ranks on dollars and shows the percentage second.
 */
export interface MoverInput {
  key: string;
  currentMicros: number;
  previousMicros: number;
}

export interface Mover extends MoverInput {
  deltaMicros: number;
}

export function topMovers(rows: MoverInput[], limit = 3): Mover[] {
  return rows
    .map((r) => ({ ...r, deltaMicros: r.currentMicros - r.previousMicros }))
    .filter((r) => r.deltaMicros !== 0)
    .sort((a, b) => Math.abs(b.deltaMicros) - Math.abs(a.deltaMicros))
    .slice(0, limit);
}

/** Whole days left in the month at `asOf`, floored, never negative. */
export function daysRemainingInMonth(asOf: Date): number {
  const nextMonth = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + 1, 1));
  return Math.max(0, Math.floor((nextMonth.getTime() - asOf.getTime()) / DAY_MS));
}
