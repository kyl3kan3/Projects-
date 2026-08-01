/**
 * Overtime: the regular/OT split for payroll, and the mid-week projection that
 * lets an owner rebalance a schedule *before* overtime exists.
 *
 * Everything here is pure. The database-backed sweep that uses it lives in
 * src/lib/tick.ts.
 *
 * ## Decisions
 *
 * - **A shift belongs to the local day it started on.** A crew that clocks in
 *   at 22:00 Tuesday and out at 02:30 Wednesday worked Tuesday's shift; that is
 *   how construction payroll reads it, and it keeps a daily-8 rule from
 *   splitting one continuous shift across two days.
 * - **Truncation happens exactly once**, at the end, on each of the two output
 *   figures. Splitting first and truncating last means a week never loses more
 *   than 70 seconds, and never gains any (see src/lib/time.ts).
 * - **Alerts inform; they never alter pay.** Actual OT is computed at export
 *   time from the entries, whether or not an alert ever fired.
 */

import type { OvertimeRule } from "@/db/schema";
import {
  SECONDS_PER_HOUR,
  localDateKey,
  toCentihours,
  weekDateKeys,
  workedSeconds,
  type ShiftLike,
} from "@/lib/time";

/** One local day's worth of worked seconds. */
export interface DayBucket {
  dateKey: string;
  seconds: number;
}

export interface OvertimeSplit {
  regularSeconds: number;
  overtimeSeconds: number;
  regularCentihours: number;
  overtimeCentihours: number;
}

export const DAILY_OT_THRESHOLD_SECONDS = 8 * SECONDS_PER_HOUR;

/** Bucket shifts into local days by the day the shift *started*. */
export function bucketByLocalDay(
  shifts: ShiftLike[],
  timeZone: string,
  now: Date = new Date(),
): DayBucket[] {
  const totals = new Map<string, number>();
  for (const shift of shifts) {
    const key = localDateKey(shift.clockInAt, timeZone);
    totals.set(key, (totals.get(key) ?? 0) + workedSeconds(shift, now));
  }
  return [...totals.entries()]
    .map(([dateKey, seconds]) => ({ dateKey, seconds }))
    .sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1));
}

/** The weekly threshold a rule enforces. `none` means never any overtime. */
export function weeklyThresholdHours(rule: OvertimeRule, orgThresholdHours: number): number {
  return rule === "none" ? Infinity : orgThresholdHours;
}

/**
 * Regular vs overtime for one payroll week.
 *
 *  - `weekly_40`: everything past the weekly threshold is OT.
 *  - `daily_8_weekly_40`: hours past 8 in a day are OT first; the weekly
 *    threshold then applies to what is left, so an hour is never counted twice
 *    (the California shape, minus double-time which is post-MVP).
 *  - `none`: exempt — all hours are regular.
 */
export function computeOvertimeSplit(
  days: DayBucket[],
  rule: OvertimeRule,
  orgThresholdHours = 40,
): OvertimeSplit {
  const total = days.reduce((sum, d) => sum + Math.max(0, d.seconds), 0);

  if (rule === "none") return finish(total, 0);

  const thresholdSeconds = orgThresholdHours * SECONDS_PER_HOUR;

  if (rule === "weekly_40") {
    const overtime = Math.max(0, total - thresholdSeconds);
    return finish(total - overtime, overtime);
  }

  // daily_8_weekly_40
  let dailyOvertime = 0;
  let regularBase = 0;
  for (const day of days) {
    const seconds = Math.max(0, day.seconds);
    const over = Math.max(0, seconds - DAILY_OT_THRESHOLD_SECONDS);
    dailyOvertime += over;
    regularBase += seconds - over;
  }
  const weeklyOvertime = Math.max(0, regularBase - thresholdSeconds);
  return finish(regularBase - weeklyOvertime, dailyOvertime + weeklyOvertime);
}

function finish(regularSeconds: number, overtimeSeconds: number): OvertimeSplit {
  return {
    regularSeconds,
    overtimeSeconds,
    regularCentihours: toCentihours(regularSeconds),
    overtimeCentihours: toCentihours(overtimeSeconds),
  };
}

/* ------------------------------------------------------------ projection --- */

export interface ProjectionInput {
  /** Exact hours worked so far in the payroll week. */
  hoursToDate: number;
  /** Days-of-week (0=Sun) still to come in the week, excluding today if today
   *  is already counted in `hoursToDate`. */
  remainingDaysOfWeek: number[];
  /** Trailing 4-week average hours per day-of-week; missing = no history. */
  weekdayAverageHours: Partial<Record<number, number>>;
  /** Used when a weekday has no history: the worker's mean worked-day so far. */
  fallbackDailyHours: number;
}

/**
 * Project the week's finishing hours. Deliberately conservative: a weekday with
 * no history contributes the worker's own average worked day, not a guess of 8.
 */
export function projectWeekHours(input: ProjectionInput): number {
  let projected = input.hoursToDate;
  for (const dow of input.remainingDaysOfWeek) {
    const average = input.weekdayAverageHours[dow];
    projected += average !== undefined ? average : input.fallbackDailyHours;
  }
  return Math.round(projected * 100) / 100;
}

export interface AlertDecision {
  shouldAlert: boolean;
  reason:
    | "projected_over_threshold"
    | "already_over_threshold"
    | "under_threshold"
    | "no_time_left"
    | "exempt";
}

/**
 * Should the pre-OT alert fire?
 *
 * The whole value is timing: an alert once the worker has *already* crossed the
 * line is the report everyone else sends. So we require (a) the projection to
 * cross, (b) the worker not to have crossed yet, and (c) at least one day left
 * in which a schedule change could still matter.
 *
 * One-per-worker-per-week is not decided here — it is a unique constraint on
 * `overtime_alerts (user_id, week_start)`. Application memory is not a guarantee.
 */
export function shouldAlertOvertime(input: {
  hoursToDate: number;
  projectedHours: number;
  thresholdHours: number;
  remainingDays: number;
}): AlertDecision {
  if (!Number.isFinite(input.thresholdHours)) return { shouldAlert: false, reason: "exempt" };
  if (input.hoursToDate >= input.thresholdHours) {
    return { shouldAlert: false, reason: "already_over_threshold" };
  }
  if (input.remainingDays <= 0) return { shouldAlert: false, reason: "no_time_left" };
  if (input.projectedHours <= input.thresholdHours) {
    return { shouldAlert: false, reason: "under_threshold" };
  }
  return { shouldAlert: true, reason: "projected_over_threshold" };
}

/**
 * The days of a payroll week that have not started yet, in the site's zone.
 * "Today" is excluded — its hours are already inside `hoursToDate`.
 */
export function remainingDaysOfWeek(
  weekStart: string,
  todayKey: string,
): { keys: string[]; daysOfWeek: number[] } {
  const keys = weekDateKeys(weekStart).filter((k) => k > todayKey);
  return {
    keys,
    daysOfWeek: keys.map((k) => {
      const [y, m, d] = k.split("-").map(Number);
      return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    }),
  };
}
