/**
 * src/lib/dates.ts
 *
 * Plain-date arithmetic on `YYYY-MM-DD` strings.
 *
 * Every date a certificate carries — effective, expiry — is a calendar date, not
 * an instant: a policy expiring "2026-07-15" expires on that day wherever you
 * read it. Postgres `date` columns come back as `YYYY-MM-DD` strings, and this
 * module keeps them that way. Nothing here builds a `Date` from a date string in
 * local time, which is where the classic off-by-one comes from.
 *
 * The only place a real instant becomes a calendar date is `plainDate()`, and it
 * does the conversion in an explicit time zone — the org's — so a coordinator in
 * Denver and the cron running in UTC agree on what "today" is.
 */

export const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Today (or any instant) as a calendar date in a named time zone. */
export function plainDate(instant: Date = new Date(), timeZone = "UTC"): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the shape we store.
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(instant);
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && ISO_DATE.test(value) && !Number.isNaN(utcMs(value));
}

/** Milliseconds at UTC midnight of a `YYYY-MM-DD`. NaN when malformed. */
function utcMs(iso: string): number {
  const m = ISO_DATE.exec(iso);
  if (!m) return Number.NaN;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return Number.NaN;
  const ms = Date.UTC(y, mo - 1, d);
  // Reject 2026-02-30 and friends: Date.UTC rolls them over silently.
  const back = new Date(ms);
  if (back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return Number.NaN;
  return ms;
}

/** Whole days from `from` to `to`. Negative when `to` is in the past. */
export function daysBetween(from: string, to: string): number {
  const a = utcMs(from);
  const b = utcMs(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN;
  return Math.round((b - a) / 86_400_000);
}

export function addDays(iso: string, days: number): string {
  const ms = utcMs(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms + days * 86_400_000).toISOString().slice(0, 10);
}

/** First day of the calendar month containing `iso`. */
export function monthStart(iso: string): string {
  const m = ISO_DATE.exec(iso);
  return m ? `${m[1]}-${m[2]}-01` : iso;
}

/** String compare is a correct date compare for this format; named for intent. */
export function isBefore(a: string, b: string): boolean {
  return a < b;
}

export function isAfter(a: string, b: string): boolean {
  return a > b;
}

/** The earlier of two dates, tolerating nulls. */
export function earliest(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

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

/** "2026-07-15" → "Jul 15, 2026". Used in every deficiency sentence. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso || !isIsoDate(iso)) return "—";
  const m = ISO_DATE.exec(iso)!;
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

/** "in 12 days" / "12 days ago" / "today". */
export function relativeDays(days: number): string {
  if (!Number.isFinite(days)) return "—";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${Math.abs(days)} days ago`;
}

/** A timestamp for the audit ledger: "2026-08-03 14:02 UTC". */
export function formatStamp(at: Date | null | undefined, timeZone = "UTC"): string {
  if (!at) return "—";
  const d = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
  const t = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
  return `${d} ${t}`;
}
