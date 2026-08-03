/**
 * Money and calendar primitives.
 *
 * Every amount in UnitKeeper is an integer number of cents. Nothing here
 * produces a float that another function might round a second time: each helper
 * takes cents in and gives cents out, and rounding happens exactly once, at the
 * documented place.
 *
 * Calendar dates are `YYYY-MM-DD` strings, never Date objects. A lien waiting
 * period ends on a calendar day; a court counts days, not milliseconds, and the
 * moment a day begins depends on where the yard is standing. `new Date("2026-06-12")`
 * is midnight UTC, which is June 11th in Texas — the kind of off-by-one that
 * voids a sale. So the whole domain speaks in date strings and this module owns
 * the arithmetic.
 */

export type IsoDate = string; // YYYY-MM-DD
export type Period = string; // YYYY-MM

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return false;
  const day = Number(m[3]);
  return day >= 1 && day <= daysInMonth(Number(m[1]), month);
}

/** Days in a 1-indexed month. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function parseIsoDate(date: IsoDate): { year: number; month: number; day: number } {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Not a YYYY-MM-DD date: ${date}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function toIsoDate(year: number, month: number, day: number): IsoDate {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The calendar day, in UTC — used to date a charge from a request timestamp. */
export function isoDateOf(instant: Date): IsoDate {
  return instant.toISOString().slice(0, 10);
}

/** Midnight UTC of a calendar date. Only for arithmetic, never for display. */
export function isoDateToUtc(date: IsoDate): Date {
  const { year, month, day } = parseIsoDate(date);
  return new Date(Date.UTC(year, month - 1, day));
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

/** Whole days from `a` to `b` (negative when b precedes a). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((isoDateToUtc(b).getTime() - isoDateToUtc(a).getTime()) / 86_400_000);
}

export function compareDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function maxDate(a: IsoDate, b: IsoDate): IsoDate {
  return a >= b ? a : b;
}

export function periodOf(date: IsoDate): Period {
  return date.slice(0, 7);
}

export function periodParts(period: Period): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) throw new Error(`Not a YYYY-MM period: ${period}`);
  const month = Number(m[2]);
  if (month < 1 || month > 12) throw new Error(`Not a YYYY-MM period: ${period}`);
  return { year: Number(m[1]), month };
}

export function addMonthsToPeriod(period: Period, months: number): Period {
  const { year, month } = periodParts(period);
  const zero = year * 12 + (month - 1) + months;
  const y = Math.floor(zero / 12);
  const mo = (zero % 12) + 1;
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}`;
}

export function comparePeriods(a: Period, b: Period): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Whole months from `a` to `b`. */
export function monthsBetween(a: Period, b: Period): number {
  const pa = periodParts(a);
  const pb = periodParts(b);
  return pb.year * 12 + pb.month - (pa.year * 12 + pa.month);
}

/**
 * The day rent falls due inside a period. A due day of 31 in February is the last
 * day of February, not March 3rd — a tenant's rent day cannot wander.
 */
export function dueDateFor(period: Period, dueDay: number): IsoDate {
  const { year, month } = periodParts(period);
  const clamped = Math.min(Math.max(1, Math.trunc(dueDay)), daysInMonth(year, month));
  return toIsoDate(year, month, clamped);
}

/* ------------------------------------------------------------- proration --- */

/**
 * Rent for part of a month, by that month's own daily rate — the method an owner
 * can defend line by line: the tenant pays for the nights they hold the unit.
 *
 * Rounding is half-up on the final cent and happens exactly once. A full month
 * through this function returns the full rent unchanged, so no tenancy loses a
 * cent to the proration of a whole month.
 */
export function prorateCents(
  monthlyRateCents: number,
  year: number,
  month: number,
  daysOccupied: number,
): number {
  const total = daysInMonth(year, month);
  const days = Math.min(Math.max(0, Math.trunc(daysOccupied)), total);
  if (days === total) return monthlyRateCents;
  if (days === 0) return 0;
  return Math.round((monthlyRateCents * days) / total);
}

/**
 * The first month's rent for a move-in mid-month: the tenant pays from
 * `startedOn` through the end of that calendar month, inclusive of the move-in
 * day. `full_month` owners charge the whole month regardless — both rules exist
 * in the wild and the owner picks one in Settings.
 */
export function prorateFirstMonth(
  monthlyRateCents: number,
  startedOn: IsoDate,
  rule: "daily" | "full_month" = "daily",
): number {
  if (rule === "full_month") return monthlyRateCents;
  const { year, month, day } = parseIsoDate(startedOn);
  return prorateCents(monthlyRateCents, year, month, daysInMonth(year, month) - day + 1);
}

/**
 * What the tenant owes — or is owed — for the month they move out in.
 * `full_month` owners refund nothing, which is the norm in self-storage and is
 * printed on the lease; a daily-prorate owner credits the unused days.
 */
export function prorateLastMonth(
  monthlyRateCents: number,
  endedOn: IsoDate,
  rule: "daily" | "full_month" = "daily",
): number {
  if (rule === "full_month") return monthlyRateCents;
  const { year, month, day } = parseIsoDate(endedOn);
  return prorateCents(monthlyRateCents, year, month, day);
}

/* ------------------------------------------------------------ formatting --- */

/** `184500` → `"$1,845.00"`. Never used for arithmetic. */
export function formatMoney(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const dollars = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}$${dollars.toLocaleString("en-US")}.${rest}`;
}

/** `184500` → `"$1,845"` when whole, `"$1,845.50"` when not. For tight rows. */
export function formatMoneyShort(cents: number): string {
  return cents % 100 === 0 ? formatMoney(cents).replace(/\.00$/, "") : formatMoney(cents);
}

/**
 * Parse an owner-typed amount into cents. Accepts "185", "1,850", "$185.50".
 * Rejects anything else rather than guessing — a mistyped rate becomes a wrong
 * ledger for a year.
 */
export function parseMoneyToCents(input: string): number {
  const cleaned = input.trim().replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new Error(`Enter an amount like 185 or 185.00 (got "${input}")`);
  }
  const negative = cleaned.startsWith("-");
  const [whole, frac = ""] = cleaned.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return negative ? -cents : cents;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** `"2026-08"` → `"AUG 2026"`. */
export function formatPeriod(period: Period): string {
  const { year, month } = periodParts(period);
  return `${MONTHS[month - 1]} ${year}`;
}

/** `"2026-08-01"` → `"AUG 1"`; with the year when asked. */
export function formatDate(date: IsoDate, opts: { year?: boolean } = {}): string {
  const { year, month, day } = parseIsoDate(date);
  return `${MONTHS[month - 1]} ${day}${opts.year ? ` ${year}` : ""}`;
}

/** `"2026-06-12"` → `"June 12, 2026"` — for notices and hard-stop sentences. */
export function formatDateLong(date: IsoDate): string {
  const { year, month, day } = parseIsoDate(date);
  return `${MONTHS_LONG[month - 1]} ${day}, ${year}`;
}
