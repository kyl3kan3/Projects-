/**
 * Timezone handling, because every time-of-day statistic in this app is a lie
 * without it.
 *
 * "Trades after 11:30 are net negative" is a claim about the trader's local
 * clock, not about UTC. A New York trader's 11:30 is 16:30 UTC in winter and
 * 15:30 UTC in summer, so bucketing on UTC hours would blur two different
 * halves of the session together and shift the answer twice a year.
 *
 * `Intl.DateTimeFormat` carries the full IANA database in Node and the browser,
 * so it is the source of truth here rather than a date library — one fewer
 * dependency, and no risk of a stale tz table.
 */

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  /** 0 = Sunday, per Date.getDay(). */
  weekday: number;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let fmt = formatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
    });
    formatters.set(timeZone, fmt);
  }
  return fmt;
}

/** Validate a timezone name without throwing at the call site. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export const DEFAULT_TIMEZONE = "America/New_York";

/** Common trading timezones offered in settings. */
export const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
  "UTC",
] as const;

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdayName = get("weekday");
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: Math.max(0, WEEKDAYS.indexOf(weekdayName)),
  };
}

/**
 * How far ahead of UTC the zone is at that instant, in milliseconds.
 * Positive east of Greenwich.
 */
function offsetAt(utcMs: number, timeZone: string): number {
  const p = zonedParts(new Date(utcMs), timeZone);
  // Offsets are whole minutes in every zone in the IANA database since 1972, so
  // seconds and milliseconds carry through unchanged.
  const seconds = new Date(utcMs).getUTCSeconds();
  const millis = new Date(utcMs).getUTCMilliseconds();
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, seconds, millis);
  return asIfUtc - utcMs;
}

/**
 * Turn a wall-clock reading in a zone into the UTC instant it names.
 *
 * Broker CSVs write local time with no offset — ThinkorSwim's "11/4/25 09:31:12"
 * is 09:31 wherever the account is set, which is 13:31Z in November and 14:31Z
 * in July. Importing those as UTC would put every trade in the wrong half-hour
 * bucket and shift them by an hour twice a year.
 *
 * Two passes: guess the offset at the naive instant, correct, then re-check with
 * the corrected instant so a DST boundary within a few hours resolves. In the
 * one hour per year that does not exist locally (the spring-forward gap) the
 * result lands on the hour after the gap, which is the conventional reading.
 */
export function zonedTimeToUtc(
  parts: { year: number; month: number; day: number; hour: number; minute: number; second?: number },
  timeZone: string,
): Date {
  const naive = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second ?? 0,
  );
  let utc = naive - offsetAt(naive, timeZone);
  utc = naive - offsetAt(utc, timeZone);
  return new Date(utc);
}

/** "2026-01-13" in the given zone — the calendar heatmap's cell key. */
export function zonedDateKey(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Minutes since local midnight — the time-of-day bucketing input. */
export function minutesOfDay(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  return p.hour * 60 + p.minute;
}

/** "09:31" in the given zone. */
export function zonedClock(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/** "13:00" from 780 minutes past midnight. */
export function formatMinutesOfDay(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const WEEKDAY_SHORT = WEEKDAYS;

/**
 * Monday-anchored week key for the weekly review, in the trader's zone.
 * Returns the local date of that Monday as "YYYY-MM-DD".
 */
export function weekStartKey(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone);
  const daysSinceMonday = (p.weekday + 6) % 7;
  // Walk back in UTC days from the local date; the local date arithmetic is
  // calendar arithmetic, so it is safe to do on a UTC-anchored midnight.
  const anchor = Date.UTC(p.year, p.month - 1, p.day) - daysSinceMonday * 86_400_000;
  const d = new Date(anchor);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** "13 Jan 2026" from a "YYYY-MM-DD" key — no timezone maths, it is a date. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDateKey(key: string, opts: { year?: boolean } = {}): string {
  const [y, m, d] = key.split("-");
  const month = MONTHS[Number(m) - 1] ?? m;
  return `${Number(d)} ${month}${opts.year === false ? "" : ` ${y}`}`;
}

export function addDaysToKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

/** Human hold time: "4m 12s" · "2h 06m" · "3d". */
export function formatHold(seconds: number | null): string {
  if (seconds === null) return "open";
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, "0")}m`;
  const days = Math.floor(h / 24);
  return `${days}d ${String(h % 24).padStart(2, "0")}h`;
}
