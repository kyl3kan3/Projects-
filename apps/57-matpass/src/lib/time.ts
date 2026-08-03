/**
 * School-local time.
 *
 * Everything a dojo cares about is counted in local days: "61 days in rank",
 * "last seen 19 days ago", "was 3x/week". A student promoted on Tuesday evening
 * and looked at on Wednesday morning is one day into the rank, not zero — so all
 * the arithmetic happens on school-local calendar dates, never on raw instants.
 *
 * The functions here are pure and take the timezone explicitly, which is what
 * makes the progression and retention engines testable without a clock or a
 * database.
 */

const DAY_MS = 86_400_000;

export type DayKey = string; // "YYYY-MM-DD" in the school's timezone

const partsCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      weekday: "short",
    });
    partsCache.set(timeZone, f);
  }
  return f;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface ZonedParts {
  /** "YYYY-MM-DD" in the school's timezone. */
  day: DayKey;
  /** 0 = Sunday, matching class_schedule.weekday. */
  weekday: number;
  /** Minutes from local midnight, matching class_schedule.starts_at_minutes. */
  minutes: number;
}

export function zonedParts(at: Date, timeZone: string): ZonedParts {
  const parts = formatter(timeZone).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = Number(get("hour")) % 24; // en-CA yields "24" at midnight
  const minute = Number(get("minute"));
  const weekdayName = get("weekday");
  return {
    day: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: Math.max(0, WEEKDAYS.indexOf(weekdayName)),
    minutes: hour * 60 + minute,
  };
}

/** The school-local calendar date of an instant, as "YYYY-MM-DD". */
export function dayKey(at: Date, timeZone: string): DayKey {
  return zonedParts(at, timeZone).day;
}

/** Whole days from one calendar date to another. Negative if `to` is earlier. */
export function daysBetween(from: DayKey, to: DayKey): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

export function addDays(day: DayKey, delta: number): DayKey {
  return new Date(Date.parse(`${day}T00:00:00Z`) + delta * DAY_MS).toISOString().slice(0, 10);
}

/**
 * The instant that begins a school-local calendar date, good enough for range
 * queries. Resolved by probing the offset at noon UTC of that date, which is
 * correct for every zone except within the hour a DST transition happens — and a
 * check-in ledger counted in days does not care about that hour.
 */
export function startOfDay(day: DayKey, timeZone: string): Date {
  const midnightUtc = Date.parse(`${day}T00:00:00Z`);
  // First guess from the offset at noon UTC, which is the right offset on all but
  // two days a year. Then re-read the offset *at the guess* and correct: on a
  // spring-forward morning the noon offset is an hour off, which would have put
  // the start of the week an hour early and silently mis-bucketed a day of
  // check-ins. One refinement is enough — DST shifts are never nested.
  let guess = new Date(midnightUtc - offsetMinutesAt(new Date(midnightUtc + 12 * 3_600_000), timeZone) * 60_000);
  guess = new Date(midnightUtc - offsetMinutesAt(guess, timeZone) * 60_000);
  return guess;
}

/** The zone's UTC offset in minutes at an instant, signed so `local = utc + offset`. */
function offsetMinutesAt(at: Date, timeZone: string): number {
  const parts = zonedParts(at, timeZone);
  const localAsUtc = Date.parse(`${parts.day}T00:00:00Z`) + parts.minutes * 60_000;
  return Math.round((localAsUtc - at.getTime()) / 60_000);
}

/** "Jul 17 2026" — the ledger-line date format from DESIGN.md. */
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function formatDay(day: DayKey): string {
  const [y, m, d] = day.split("-");
  return `${MONTHS[Number(m) - 1]} ${Number(d)} ${y}`;
}

export function formatDate(at: Date, timeZone: string): string {
  return formatDay(dayKey(at, timeZone));
}

/** "6:00pm" from minutes-from-midnight. */
export function formatMinutes(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suffix = h24 < 12 ? "am" : "pm";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

export const WEEKDAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];
export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "19 days ago" / "today" / "yesterday" — the retention card's phrasing. */
export function daysAgoPhrase(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}
