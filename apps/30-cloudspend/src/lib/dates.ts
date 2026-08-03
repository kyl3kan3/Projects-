/**
 * Time buckets.
 *
 * AWS bills in UTC and Cost Explorer's hourly grain is UTC, so the whole
 * product reasons in UTC and says so in the UI ("TUE 14:00 UTC"). Inventing a
 * local month boundary would make "month to date" disagree with the invoice.
 *
 * Pure module — no db, no env. Safe in a client component.
 */

export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

export function floorHour(d: Date): Date {
  const out = new Date(d.getTime());
  out.setUTCMinutes(0, 0, 0);
  return out;
}

export function addHours(d: Date, hours: number): Date {
  return new Date(d.getTime() + hours * HOUR_MS);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/** `2026-07-14` in UTC. */
export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** `2026-07-14T09` in UTC — the cost-fact grain. */
export function hourKey(d: Date): string {
  return d.toISOString().slice(0, 13);
}

/** First instant of the UTC month containing `d`. */
export function monthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** First instant of the next UTC month. */
export function nextMonthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

export function previousMonthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
}

/** `2026-07-01` — the budget period key. */
export function monthKey(d: Date): string {
  return dayKey(monthStart(d));
}

/** `JULY` — used in "+8% VS JULY". */
const MONTH_NAMES = [
  "JANUARY",
  "FEBRUARY",
  "MARCH",
  "APRIL",
  "MAY",
  "JUNE",
  "JULY",
  "AUGUST",
  "SEPTEMBER",
  "OCTOBER",
  "NOVEMBER",
  "DECEMBER",
];

export function monthName(d: Date): string {
  return MONTH_NAMES[d.getUTCMonth()];
}

export function daysInMonth(d: Date): number {
  return Math.round((nextMonthStart(d).getTime() - monthStart(d).getTime()) / DAY_MS);
}

/**
 * Fraction of the month elapsed at `asOf`, in hours, never zero. Used for
 * run-rate forecasting: dividing by zero on the first minute of the month would
 * produce an infinite forecast.
 */
export function hoursElapsedInMonth(asOf: Date): number {
  const elapsed = (asOf.getTime() - monthStart(asOf).getTime()) / HOUR_MS;
  return Math.max(1, elapsed);
}

export function hoursInMonth(d: Date): number {
  return daysInMonth(d) * 24;
}

const DOW_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** The seasonality key: UTC day-of-week (0=Sunday) and hour. */
export function dowHour(d: Date): { dow: number; hour: number } {
  return { dow: d.getUTCDay(), hour: d.getUTCHours() };
}

/** `TUE 14:02` — deploy and onset timestamps. */
export function stampShort(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${DOW_NAMES[d.getUTCDay()]} ${hh}:${mm}`;
}

/** `Tue 14:00 UTC` — the Slack card's "Since" field. */
export function stampUtc(d: Date): string {
  const name = DOW_NAMES[d.getUTCDay()];
  const title = name[0] + name.slice(1).toLowerCase();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${title} ${hh}:${mm} UTC`;
}

/** `9h`, `3d 4h`, `41m` — elapsed time, always computed as-of-now. */
export function durationShort(fromMs: number, toMs: number): string {
  const ms = Math.max(0, toMs - fromMs);
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

/** The 14-day window the dashboard chart shows, as day keys, oldest first. */
export function lastNDayKeys(asOf: Date, n: number): string[] {
  const keys: string[] = [];
  const start = addDays(asOf, -(n - 1));
  for (let i = 0; i < n; i++) keys.push(dayKey(addDays(start, i)));
  return keys;
}
