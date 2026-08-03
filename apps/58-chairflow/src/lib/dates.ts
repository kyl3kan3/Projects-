/**
 * src/lib/dates.ts
 *
 * Wall-clock arithmetic, kept in one place.
 *
 * ChairFlow's whole domain is a stylist's local day: "Thursday 6:00pm" means six
 * in the evening where the chair is, and a server in another region deciding
 * otherwise is a client who shows up at the wrong hour. So:
 *
 *   - Instants (`starts_at`, `ends_at`, `occurred_at`) are `timestamptz` and are
 *     always true instants in UTC.
 *   - Anything that is a *calendar day* (`week_start_on`, `last_visit_on`,
 *     `next_due_on`, `cycle_key`) is a `YYYY-MM-DD` string, because a visit on
 *     26 June is the same fact in Providence and in Phoenix.
 *
 * The two conversions between those worlds live here and nowhere else. They use
 * `Intl` rather than a timezone library because `Intl` already knows about DST,
 * and a wrong answer twice a year is exactly the bug this file exists to avoid.
 */

const DAY_MS = 86_400_000;

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
}

const partsCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsCache.get(timeZone);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      f = new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    }
    partsCache.set(timeZone, f);
  }
  return f;
}

/** The wall-clock reading of an instant in a timezone. */
export function zonedParts(timeZone: string, at: Date): ZonedParts {
  const parts = formatter(timeZone).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((p) => p.type === type)?.value ?? "0";
    return Number(found);
  };
  // Some ICU builds render midnight as hour 24.
  const hour = get("hour");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: hour === 24 ? 0 : hour,
    minute: get("minute"),
    second: get("second"),
  };
}

/** How far ahead of UTC a zone is at a given instant, in milliseconds. */
function offsetMsAt(timeZone: string, at: Date): number {
  const p = zonedParts(timeZone, at);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asIfUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * A wall-clock reading in a timezone -> the instant it names.
 *
 * Two passes: guess the offset from the naive instant, then re-check it at the
 * corrected instant. That second pass is what makes 02:30 on a spring-forward
 * Sunday resolve rather than land an hour out.
 */
export function zonedTimeToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0);
  let ts = naive - offsetMsAt(timeZone, new Date(naive));
  ts = naive - offsetMsAt(timeZone, new Date(ts));
  return new Date(ts);
}

/** "2026-08-03" + "14:30" in a zone -> the instant. */
export function dayTimeToUtc(timeZone: string, day: string, time: string): Date {
  const d = parseDayString(day);
  const [h, m] = parseHhMm(time);
  if (!d) throw new Error(`Not a calendar day: ${day}`);
  return zonedTimeToUtc(timeZone, d.year, d.month, d.day, h, m);
}

/** "09:30" -> [9, 30]. Anything unparseable is midnight. */
export function parseHhMm(time: string): [number, number] {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return [0, 0];
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const min = Math.min(59, Math.max(0, Number(m[2])));
  return [h, min];
}

export function parseDayString(
  s: string,
): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Reject 2026-02-31, which Date.UTC would happily roll into March.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return { year, month, day };
}

/** The calendar day it is right now where the chair is, as "2026-08-03". */
export function todayInTimezone(timeZone: string, now: Date = new Date()): string {
  const p = zonedParts(timeZone, now);
  return dayString(p.year, p.month, p.day);
}

/** The wall-clock hour (0-23) where the chair is. */
export function hourInTimezone(timeZone: string, now: Date = new Date()): number {
  return zonedParts(timeZone, now).hour;
}

/** The calendar day an instant falls on, in a timezone. */
export function dayOfInstant(timeZone: string, at: Date): string {
  return todayInTimezone(timeZone, at);
}

