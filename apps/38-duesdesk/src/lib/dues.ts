/**
 * The dues calendar: assessment schedules → billing periods → per-household
 * amounts. Pure functions only, so every number here is unit-testable without
 * a database.
 *
 * Two decisions worth knowing before reading:
 *
 *  1. **Periods are anchored to `startsOn`, not to the calendar.** A quarterly
 *     schedule that starts Feb 1 bills Feb–Apr, May–Jul, and so on. Labels are
 *     still calendar-derived so they read the way a board minute-book does.
 *  2. **Proration is by inclusive days owned.** A household that closed on
 *     May 12 pays for May 12 through the end of the period, counting both
 *     endpoints — the day you take the keys is a day you owe dues for.
 */

import type { AssessmentSchedule, Cadence, LateFeePolicy } from "@/db/schema";
import {
  addDays,
  addMonths,
  compareIso,
  daysBetween,
  daysInclusive,
  formatIsoShort,
  isoFrom,
  maxIso,
  minIso,
  parseIso,
  type IsoDate,
} from "@/lib/dates";
import { proportion } from "@/lib/money";

export interface BillingPeriod {
  label: string;
  start: IsoDate;
  end: IsoDate;
  dueOn: IsoDate;
}

/** How many months one period of each cadence covers. */
export function monthsPerPeriod(cadence: Cadence): number {
  switch (cadence) {
    case "monthly":
      return 1;
    case "quarterly":
      return 3;
    case "annual":
      return 12;
    case "one_time":
      return 0;
  }
}

