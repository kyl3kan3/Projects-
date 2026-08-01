/**
 * Calendar dates for deadlines.
 *
 * A grant deadline is a **date in the nonprofit's own timezone**, never a UTC
 * instant. "The Kresge report is due 15 September" means the end of 15 September
 * in Detroit; it does not mean 2026-09-15T00:00:00Z, and it must not shift by a
 * day because the org happens to be west of Greenwich or because the clocks
 * changed in March.
 *
 * So the whole module works in **civil dates** — `"YYYY-MM-DD"` strings, exactly
 * what Postgres `date` gives back. Two operations touch a timezone at all:
 *
 *   - `todayIn(tz)` — what today's date *is* for that org right now (Intl does
 *     the zone maths, so it is correct across DST and across the anti-meridian).
 *   - `instantAtLocalHour(...)` — the UTC instant of, say, 08:00 local on a
 *     civil date, used only to decide whether an org's morning send window has
 *     opened yet.
 *
 * Everything else is integer arithmetic on year/month/day, which cannot be
 * bitten by a 23- or 25-hour day. Adding 14 days to 2026-03-22 is 2026-03-08
 * whatever the offset did in between; the same arithmetic done by subtracting
 * `14 * 86400000` from a local `Date` lands on 7 March in US zones and silently
 * fires a reminder a day early once a year.
 */

const DAY_MS = 86_400_000;

/** A calendar date with no time and no zone: "YYYY-MM-DD". */
export type CivilDate = string;

