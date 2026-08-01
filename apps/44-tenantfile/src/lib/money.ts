/**
 * Money and calendar primitives.
 *
 * Every amount in TenantFile is an integer number of cents. Nothing here ever
 * produces a float that another function might round a second time: each helper
 * takes cents in and gives cents out, and rounding happens exactly once, at the
 * documented place.
 *
 * Calendar dates are `YYYY-MM-DD` strings, not Date objects. A rent charge is
 * due on a calendar day; the moment that day begins depends on where the tenant
 * is standing, which is a question the ledger must never have to ask.
 */

export type IsoDate = string; // YYYY-MM-DD
export type Period = string; // YYYY-MM

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m;
  const month = Number(mo);
  if (month < 1 || month > 12) return false;
  const day = Number(d);
  return day >= 1 && day <= daysInMonth(Number(y), month);
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

/** The calendar day in UTC — used to date charges from a request timestamp. */
export function isoDateOf(instant: Date): IsoDate {
  return instant.toISOString().slice(0, 10);
}

/** Midnight UTC of a calendar date, for comparing against timestamps. */
export function isoDateToUtc(date: IsoDate): Date {
  const { year, month, day } = parseIsoDate(date);
  return new Date(Date.UTC(year, month - 1, day));
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = isoDateToUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDateOf(d);
}

/** Whole days from `a` to `b` (negative when b precedes a). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((isoDateToUtc(b).getTime() - isoDateToUtc(a).getTime()) / 86_400_000);
}

export function compareDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function periodOf(date: IsoDate): Period {
  return date.slice(0, 7);
}

export function periodParts(period: Period): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) throw new Error(`Not a YYYY-MM period: ${period}`);
  return { year: Number(m[1]), month: Number(m[2]) };
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

/**
 * The day rent falls due inside a period. A due day of 31 in February means the
 * last day of February, not March 3rd — the tenant's rent day cannot wander.
 */
export function dueDateFor(period: Period, dueDay: number): IsoDate {
  const { year, month } = periodParts(period);
  const clamped = Math.min(Math.max(1, Math.trunc(dueDay)), daysInMonth(year, month));
  return toIsoDate(year, month, clamped);
}

/* ------------------------------------------------------------- proration --- */

/**
 * Rent for part of a month, by the days-in-that-month method (the convention a
 * landlord can defend line by line: the tenant pays for the nights they hold
 * the keys, priced at that month's own daily rate).
 *
 * Rounding is half-up on the final cent and happens exactly once. Charging a
 * full month through this function returns the full rent unchanged, so no
 * tenancy can lose a cent to "proration" of a whole month.
 */
export function prorateCents(
  monthlyRentCents: number,
  year: number,
  month: number,
  daysOccupied: number,
): number {
  const total = daysInMonth(year, month);
  const days = Math.min(Math.max(0, Math.trunc(daysOccupied)), total);
  if (days === total) return monthlyRentCents;
  if (days === 0) return 0;
  return Math.round((monthlyRentCents * days) / total);
}

/**
 * The first month's rent for a tenancy starting mid-period: the tenant pays from
 * `startsOn` through the end of that calendar month, inclusive of the start day.
 */
export function prorateFirstMonth(monthlyRentCents: number, startsOn: IsoDate): number {
  const { year, month, day } = parseIsoDate(startsOn);
  const total = daysInMonth(year, month);
  return prorateCents(monthlyRentCents, year, month, total - day + 1);
}

/**
 * The final month's rent for a term ending mid-period: the tenant pays from the
 * 1st through `endsOn`, inclusive of the last day they hold the keys.
 */
export function prorateLastMonth(monthlyRentCents: number, endsOn: IsoDate): number {
  const { year, month, day } = parseIsoDate(endsOn);
  return prorateCents(monthlyRentCents, year, month, day);
}

/* ------------------------------------------------------------ formatting --- */

/** `184500` → `"$1,845.00"`. Never used for arithmetic. */
export function formatMoney(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const dollars = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, "0");
  const grouped = dollars.toLocaleString("en-US");
  return `${negative ? "-" : ""}$${grouped}.${rest}`;
}

/** `184500` → `"$1,845"` when whole, `"$1,845.50"` when not. For tight rows. */
export function formatMoneyShort(cents: number): string {
  return cents % 100 === 0 ? formatMoney(cents).replace(/\.00$/, "") : formatMoney(cents);
}

/**
 * Parse a landlord-typed amount into cents. Accepts "1850", "1,850", "$1850.50",
 * "1850.5". Rejects anything else rather than guessing — a mistyped rent becomes
 * a wrong ledger for a year.
 */
export function parseMoneyToCents(input: string): number {
  const cleaned = input.trim().replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new Error(`Enter an amount like 1850 or 1850.00 (got "${input}")`);
  }
  const negative = cleaned.startsWith("-");
  const [whole, frac = ""] = cleaned.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return negative ? -cents : cents;
}

/** `"2026-08"` → `"AUG 2026"` — the mono period label from DESIGN.md. */
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export function formatPeriod(period: Period): string {
  const { year, month } = periodParts(period);
  return `${MONTHS[month - 1]} ${year}`;
}

/** `"2026-08-01"` → `"AUG 1"`; with year when it is not the current one. */
export function formatDate(date: IsoDate, opts: { year?: boolean } = {}): string {
  const { year, month, day } = parseIsoDate(date);
  return `${MONTHS[month - 1]} ${day}${opts.year ? ` ${year}` : ""}`;
}

export function monthInitial(month: number): string {
  return MONTHS[month - 1]!.slice(0, 1);
}
