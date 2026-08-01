/**
 * Schedule maths for backup policies.
 *
 * Two properties matter more than anything else in this file, because getting
 * either wrong is the failure mode customers pay us to eliminate:
 *
 * **Drift-safety.** The next run is always computed from the cron expression in
 * the policy's own timezone, never as `lastRun + interval`. Interval arithmetic
 * accumulates the runtime of every job: an hourly backup that takes four
 * minutes slides to :04, :08, :12 and by the end of a week it is running at a
 * different hour than the customer configured.
 *
 * **Miss detection, not miss replay.** When the scheduler has been down, the
 * skipped slots are *counted* and reported (the dead-man's switch), and then the
 * clock jumps to the next future slot. Replaying eleven missed hourly slots at
 * once would hammer the customer's database at the worst possible moment.
 */

import { parseExpression } from "cron-parser";
import type { DrillFrequency, Frequency } from "@/db/schema";

export class ScheduleError extends Error {}

/** A slot passing by this much with no job is treated as missed. */
export const MISS_GRACE_MS = 15 * 60 * 1000;

export interface ScheduleInput {
  frequency: Frequency;
  /** Hour of day for daily schedules (0–23), ignored when hourly. */
  hour?: number;
  /** Minute past the hour (0–59). Spreading customers across the hour matters. */
  minute?: number;
}

/**
 * Build the cron expression for a policy. Only two shapes exist at MVP —
 * hourly at a fixed minute, and daily at a fixed hour:minute — which is why the
 * cron field is derived rather than free-typed.
 */
export function cronFor({ frequency, hour = 4, minute = 0 }: ScheduleInput): string {
  const m = clamp(minute, 0, 59);
  if (frequency === "hourly") return `${m} * * * *`;
  return `${m} ${clamp(hour, 0, 23)} * * *`;
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** Pull hour/minute back out of a stored cron expression, for the editor. */
export function parseScheduleFields(cron: string): { hour: number; minute: number } {
  const [minute, hour] = cron.trim().split(/\s+/);
  const m = Number(minute);
  const h = Number(hour);
  return {
    minute: Number.isFinite(m) ? clamp(m, 0, 59) : 0,
    hour: Number.isFinite(h) ? clamp(h, 0, 23) : 4,
  };
}

function expression(cron: string, timezone: string, currentDate: Date) {
  try {
    return parseExpression(cron, { currentDate, tz: timezone });
  } catch (err) {
    throw new ScheduleError(
      `Invalid schedule "${cron}" in timezone "${timezone}": ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}

/** The first slot strictly after `from`, in the policy's timezone. */
export function nextRunAfter(cron: string, timezone: string, from: Date): Date {
  return expression(cron, timezone, from).next().toDate();
}

/** The most recent slot at or before `from`. */
export function previousRunBefore(cron: string, timezone: string, from: Date): Date {
  return expression(cron, timezone, from).prev().toDate();
}

/**
 * How many slots between `lastSlot` (exclusive) and `now` (inclusive) went by.
 * One is normal — that is the slot being run right now. More than one means the
 * scheduler was not running, which is exactly what the watchdog alerts on.
 *
 * Capped so a policy that has been disabled for a year cannot spin here.
 */
export function countDueSlots(
  cron: string,
  timezone: string,
  lastSlot: Date,
  now: Date,
  cap = 1000,
): number {
  if (now <= lastSlot) return 0;
  const iter = expression(cron, timezone, lastSlot);
  let count = 0;
  while (count < cap) {
    const next = iter.next().toDate();
    if (next > now) break;
    count++;
  }
  return count;
}

/**
 * Where the policy's clock should point after running the slot at `slot`.
 * Always a future time, so an overlapping tick cannot pick the policy up twice.
 */
export function advanceNextRun(cron: string, timezone: string, now: Date): Date {
  return nextRunAfter(cron, timezone, now);
}

/** True when a slot has gone by unserviced for longer than the grace window. */
export function isMissed(nextRunAt: Date, now: Date, graceMs = MISS_GRACE_MS): boolean {
  return now.getTime() - nextRunAt.getTime() > graceMs;
}

/** When the next drill should run for a cadence. `none` disables drills. */
export function nextDrillAfter(cadence: DrillFrequency, from: Date): Date | null {
  if (cadence === "none") return null;
  const next = new Date(from.getTime());
  next.setUTCDate(next.getUTCDate() + (cadence === "weekly" ? 7 : 30));
  return next;
}

/** Retention horizon for a snapshot taken at `from`. */
export function expiryFor(retentionDays: number, from: Date): Date {
  const expires = new Date(from.getTime());
  expires.setUTCDate(expires.getUTCDate() + Math.max(1, Math.floor(retentionDays)));
  return expires;
}

/** Plain-language description of a policy's schedule, for the policy editor. */
export function describeSchedule(
  frequency: Frequency,
  cron: string,
  timezone: string,
): string {
  const { hour, minute } = parseScheduleFields(cron);
  const mm = String(minute).padStart(2, "0");
  if (frequency === "hourly") return `Every hour at :${mm}`;
  return `Every day at ${String(hour).padStart(2, "0")}:${mm} ${timezone}`;
}

// The timezone list and validator live in timezones.ts so client components can
// import them without pulling cron-parser into the browser bundle.
export { COMMON_TIMEZONES, isValidTimezone } from "@/lib/timezones";
