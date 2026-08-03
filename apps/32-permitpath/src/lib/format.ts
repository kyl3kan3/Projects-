/**
 * Formatting helpers. Pure and dependency-free on purpose: client components
 * import this, and anything that reached the db client would pull `postgres`
 * into the browser bundle.
 *
 * Every date and money value in PermitPath renders through here so the mono
 * tabular specimen in DESIGN.md stays consistent — and so recency is never
 * computed twice, two different ways.
 */

const MS_PER_DAY = 86_400_000;

/**
 * Whole days between two instants, counted on the UTC day boundary rather than
 * by dividing elapsed milliseconds. A record verified late yesterday is "1d
 * ago", not "0d ago", which is the difference between an honest recency stamp
 * and a flattering one.
 */
export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((b - a) / MS_PER_DAY);
}

/** Days until a date, negative once it is in the past. */
export function daysUntil(target: Date, now: Date = new Date()): number {
  return daysBetween(now, target);
}

/** Long form for requirement cards: "verified 11 days ago". */
export function recencyLabel(verifiedAt: Date, now: Date = new Date()): string {
  const days = daysBetween(verifiedAt, now);
  if (days <= 0) return "verified today";
  if (days === 1) return "verified yesterday";
  if (days < 60) return `verified ${days} days ago`;
  const months = Math.round(days / 30);
  return `verified ${months} months ago`;
}

/** Short form for checklist rows and list metadata: "verified 11d ago". */
export function recencyShort(verifiedAt: Date, now: Date = new Date()): string {
  const days = daysBetween(verifiedAt, now);
  if (days <= 0) return "verified just now";
  if (days === 1) return "verified 1d ago";
  if (days < 60) return `verified ${days}d ago`;
  return `verified ${Math.round(days / 30)}mo ago`;
}

/**
 * How stale a record is, as a bucket the UI colours by. The corpus promise is
 * ">=90% verified within the last 90 days"; anything past that is called out
 * rather than quietly shown as fact.
 */
export function freshness(verifiedAt: Date, now: Date = new Date()): "fresh" | "aging" | "stale" {
  const days = daysBetween(verifiedAt, now);
  if (days <= 90) return "fresh";
  if (days <= 180) return "aging";
  return "stale";
}

/** "in 7 days" / "7 days ago" / "today", for expiry copy. */
export function relativeDays(target: Date, now: Date = new Date()): string {
  const d = daysUntil(target, now);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  if (d > 1) return `in ${d} days`;
  return `${Math.abs(d)} days ago`;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "May 14" — the corpus change-feed date. */
export function shortDate(date: Date): string {
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

/** "May 14, 2026" — expiry dates, where the year is load-bearing. */
export function longDate(date: Date): string {
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

/** "2026-05-14" — <input type="date"> values and stable sort keys. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Parse a date-only form value as UTC midnight. `new Date("2026-05-14")` is
 * already UTC, but `new Date("2026-05-14T00:00")` is local — being explicit
 * keeps an expiry date from drifting a day either side of the equator.
 */
export function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Integer cents to "$89" / "$1,240.50". Money is never a float here. */
export function money(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100);
  const rest = abs % 100;
  const grouped = dollars.toLocaleString("en-US");
  const body = rest === 0 ? `$${grouped}` : `$${grouped}.${String(rest).padStart(2, "0")}`;
  return negative ? `-${body}` : body;
}

/** Sum a fee schedule. Fees are integer cents end to end. */
export function totalCents(lines: { amountCents: number }[]): number {
  return lines.reduce((sum, l) => sum + Math.round(l.amountCents), 0);
}

/** "4 of 6 verified" — the mono progress line on a checklist header. */
export function progressLabel(verified: number, total: number): string {
  return `${verified} of ${total} verified`;
}

/** Group anything date-stamped into day buckets, newest first. */
export function groupByDay<T>(rows: T[], at: (row: T) => Date): { day: string; label: string; rows: T[] }[] {
  const buckets = new Map<string, T[]>();
  for (const row of rows) {
    const key = isoDate(at(row));
    const list = buckets.get(key);
    if (list) list.push(row);
    else buckets.set(key, [row]);
  }
  return [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([day, rowsForDay]) => ({
      day,
      label: dayLabel(new Date(`${day}T00:00:00.000Z`)),
      rows: rowsForDay,
    }));
}

function dayLabel(day: Date, now: Date = new Date()): string {
  const diff = daysBetween(day, now);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return longDate(day);
}
