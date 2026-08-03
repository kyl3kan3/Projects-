/**
 * src/lib/dates.ts
 *
 * Calendar-day arithmetic, kept away from the rest of the code.
 *
 * A dental visit is a calendar day, not an instant: "last visit 14 Nov 2024" is
 * the same fact in Chicago and in Phoenix. Every date-only value in RecallDesk
 * (visits.visited_on, patients.last_visit_on / next_due_on, call_tasks.queue_date)
 * is therefore stored as **UTC midnight of that calendar day** and compared as
 * such. The alternative — storing whatever instant the importer's machine
 * happened to be in — moves a patient's due date by a day depending on who ran
 * the import.
 *
 * Timezones matter in exactly two places, and both are location-local, not
 * server-local: which day "today" is for a location's call queue, and what hour
 * it is there for quiet hours.
 */

/** Milliseconds in one day. Safe here because every value is UTC midnight. */
const DAY_MS = 86_400_000;

/** UTC midnight of the calendar day a Date falls on. */
export function toDayStart(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

/** "2026-07-17" -> UTC midnight. Returns null for anything unparseable. */
export function fromDayString(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  // Reject 2026-02-31, which Date.UTC would happily roll into March.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

/** UTC midnight -> "2026-07-17". */
export function toDayString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/**
 * Add whole months, clamping the day of month. 31 Jan + 1 month is 28 Feb, not
 * 3 March — a recall due date that skips a month is a patient nobody calls.
 */
export function addMonths(d: Date, months: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const day = d.getUTCDate();
  const lastOfTarget = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, lastOfTarget)));
}

/** Whole days from `a` to `b` (negative when b is earlier). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((toDayStart(b).getTime() - toDayStart(a).getTime()) / DAY_MS);
}

/**
 * Whole months elapsed from `a` to `b`, by calendar (not 30-day blocks).
 * 14 Nov -> 13 May is 5 months; 14 Nov -> 14 May is 6.
 */
export function monthsBetween(a: Date, b: Date): number {
  let months =
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 +
    (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) months -= 1;
  return months;
}

/** The calendar day it is right now in a location's timezone, as "2026-07-17". */
export function todayInTimezone(timeZone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  }
}

/** The hour (0-23) it is right now in a location's timezone. */
export function hourInTimezone(timeZone: string, now: Date = new Date()): number {
  let formatted: string;
  try {
    formatted = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      hour12: false,
    }).format(now);
  } catch {
    formatted = new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      hour: "2-digit",
      hour12: false,
    }).format(now);
  }
  const hour = Number(formatted.slice(0, 2));
  // Some ICU builds render midnight as 24.
  return hour === 24 ? 0 : hour;
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "Nov 2024" — the overdue row's "last visit" form. */
export function formatMonthYear(d: Date): string {
  return `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "14 Nov 2024" — mono dates in ledger rows and receipts. */
export function formatDay(d: Date): string {
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "Nov 14" — compact, for within-the-year timestamps. */
export function formatDayShort(d: Date): string {
  return `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
