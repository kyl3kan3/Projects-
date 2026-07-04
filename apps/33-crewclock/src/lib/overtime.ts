/**
 * src/lib/overtime.ts
 *
 * Overtime projection and alerting: computes week-to-date hours per
 * worker, projects the week's finish, and decides when the pre-OT alert
 * fires. Alerts inform the owner before OT exists; they never alter pay.
 *
 * TODO:
 * - [ ] weekToDateHours(userId, weekStart): sum closed + running entries
 *       in the org's week (week_starts_on aware, site timezone via
 *       date-fns-tz).
 * - [ ] projectWeekHours(userId, weekStart): week-to-date + expected
 *       remaining days from a trailing 4-week per-weekday average.
 * - [ ] shouldAlert(user, projection): projected hours cross the
 *       worker's overtime_rule threshold AND no overtime_alerts row for
 *       (user_id, week_start) -- one alert per worker per week, enforced
 *       by the unique constraint, not application memory.
 * - [ ] createAlert(user, projection): insert row, enqueue email/SMS
 *       fan-out ("Miguel is at 31.5h Wed; projected 44h Fri").
 * - [ ] computeOvertimeSplit(entries, rule): regular vs OT hours for
 *       payroll export (weekly_40 and daily_8_weekly_40 rules).
 */

import type { OvertimeRule } from "../db/schema";

export interface WeekProjection {
  userId: string;
  weekStart: Date;
  hoursToDate: number;
  projectedHours: number;
  thresholdHours: number;
}

export interface OvertimeSplit {
  regularHours: number;
  overtimeHours: number;
}

export function projectWeekHours(
  _userId: string,
  _weekStart: Date,
): Promise<WeekProjection> {
  throw new Error("Not implemented");
}

export function computeOvertimeSplit(
  _entryIds: string[],
  _rule: OvertimeRule,
): Promise<OvertimeSplit> {
  throw new Error("Not implemented");
}