/** Human label for a period, derived from its first day. */
export function periodLabel(cadence: Cadence, start: IsoDate, scheduleName: string): string {
  const d = parseIso(start);
  const year = d.getUTCFullYear();
  const month1 = d.getUTCMonth() + 1;
  switch (cadence) {
    case "monthly":
      return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][month1 - 1]} ${year}`;
    case "quarterly":
      return `Q${Math.floor((month1 - 1) / 3) + 1} ${year}`;
    case "annual":
      // A fiscal year that doesn't start in January is named for both years, so
      // "FY 2026-27" can never be mistaken for the 2026 calendar year.
      return month1 === 1 ? `${year} Annual` : `FY ${year}-${String((year + 1) % 100).padStart(2, "0")}`;
    case "one_time":
      return scheduleName;
  }
}

export type ScheduleShape = Pick<
  AssessmentSchedule,
  "cadence" | "amountCents" | "dueDay" | "startsOn" | "endsOn" | "name" | "prorate"
>;

/**
 * The period containing `index` steps after the schedule's start.
 * `index` 0 is the first period.
 */
export function periodAt(schedule: ScheduleShape, index: number): BillingPeriod | null {
  const months = monthsPerPeriod(schedule.cadence);

  if (schedule.cadence === "one_time") {
    if (index !== 0) return null;
    const end = schedule.endsOn ?? schedule.startsOn;
    return {
      label: periodLabel("one_time", schedule.startsOn, schedule.name),
      start: schedule.startsOn,
      end,
      dueOn: dueDateFor(schedule, schedule.startsOn),
    };
  }

  const start = addMonths(schedule.startsOn, months * index);
  if (schedule.endsOn && compareIso(start, schedule.endsOn) > 0) return null;
  // The period runs to the day before the next one begins.
  const end = addDays(addMonths(schedule.startsOn, months * (index + 1)), -1);
  return {
    label: periodLabel(schedule.cadence, start, schedule.name),
    start,
    end: schedule.endsOn ? minIso(end, schedule.endsOn) : end,
    dueOn: dueDateFor(schedule, start),
  };
}

/**
 * The due date for a period: `dueDay` of the period's opening month, never
 * earlier than the period itself begins.
 */
function dueDateFor(schedule: ScheduleShape, start: IsoDate): IsoDate {
  const d = parseIso(start);
  const candidate = isoFrom(d.getUTCFullYear(), d.getUTCMonth() + 1, schedule.dueDay);
  return maxIso(candidate, start);
}

/** Every period of the schedule that has begun on or before `asOf`. */
export function periodsThrough(
  schedule: ScheduleShape,
  asOf: IsoDate,
  maxPeriods = 60,
): BillingPeriod[] {
  const out: BillingPeriod[] = [];
  for (let i = 0; i < maxPeriods; i++) {
    const period = periodAt(schedule, i);
    if (!period) break;
    if (compareIso(period.start, asOf) > 0) break;
    out.push(period);
  }
  return out;
}

/**
 * Periods a scheduled run should generate today.
 *
 * Deliberately bounded to periods that opened in the last `lookbackDays`. A
 * schedule backdated to 2023 should not silently mail a household eight
 * quarters of invoices the first time the cron fires; the treasurer generates
 * historical periods explicitly, from the schedule screen, where the preview
 * shows exactly what will be created.
 */
export function periodsToGenerate(
  schedule: ScheduleShape,
  asOf: IsoDate,
  lookbackDays = 31,
): BillingPeriod[] {
  const floor = addDays(asOf, -lookbackDays);
  return periodsThrough(schedule, asOf).filter((p) => compareIso(p.start, floor) >= 0);
}

/** The period a given day falls inside, if any. */
export function periodContaining(
  schedule: ScheduleShape,
  day: IsoDate,
): BillingPeriod | null {
  for (let i = 0; i < 240; i++) {
    const period = periodAt(schedule, i);
    if (!period) return null;
    if (compareIso(day, period.start) < 0) return null;
    if (compareIso(day, period.end) <= 0) return period;
  }
  return null;
}

/* -------------------------------------------------------------- proration --- */

export interface HouseholdTenure {
  joinedOn: IsoDate;
  leftOn: IsoDate | null;
}

export interface AssessedAmount {
  amountCents: number;
  /** Null when the household owns the whole period. */
  prorationNote: string | null;
  daysCovered: number;
  daysInPeriod: number;
}

/**
 * What one household owes for one period.
 *
 * Returns null when the household did not hold the unit during the period at
 * all — a seller must not receive the next quarter's bill, and a buyer must not
 * receive the last one.
 */
export function assessForHousehold(
  schedule: ScheduleShape,
  period: BillingPeriod,
  tenure: HouseholdTenure,
): AssessedAmount | null {
  const from = maxIso(period.start, tenure.joinedOn);
  const to = tenure.leftOn ? minIso(period.end, tenure.leftOn) : period.end;
  if (compareIso(from, to) > 0) return null;

  const daysInPeriod = daysInclusive(period.start, period.end);
  const daysCovered = daysInclusive(from, to);

  if (!schedule.prorate || daysCovered === daysInPeriod) {
    return {
      amountCents: schedule.amountCents,
      prorationNote:
        daysCovered === daysInPeriod
          ? null
          : `Full period charged: proration is off for ${schedule.name}.`,
      daysCovered,
      daysInPeriod,
    };
  }

  const amountCents = proportion(schedule.amountCents, daysCovered, daysInPeriod);
  const reason = compareIso(tenure.joinedOn, period.start) > 0
    ? `joined ${formatIsoShort(tenure.joinedOn)}`
    : `left ${formatIsoShort(tenure.leftOn as IsoDate)}`;
  return {
    amountCents,
    prorationNote: `Prorated — ${reason}. ${daysCovered} of ${daysInPeriod} days.`,
    daysCovered,
    daysInPeriod,
  };
}

/* --------------------------------------------------------------- late fees --- */

export const NO_LATE_FEE: LateFeePolicy = {
  graceDays: 10,
  kind: "none",
  flatCents: 0,
  percentBps: 0,
  maxCents: 0,
};

export const DEFAULT_LATE_FEE: LateFeePolicy = {
  graceDays: 10,
  kind: "flat",
  flatCents: 1500,
  percentBps: 0,
  maxCents: 0,
};

/** The first day a late fee may be charged: grace runs through `dueOn + grace`. */
export function graceEndsOn(dueOn: IsoDate, policy: LateFeePolicy): IsoDate {
  return addDays(dueOn, Math.max(0, policy.graceDays));
}

export function isPastGrace(dueOn: IsoDate, policy: LateFeePolicy, asOf: IsoDate): boolean {
  return daysBetween(graceEndsOn(dueOn, policy), asOf) > 0;
}

/** Days past the due date. Zero or negative means not yet due. */
export function daysPastDue(dueOn: IsoDate, asOf: IsoDate): number {
  return daysBetween(dueOn, asOf);
}

/* ------------------------------------------------------------------ aging --- */

export type AgingBucket = "current" | "30" | "60" | "90";

/**
 * AR aging for the delinquency chips (DESIGN.md: All / 30 / 60 / 90+).
 *
 * The fourth bucket is everything past 60 days. The chip reads "90+" because
 * that is the redlined label, and every row alongside it prints the exact age
 * ("overdue 71 days"), so the collapse can never mislead anybody.
 */
export function agingBucket(dueOn: IsoDate, asOf: IsoDate): AgingBucket {
  const days = daysPastDue(dueOn, asOf);
  if (days <= 0) return "current";
  if (days <= 30) return "30";
  if (days <= 60) return "60";
  return "90";
}

export const AGING_LABELS: Record<AgingBucket, string> = {
  current: "Current",
  "30": "1-30 days",
  "60": "31-60 days",
  "90": "Over 60 days",
};
