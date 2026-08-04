/**
 * src/lib/dates.ts
 *
 * Calendar dates as `YYYY-MM-DD` strings, never `Date` objects.
 *
 * A rental window is calendar days: the chairs leave on Saturday and come back
 * on Sunday, and which instant "Saturday" starts at depends on where the yard is
 * standing. `new Date("2026-08-08")` is midnight UTC — August 7th in Texas —
 * which is precisely the off-by-one that double-books a Saturday. So the whole
 * availability domain speaks in date strings and this module owns the
 * arithmetic. `Date` appears only where an instant is genuinely meant (a
 * signature timestamp, a hold's authorisation time).
 *
 * It is also the reason no `Date` is ever interpolated into a raw `sql`
 * fragment: there are no Dates to interpolate. A `date` column round-trips as a
 * string through postgres.js and stays one all the way to the screen.
 */

export type IsoDate = string; // YYYY-MM-DD

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isIsoDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return false;
  const day = Number(m[3]);
  return day >= 1 && day <= daysInMonth(Number(m[1]), month);
}

export function parseIsoDate(date: IsoDate): { year: number; month: number; day: number } {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Not a YYYY-MM-DD date: ${date}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function toIsoDate(year: number, month: number, day: number): IsoDate {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Midnight UTC of a calendar date. For arithmetic only, never for display. */
export function isoDateToUtc(date: IsoDate): Date {
  const { year, month, day } = parseIsoDate(date);
  return new Date(Date.UTC(year, month - 1, day));
}

/** The calendar day of an instant, in UTC. */
export function isoDateOf(instant: Date): IsoDate {
  return instant.toISOString().slice(0, 10);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = isoDateToUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDateOf(d);
}

export function addMonths(date: IsoDate, months: number): IsoDate {
  const { year, month, day } = parseIsoDate(date);
  const zero = year * 12 + (month - 1) + months;
  const y = Math.floor(zero / 12);
  const mo = (zero % 12) + 1;
  return toIsoDate(y, mo, Math.min(day, daysInMonth(y, mo)));
}

/** Whole days from `a` to `b`; negative when `b` precedes `a`. */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((isoDateToUtc(b).getTime() - isoDateToUtc(a).getTime()) / 86_400_000);
}

export function compareDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minDate(a: IsoDate, b: IsoDate): IsoDate {
  return a <= b ? a : b;
}

export function maxDate(a: IsoDate, b: IsoDate): IsoDate {
  return a >= b ? a : b;
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(date: IsoDate): number {
  return isoDateToUtc(date).getUTCDay();
}

export function isWeekendDay(date: IsoDate): boolean {
  const d = dayOfWeek(date);
  return d === 0 || d === 6;
}

/** Every date in the half-open window `[from, to)`. Bounded to 400 days. */
export function datesInWindow(from: IsoDate, to: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  let cursor = from;
  for (let i = 0; i < 400 && cursor < to; i++) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

/** The Monday of the ISO week containing `date`. */
export function startOfWeek(date: IsoDate): IsoDate {
  const dow = dayOfWeek(date);
  return addDays(date, -((dow + 6) % 7));
}

export function startOfMonth(date: IsoDate): IsoDate {
  const { year, month } = parseIsoDate(date);
  return toIsoDate(year, month, 1);
}

/* ------------------------------------------------------------ formatting --- */

const MONTHS_SHORT = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DOW_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** `"2026-08-08"` → `"AUG 8"`, or `"AUG 8 2026"` with the year. */
export function formatDate(date: IsoDate, opts: { year?: boolean } = {}): string {
  const { year, month, day } = parseIsoDate(date);
  return `${MONTHS_SHORT[month - 1]} ${day}${opts.year ? ` ${year}` : ""}`;
}

/** `"2026-08-08"` → `"SAT AUG 8"` — the yard reads the weekday first. */
export function formatDateWithDow(date: IsoDate): string {
  return `${DOW_SHORT[dayOfWeek(date)]} ${formatDate(date)}`;
}

/** `"2026-08-08"` → `"August 8, 2026"` — for contracts and notices. */
export function formatDateLong(date: IsoDate): string {
  const { year, month, day } = parseIsoDate(date);
  return `${MONTHS_LONG[month - 1]} ${day}, ${year}`;
}

export function monthName(month: number): string {
  return MONTHS_LONG[month - 1] ?? "";
}

export function dowShort(index: number): string {
  return DOW_SHORT[index] ?? "";
}

/**
 * The rental window as a sentence: `"SAT AUG 8 → SUN AUG 9 · 1 day"`. The arrow
 * matters — staff misread "Aug 8–9" as "two days" and priced it twice.
 */
export function formatWindow(from: IsoDate, to: IsoDate): string {
  const days = Math.max(1, daysBetween(from, to));
  return `${formatDateWithDow(from)} → ${formatDateWithDow(to)} · ${days} day${days === 1 ? "" : "s"}`;
}

/** An instant, for audit lines: `"AUG 8 2026, 14:32"` in UTC. */
export function formatInstant(instant: Date): string {
  const hh = String(instant.getUTCHours()).padStart(2, "0");
  const mm = String(instant.getUTCMinutes()).padStart(2, "0");
  return `${formatDate(isoDateOf(instant), { year: true })}, ${hh}:${mm}`;
}