export function dayString(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Calendar-day arithmetic on the string form. Never a timezone question. */
export function addDaysToDay(day: string, days: number): string {
  const p = parseDayString(day);
  if (!p) return day;
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day) + days * DAY_MS);
  return dayString(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Whole days from `a` to `b` (negative when b is earlier). */
export function daysBetweenDays(a: string, b: string): number {
  const pa = parseDayString(a);
  const pb = parseDayString(b);
  if (!pa || !pb) return 0;
  const ta = Date.UTC(pa.year, pa.month - 1, pa.day);
  const tb = Date.UTC(pb.year, pb.month - 1, pb.day);
  return Math.round((tb - ta) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday, for a calendar day. */
export function weekdayOfDay(day: string): number {
  const p = parseDayString(day);
  if (!p) return 0;
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
}

/** The Monday of the week a calendar day belongs to (rent weeks start Monday). */
export function mondayOfWeek(day: string): string {
  const wd = weekdayOfDay(day);
  // Sunday (0) belongs to the week that started six days earlier.
  const back = wd === 0 ? 6 : wd - 1;
  return addDaysToDay(day, -back);
}

const WEEKDAY_LONG = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "THURSDAY JUL 17" — the Today screen's label. */
export function formatDayLabel(day: string): string {
  const p = parseDayString(day);
  if (!p) return day;
  return `${WEEKDAY_LONG[weekdayOfDay(day)]} ${MONTHS_SHORT[p.month - 1].toUpperCase()} ${p.day}`;
}

/** "Thu Jul 17" — day chips on the booking page. */
export function formatDayChip(day: string): string {
  const p = parseDayString(day);
  if (!p) return day;
  return `${WEEKDAY_SHORT[weekdayOfDay(day)]} ${MONTHS_SHORT[p.month - 1]} ${p.day}`;
}

/** "Jun 26" — the compact form used in ledger lines and client rows. */
export function formatDayShort(day: string): string {
  const p = parseDayString(day);
  if (!p) return day;
  return `${MONTHS_SHORT[p.month - 1]} ${p.day}`;
}

/** "Jun 26, 2026" — receipts, where the year matters. */
export function formatDayFull(day: string): string {
  const p = parseDayString(day);
  if (!p) return day;
  return `${MONTHS_SHORT[p.month - 1]} ${p.day}, ${p.year}`;
}

/** "2:00" / "11:45" — the mono time at the left of a day-strip row. */
export function formatClock(timeZone: string, at: Date): string {
  const p = zonedParts(timeZone, at);
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return `${h12}:${String(p.minute).padStart(2, "0")}`;
}

/** "2:00pm" — where am/pm has to be unambiguous (client-facing copy). */
export function formatClockMeridiem(timeZone: string, at: Date): string {
  const p = zonedParts(timeZone, at);
  return `${formatClock(timeZone, at)}${p.hour < 12 ? "am" : "pm"}`;
}

/** "Thu Jul 17 at 2:00pm" — confirmations and reminders. */
export function formatWhen(timeZone: string, at: Date): string {
  const day = dayOfInstant(timeZone, at);
  return `${formatDayChip(day)} at ${formatClockMeridiem(timeZone, at)}`;
}

/** "Jul 2026" — the ledger's month header. */
export function formatMonth(day: string): string {
  const p = parseDayString(day);
  if (!p) return day;
  return `${MONTHS_SHORT[p.month - 1]} ${p.year}`;
}

/** The first calendar day of the month a day belongs to. */
export function firstOfMonth(day: string): string {
  const p = parseDayString(day);
  if (!p) return day;
  return dayString(p.year, p.month, 1);
}

/** The first calendar day of the month after this one. */
export function firstOfNextMonth(day: string): string {
  const p = parseDayString(day);
  if (!p) return day;
  return p.month === 12 ? dayString(p.year + 1, 1, 1) : dayString(p.year, p.month + 1, 1);
}

/** "in 3 days" / "yesterday" / "today" — cadence and drift lines. */
export function relativeDays(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 0) return `in ${days} days`;
  return `${-days} days ago`;
}

/** "every 3 weeks" from a median interval in days — how a stylist says it. */
export function intervalPhrase(days: number): string {
  if (days <= 0) return "irregular";
  if (days < 11) return `every ${days} days`;
  const weeks = Math.round(days / 7);
  if (weeks <= 8) return `every ${weeks} weeks`;
  const months = Math.round(days / 30.44);
  return `every ${months} months`;
}
