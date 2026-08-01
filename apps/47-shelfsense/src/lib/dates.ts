/**
 * Calendar-day arithmetic on `yyyy-mm-dd` strings.
 *
 * The whole forecast domain speaks in local shop days, not instants: a sales day
 * is a day in the merchant's timezone, and "order by Jul 11" is a date, not a
 * timestamp. Doing that arithmetic with `Date` objects means every operation
 * carries a timezone the caller has to remember, and one `new Date("2026-07-01")`
 * parsed as UTC midnight then rendered in a western timezone silently becomes
 * June 30. So dates are strings here, and the only `Date` involved is the UTC
 * anchor used to step across month boundaries.
 */

const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const MONTHS = [
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

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE.test(value);
}

function assertIso(date: string): void {
  if (!ISO_DATE.test(date)) throw new RangeError(`Not a yyyy-mm-dd date: ${JSON.stringify(date)}`);
}

/** yyyy-mm-dd -> the UTC-midnight epoch millis that represent that calendar day. */
export function toEpochDay(date: string): number {
  assertIso(date);
  return Date.parse(`${date}T00:00:00.000Z`);
}

export function fromEpochMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromEpochMs(toEpochDay(date) + Math.trunc(days) * DAY_MS);
}

/** Whole days from `a` to `b`; negative when `b` is earlier. */
export function daysBetween(a: string, b: string): number {
  return Math.round((toEpochDay(b) - toEpochDay(a)) / DAY_MS);
}

export function minDate(a: string, b: string): string {
  return toEpochDay(a) <= toEpochDay(b) ? a : b;
}

export function maxDate(a: string, b: string): string {
  return toEpochDay(a) >= toEpochDay(b) ? a : b;
}

/** Inclusive range, ascending. Guarded so a reversed range yields nothing. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  const end = toEpochDay(to);
  for (let t = toEpochDay(from); t <= end; t += DAY_MS) out.push(fromEpochMs(t));
  return out;
}

/**
 * Today in a shop's timezone, as a calendar date.
 *
 * `Intl.DateTimeFormat` with `en-CA` yields yyyy-mm-dd directly, and it is the
 * only way to get this right without shipping a timezone table. An unknown zone
 * throws, and a shop with a typo in its timezone must not stop the nightly run,
 * so it falls back to UTC.
 */
export function todayInZone(timezone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** The hour (0-23) it currently is in a shop's timezone. */
export function hourInZone(timezone: string, now: Date = new Date()): number {
  try {
    const hour = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone || "UTC",
      hour: "2-digit",
      hour12: false,
    }).format(now);
    return Number(hour) % 24;
  } catch {
    return now.getUTCHours();
  }
}

/** 1 = Monday … 7 = Sunday, ISO-style. */
export function isoWeekday(date: string): number {
  const day = new Date(toEpochDay(date)).getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * ISO week key, e.g. "2026-W31" — the period a weekly digest is pinned to.
 *
 * Pinning a notification to a period is what stops the "still overdue, mail them
 * again" loop: the period can only be sent once, however many times the sweep
 * runs.
 */
export function isoWeekKey(date: string): string {
  // Shift to the Thursday of this ISO week; its calendar year is the ISO year.
  const thursday = addDays(date, 4 - isoWeekday(date));
  const jan1 = `${thursday.slice(0, 4)}-01-01`;
  const week = Math.floor(daysBetween(jan1, thursday) / 7) + 1;
  return `${thursday.slice(0, 4)}-W${String(week).padStart(2, "0")}`;
}

/** "2026-07" — the period a monthly digest is pinned to. */
export function monthKey(date: string): string {
  assertIso(date);
  return date.slice(0, 7);
}

/* ------------------------------------------------------------- formatting --- */

/** "JUL 11" — the mono order-by date in a SKU row. */
export function shortDate(date: string): string {
  assertIso(date);
  return `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`;
}

/** "JUL 11 2026" — used where the year is not obvious (sent PO history). */
export function shortDateWithYear(date: string): string {
  return `${shortDate(date)} ${date.slice(0, 4)}`;
}

/**
 * "JUL 11", or "JUN 10 2031" when the year is not the one the merchant is looking at.
 *
 * A slow-moving SKU legitimately produces an order-by date years out — 212 totes at
 * 0.12/day is a 2031 date, and that arithmetic is correct. Rendering it as "BY JUN 10"
 * is not: it reads as this June, which is the opposite of the truth and the kind of
 * detail that costs the whole product its credibility.
 */
export function shortDateRelativeTo(date: string, reference: string): string {
  return date.slice(0, 4) === reference.slice(0, 4) ? shortDate(date) : shortDateWithYear(date);
}
