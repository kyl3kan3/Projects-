/**
 * Formatting helpers.
 *
 * DESIGN.md sets the exact strings: "Maya R. · Jun 24" on a review card,
 * "4.8 · 312" beside a star row, "13.22 KB · 4 MS · CLS 0.00" in the speed
 * receipts. Every number in the product is mono and tabular, so these produce
 * display strings and nothing else formats dates inline.
 */

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

/** "Jun 24" — the review-card date. Same month naming everywhere, no locale drift. */
export function shortDate(date: Date): string {
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

/** "2026-06-24" — the JSON-LD `datePublished` and any machine-readable field. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "3d ago", "22m ago", "just now" — moderation queue timestamps. */
export function ago(date: Date | null | undefined, now: Date = new Date()): string {
  if (!date) return "never";
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return shortDate(date);
}

/** "in 12 days", "tomorrow", "today" — when a scheduled request goes out. */
export function inDays(date: Date, now: Date = new Date()): string {
  const days = Math.ceil((date.getTime() - now.getTime()) / 86_400_000);
  if (days <= 0) return "due now";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/** 1204 -> "1,204". Counts are always grouped; the funnel reads at a glance. */
export function count(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

/** 4.8 -> "4.8". One decimal, never rounded up to a flattering 5.0. */
export function rating(value: number): string {
  return (Math.floor(value * 10) / 10).toFixed(1);
}

/** 0.312 -> "31%". Conversion rates in the funnel. */
export function percent(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

/** 13_542 -> "13.22 KB". Bundle sizes in the speed receipts, two decimals. */
export function kilobytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(2)} KB`;
}