const CIVIL_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isCivilDate(value: string): boolean {
  const m = CIVIL_RE.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  // Reject 31 February and friends by round-tripping through UTC.
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

export function parseCivil(value: string): { year: number; month: number; day: number } {
  const m = CIVIL_RE.exec(value);
  if (!m || !isCivilDate(value)) throw new Error(`Not a calendar date: ${value}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function civil(year: number, month: number, day: number): CivilDate {
  return `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}`;
}

/** Days since 1970-01-01 for a civil date — the unit all comparisons use. */
export function epochDay(value: CivilDate): number {
  const { year, month, day } = parseCivil(value);
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS);
}

export function fromEpochDay(days: number): CivilDate {
  const d = new Date(days * DAY_MS);
  return civil(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

export function addDays(value: CivilDate, days: number): CivilDate {
  return fromEpochDay(epochDay(value) + Math.round(days));
}

/** Whole calendar days from `a` to `b`. Positive when `b` is later. */
export function daysBetween(a: CivilDate, b: CivilDate): number {
  return epochDay(b) - epochDay(a);
}

export function addMonths(value: CivilDate, months: number): CivilDate {
  const { year, month, day } = parseCivil(value);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  // Clamp: 31 January + 1 month is the last day of February, not 3 March.
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return civil(target.getUTCFullYear(), target.getUTCMonth() + 1, Math.min(day, lastDay));
}

/* --------------------------------------------------------- zone boundary --- */

const partsCache = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = partsCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    partsCache.set(timeZone, fmt);
  }
  return fmt;
}

function zonedParts(instant: Date, timeZone: string) {
  const parts = zoneFormatter(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** Is this string a timezone this runtime understands? */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The civil date an instant falls on, in a given zone. */
export function civilInZone(instant: Date, timeZone: string): CivilDate {
  const p = zonedParts(instant, timeZone);
  return civil(p.year, p.month, p.day);
}

/** Today's date for an organization. */
export function todayIn(timeZone: string, now: Date = new Date()): CivilDate {
  return civilInZone(now, timeZone);
}

/** The local wall-clock hour (0-23) for an organization right now. */
export function localHourIn(timeZone: string, now: Date = new Date()): number {
  return zonedParts(now, timeZone).hour;
}

/**
 * The UTC instant of a local wall-clock time on a civil date.
 *
 * Resolved by iteration rather than by an offset table: guess, ask the zone what
 * civil time that instant actually is, and correct by the difference. Two passes
 * converge even across a DST transition. Times that do not exist (02:30 on a
 * spring-forward day) resolve to the instant the clock jumps to, which is the
 * behaviour a send window wants.
 */
export function instantAtLocalHour(
  value: CivilDate,
  hour: number,
  timeZone: string,
): Date {
  const { year, month, day } = parseCivil(value);
  let guess = Date.UTC(year, month - 1, day, hour, 0, 0);
  for (let i = 0; i < 3; i++) {
    const p = zonedParts(new Date(guess), timeZone);
    const actual = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const wanted = Date.UTC(year, month - 1, day, hour, 0, 0);
    const drift = wanted - actual;
    if (drift === 0) break;
    guess += drift;
  }
  return new Date(guess);
}

/* ------------------------------------------------------------- rendering --- */

const MONTHS_SHORT = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS_SHORT = ["S", "M", "T", "W", "T", "F", "S"];

/** "SEP 15" — the mono date used in rows and the calendar. */
export function formatCivilShort(value: CivilDate): string {
  const { month, day } = parseCivil(value);
  return `${MONTHS_SHORT[month - 1]} ${day}`;
}

/** "SEP 15 2026" — used when the year is not obvious. */
export function formatCivilShortWithYear(value: CivilDate): string {
  const { year } = parseCivil(value);
  return `${formatCivilShort(value)} ${year}`;
}

/** "15 September 2026" — long form for email bodies. */
export function formatCivilLong(value: CivilDate): string {
  const { year, month, day } = parseCivil(value);
  return `${day} ${MONTHS_LONG[month - 1]} ${year}`;
}

/** "MAY 2026" — the mono freshness stamp on a funder record. */
export function formatMonthYearUpper(value: CivilDate): string {
  const { year, month } = parseCivil(value);
  return `${MONTHS_SHORT[month - 1]} ${year}`;
}

/** "September 2026" — calendar month header. */
export function formatMonthLabel(value: CivilDate): string {
  const { year, month } = parseCivil(value);
  return `${MONTHS_LONG[month - 1]} ${year}`;
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayIndex(value: CivilDate): number {
  const { year, month, day } = parseCivil(value);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function weekdayLetter(value: CivilDate): string {
  return WEEKDAYS_SHORT[weekdayIndex(value)];
}

/** The Sunday that starts the week containing `value`. */
export function startOfWeek(value: CivilDate): CivilDate {
  return addDays(value, -weekdayIndex(value));
}

/** Seven civil dates, Sunday first. */
export function weekStrip(anchor: CivilDate): CivilDate[] {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/**
 * A month grid, padded to whole weeks so a calendar renders as 5 or 6 rows of 7.
 */
export function monthGrid(anchor: CivilDate): CivilDate[] {
  const { year, month } = parseCivil(anchor);
  const first = civil(year, month, 1);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = civil(year, month, daysInMonth);
  const start = startOfWeek(first);
  const endPad = 6 - weekdayIndex(last);
  const total = daysBetween(start, last) + 1 + endPad;
  return Array.from({ length: total }, (_, i) => addDays(start, i));
}

export function monthOf(value: CivilDate): number {
  return parseCivil(value).month;
}

/**
 * "in 6 days" / "today" / "tomorrow" / "3 days overdue" — always relative to the
 * org's own today, and always derived, never stored.
 */
export function describeDue(dueOn: CivilDate, today: CivilDate): string {
  const delta = daysBetween(today, dueOn);
  if (delta === 0) return "today";
  if (delta === 1) return "tomorrow";
  if (delta === -1) return "1 day overdue";
  if (delta < 0) return `${-delta} days overdue`;
  return `in ${delta} days`;
}

/** Derived, never stored: an incomplete deadline whose date has passed. */
export function isOverdue(
  deadline: { dueOn: CivilDate; completedAt: Date | null },
  today: CivilDate,
): boolean {
  if (deadline.completedAt) return false;
  return daysBetween(today, deadline.dueOn) < 0;
}
