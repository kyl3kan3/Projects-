/**
 * Dates and accounting periods.
 *
 * Every date this product stores is a *calendar* date — the date printed on a
 * receipt, the month a close covers. None of them is an instant, so none of them
 * is a `Date`: they are `YYYY-MM-DD` strings compared as strings, which is exactly
 * how Postgres compares its `date` type. That removes a whole class of timezone
 * drift (a receipt dated the 1st filed into the previous month because the server
 * runs in UTC and the operator is in Denver).
 *
 * Instants — `received_at`, `closed_at` — stay `timestamptz` and are compared by
 * the database, never by JavaScript.
 */

export type IsoDate = string; // YYYY-MM-DD
export type Period = string; // YYYY-MM

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PERIOD_RE = /^\d{4}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (m < 1 || m > 12) return false;
  return d >= 1 && d <= daysInMonth(y, m);
}

export function isPeriod(value: string): boolean {
  if (!PERIOD_RE.test(value)) return false;
  const m = Number(value.slice(5, 7));
  return m >= 1 && m <= 12;
}

export function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

/** Today in the operator's timezone (IANA name), as a calendar date. */
export function today(timeZone = "UTC"): IsoDate {
  return toIsoDate(new Date(), timeZone);
}

export function toIsoDate(instant: Date, timeZone = "UTC"): IsoDate {
  // en-CA gives YYYY-MM-DD, and Intl does the zone maths so we never do it.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

export function periodOf(date: IsoDate): Period {
  return date.slice(0, 7);
}

export function periodStart(period: Period): IsoDate {
  return `${period}-01`;
}

export function periodEnd(period: Period): IsoDate {
  const [y, m] = period.split("-").map(Number);
  return `${period}-${String(daysInMonth(y, m)).padStart(2, "0")}`;
}

/** The day after the period's last day — the exclusive upper bound for a range. */
export function periodEndExclusive(period: Period): IsoDate {
  return addDays(periodEnd(period), 1);
}

export function previousPeriod(period: Period): Period {
  const [y, m] = period.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export function nextPeriod(period: Period): Period {
  const [y, m] = period.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const [y, m, d] = date.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000;
  return toIsoDate(new Date(t), "UTC");
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  const [ay, am, ad] = from.split("-").map(Number);
  const [by, bm, bd] = to.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** Day of week, 0 = Sunday. */
export function dayOfWeek(date: IsoDate): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * ISO-8601 week key, e.g. `2026-W14`. The weekly digest dedupes on this, which is
 * what stops the "notification that never stops" failure: the nudge is pinned to a
 * week, not to a condition that stays true forever.
 */
export function isoWeek(date: IsoDate): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  // Thursday of the current ISO week determines the year and week number.
  const day = (t.getUTCDay() + 6) % 7; // Monday = 0
  t.setUTCDate(t.getUTCDate() - day + 3);
  const isoYear = t.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const week = 1 + Math.round((t.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

const MONTHS = [
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

export function monthName(period: Period): string {
  return MONTHS[Number(period.slice(5, 7)) - 1] ?? period;
}

/** "MARCH" for the current year, "MARCH 2025" for any other — the inbox label. */
export function periodLabel(period: Period, relativeTo: Period): string {
  const name = monthName(period).toUpperCase();
  return period.slice(0, 4) === relativeTo.slice(0, 4) ? name : `${name} ${period.slice(0, 4)}`;
}

/** "Mar 12" / "Mar 12, 2025" — the row's source line. */
export function shortDate(date: IsoDate, relativeToYear?: string): string {
  const [y, m, d] = date.split("-");
  const mon = MONTHS[Number(m) - 1]?.slice(0, 3) ?? m;
  const day = String(Number(d));
  return relativeToYear && y === relativeToYear ? `${mon} ${day}` : `${mon} ${day}, ${y}`;
}

/** MM/DD/YYYY — QuickBooks Online's import format. */
export function usDate(date: IsoDate): string {
  const [y, m, d] = date.split("-");
  return `${m}/${d}/${y}`;
}

/** DD/MM/YYYY — Xero's default statement import format. */
export function xeroDate(date: IsoDate): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}
