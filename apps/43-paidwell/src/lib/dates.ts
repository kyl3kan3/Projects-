/**
 * Calendar-date arithmetic. Pure, no database, no timezone surprises.
 *
 * Payment terms are counted in calendar days: "net 30" issued on 3 June is due
 * on 3 July, whatever hour it was raised and whichever side of a daylight-saving
 * change it lands on. So every date the escalation ladder reasons about is an
 * ISO `YYYY-MM-DD` string and every comparison is integer day maths.
 *
 * This is also a deliberate defence. Two of the failure modes this product
 * cannot afford — a rung that fires twice because a millisecond comparison
 * flickered, and a rung that never fires because Postgres keeps microseconds
 * a JS Date threw away — are simply unreachable when the unit is a day and the
 * value is a string.
 *
 * Known limitation, accepted at MVP: the day boundary is UTC for every firm. An
 * agency in UTC+13 sees an invoice tick over to "1 day late" up to 13 hours
 * after their own midnight. Per-firm timezones are a later setting; consistency
 * matters more right now than locality.
 */

export type IsoDate = string; // YYYY-MM-DD

const DAY_MS = 86_400_000;

export function isIsoDate(value: unknown): value is IsoDate {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Parse `YYYY-MM-DD` into the Date at UTC midnight. Throws on anything else. */
export function parseIso(value: IsoDate): Date {
  if (!isIsoDate(value)) throw new Error(`Not an ISO date: ${String(value)}`);
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
  return toIso(new Date(parseIso(value).getTime() + Math.round(days) * DAY_MS));
}

/** Whole days from `a` to `b`. Negative when `b` is the earlier date. */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / DAY_MS);
}

/**
 * Signed distance from the due date, in days. 0 on the due date, negative
 * before it, positive once late. This single number drives the whole ladder.
 */
export function daysFromDue(dueAt: IsoDate, asOf: IsoDate): number {
  return daysBetween(dueAt, asOf);
}

/** Days past due, floored at 0 — for display ("71d"). */
export function daysOverdue(dueAt: IsoDate, asOf: IsoDate): number {
  return Math.max(0, daysFromDue(dueAt, asOf));
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

/** The due date for an invoice issued on `issuedAt` with `termsDays` terms. */
export function dueDateFor(issuedAt: IsoDate, termsDays: number): IsoDate {
  return addDays(issuedAt, Math.max(0, Math.round(termsDays) || 0));
}

/** The Monday of the ISO week a date falls in. Forecast columns are weeks. */
export function weekStart(value: IsoDate): IsoDate {
  const date = parseIso(value);
  const dow = date.getUTCDay(); // 0 = Sunday
  const backToMonday = dow === 0 ? 6 : dow - 1;
  return addDays(value, -backToMonday);
}

/** The 4-week aging bucket a days-overdue count belongs to. */
export type AgingBucket = "current" | "d31to60" | "d61to90" | "d90plus";

export function agingBucket(daysLate: number): AgingBucket {
  if (daysLate <= 30) return "current";
  if (daysLate <= 60) return "d31to60";
  if (daysLate <= 90) return "d61to90";
  return "d90plus";
}

/* ------------------------------------------------------------ formatting --- */

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

/** "14 JUL" — the mono stamp used on rows and chips. */
export function formatStamp(value: IsoDate): string {
  const d = parseIso(value);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "FRI 12 JUL" — the promise-chip format from DESIGN.md. */
export function formatPromiseDate(value: IsoDate): string {
  const d = parseIso(value);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "14 Jul 2026" — long form for the portal and email bodies. */
export function formatLongDate(value: IsoDate): string {
  const d = parseIso(value);
  const month = MONTHS[d.getUTCMonth()];
  return `${d.getUTCDate()} ${month.charAt(0)}${month.slice(1).toLowerCase()} ${d.getUTCFullYear()}`;
}

/** A relative sentence for a due date: "due in 3 days", "9 days overdue". */
export function describeDue(dueAt: IsoDate, asOf: IsoDate): string {
  const delta = daysFromDue(dueAt, asOf);
  if (delta === 0) return "due today";
  if (delta < 0) {
    const n = -delta;
    return `due in ${n} ${n === 1 ? "day" : "days"}`;
  }
  return `${delta} ${delta === 1 ? "day" : "days"} overdue`;
}
