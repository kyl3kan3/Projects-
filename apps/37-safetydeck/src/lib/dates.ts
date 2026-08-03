/**
 * Date arithmetic, all of it on `YYYY-MM-DD` strings.
 *
 * Everything in this product that matters is a calendar date, not an instant: a
 * cert expires on a day, a talk is due on a weekday, the 300A is posted between
 * February 1 and April 30. Doing that arithmetic on `Date` objects in the
 * server's zone is how a cert quietly expires a day early for half the year, so
 * the only `Date` used here is a UTC-anchored one used as a calendar, plus
 * `Intl` to ask what day it is in the company's own zone.
 *
 * Pure module: no database, no environment. Safe to import into a client
 * component.
 */

export type IsoDate = string; // YYYY-MM-DD

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  return ISO.test(value);
}

function parts(iso: IsoDate): [number, number, number] {
  const m = ISO.exec(iso);
  if (!m) throw new Error(`Not an ISO date: ${iso}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** Midnight UTC on that calendar day — a stable anchor for day arithmetic. */
export function isoToUtc(iso: IsoDate): Date {
  const [y, m, d] = parts(iso);
  return new Date(Date.UTC(y, m - 1, d));
}

export function utcToIso(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

/** The calendar date it is *right now* in a given IANA zone. */
export function todayIso(zone: string, now: Date = new Date()): IsoDate {
  // en-CA formats as YYYY-MM-DD, which is exactly the shape we want.
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return utcToIso(now);
  }
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const d = isoToUtc(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return utcToIso(d);
}

export function addMonths(iso: IsoDate, months: number): IsoDate {
  const [y, m, d] = parts(iso);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  // Clamp: three months after Nov 30 is the last day of February, not March 2.
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return utcToIso(target);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((isoToUtc(b).getTime() - isoToUtc(a).getTime()) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(iso: IsoDate): number {
  return isoToUtc(iso).getUTCDay();
}

/** The Monday of the ISO week containing `iso`. */
export function weekStart(iso: IsoDate): IsoDate {
  const day = weekday(iso);
  const back = day === 0 ? 6 : day - 1;
  return addDays(iso, -back);
}

/**
 * The date of `targetWeekday` inside the same Monday-anchored week as `iso`.
 * A crew whose talk day is Wednesday gets Wednesday of that week, whether the
 * sweep runs on Monday or Friday.
 */
export function weekdayInWeekOf(weekOf: IsoDate, targetWeekday: number): IsoDate {
  const offset = targetWeekday === 0 ? 6 : targetWeekday - 1;
  return addDays(weekStart(weekOf), offset);
}

export function year(iso: IsoDate): number {
  return parts(iso)[0];
}

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
] as const;

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function dayName(weekdayIndex: number): string {
  return DAY_NAMES[((weekdayIndex % 7) + 7) % 7];
}

/** "MAR 16" — the mono label used on rows and stamps. */
export function monthDay(iso: IsoDate): string {
  const [, m, d] = parts(iso);
  return `${MONTHS[m - 1]} ${String(d).padStart(2, "0")}`;
}

/** "MAR 16 2026" — used where the year is load-bearing. */
export function monthDayYear(iso: IsoDate): string {
  return `${monthDay(iso)} ${parts(iso)[0]}`;
}

/** "08/14/26" — the cert-row expiry format from DESIGN.md. */
export function slashDate(iso: IsoDate): string {
  const [y, m, d] = parts(iso);
  return `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}/${String(y).slice(2)}`;
}

/** "07:12" in the given zone — device-time stamps and sync times. */
export function clockTime(at: Date, zone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(at);
  } catch {
    return at.toISOString().slice(11, 16);
  }
}

/** "07:12 · MAR 16" — the sign-off stamp. */
export function stampLabel(at: Date, zone: string): string {
  return `${clockTime(at, zone)} · ${monthDay(todayIso(zone, at))}`;
}

/** Whole hours between two instants, floored — the 8/24-hour duty clocks. */
export function hoursBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 3_600_000);
}

/** "6h 20m left" / "4h overdue" for the severe-incident duty clock. */
export function countdownLabel(deadline: Date, now: Date): string {
  const ms = deadline.getTime() - now.getTime();
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  const body = h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
  return ms >= 0 ? `${body} LEFT` : `${body} OVERDUE`;
}
