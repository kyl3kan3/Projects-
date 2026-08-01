/**
 * Calendar-date helpers.
 *
 * Dues live on calendar days, not instants. An invoice due "April 1" is due on
 * April 1 in the association's town, and nothing about that should shift because
 * a server is in UTC. So every date in the dues engine is an ISO `YYYY-MM-DD`
 * string, and all arithmetic goes through UTC midnight — which makes day counts
 * exact and immune to daylight saving.
 */

export type IsoDate = string; // YYYY-MM-DD

const DAY_MS = 86_400_000;

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Parse `YYYY-MM-DD` to the Date at UTC midnight. Throws on anything else. */
export function parseIso(value: IsoDate): Date {
  if (!isIsoDate(value)) throw new Error(`Not an ISO date: ${value}`);
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    throw new Error(`Not a real calendar date: ${value}`);
  }
  return date;
}

export function toIso(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function today(now: Date = new Date()): IsoDate {
  return toIso(now);
}

export function addDays(value: IsoDate, days: number): IsoDate {
  return toIso(new Date(parseIso(value).getTime() + days * DAY_MS));
}

/** Whole days from `a` to `b`. Negative when `b` is earlier. */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / DAY_MS);
}

/** Inclusive day count: Jan 1 → Jan 31 is 31 days. */
export function daysInclusive(from: IsoDate, to: IsoDate): number {
  return daysBetween(from, to) + 1;
}

export function compareIso(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minIso(a: IsoDate, b: IsoDate): IsoDate {
  return a <= b ? a : b;
}

export function maxIso(a: IsoDate, b: IsoDate): IsoDate {
  return a >= b ? a : b;
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/** Build an ISO date, clamping the day to the month's length (Feb 31 → Feb 28). */
export function isoFrom(year: number, month1: number, day: number): IsoDate {
  const clamped = Math.min(Math.max(day, 1), daysInMonth(year, month1));
  return `${String(year).padStart(4, "0")}-${String(month1).padStart(2, "0")}-${String(
    clamped,
  ).padStart(2, "0")}`;
}

export function addMonths(value: IsoDate, months: number): IsoDate {
  const d = parseIso(value);
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const month1 = (total % 12) + 1;
  return isoFrom(year, month1, d.getUTCDate());
}

/** "Apr 1, 2026" — the format invoices and rows use. */
const MONTHS = [
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

export function formatIso(value: IsoDate | null | undefined): string {
  if (!value) return "—";
  const d = parseIso(value);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** "Apr 1" — same date without the year, for in-period contexts. */
export function formatIsoShort(value: IsoDate): string {
  const d = parseIso(value);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

export { MONTHS };
