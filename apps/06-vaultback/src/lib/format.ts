/**
 * Display formatting. Everything here ends up in a mono, tabular-figures span —
 * byte sizes, durations, ages, checksums are the evidence the product sells, so
 * they get the same treatment everywhere.
 */

/** "1.2 GB", "310 MB", "88 kB". Decimal units, because storage bills are decimal. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "—";
  if (bytes < 1000) return `${Math.round(bytes)} B`;
  const units = ["kB", "MB", "GB", "TB", "PB"];
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  const digits = value < 10 ? 1 : 0;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

/** "52m ago", "4h ago", "1d ago", "just now". */
export function timeAgo(at: Date | string | null | undefined, now: Date = new Date()): string {
  if (!at) return "never";
  const then = typeof at === "string" ? new Date(at) : at;
  const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);
  if (seconds < 0) return "in the future";
  if (seconds < 45) return "just now";
  if (seconds < 5400) {
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
  }
  const hours = Math.round(seconds / 3600);
  // Switching to days at 24h (not 36h) so a day-old backup reads "1d ago", the
  // specimen in DESIGN.md, rather than "24h ago".
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(seconds / 86400);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 18) return `${months}mo ago`;
  return `${Math.round(days / 365)}y ago`;
}

/** "in 47m", "in 3h", "overdue". Used for next scheduled run. */
export function timeUntil(at: Date | string | null | undefined, now: Date = new Date()): string {
  if (!at) return "not scheduled";
  const then = typeof at === "string" ? new Date(at) : at;
  const seconds = Math.floor((then.getTime() - now.getTime()) / 1000);
  if (seconds <= 0) return "due now";
  if (seconds < 60) return "in <1m";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.round(seconds / 3600);
  if (hours < 36) return `in ${hours}h`;
  return `in ${Math.round(seconds / 86400)}d`;
}

/** "1.84s", "3m 12s", "412ms". */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 10_000) return `${(ms / 1000).toFixed(2)}s`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  if (minutes < 60) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** "2026-07-03 04:00 UTC" — the timestamp format DESIGN.md specifies. */
export function formatTimestamp(at: Date | string | null | undefined): string {
  if (!at) return "—";
  const d = typeof at === "string" ? new Date(at) : at;
  const iso = d.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/** "JUN 29" — the drill card's label date. */
export function formatShortDate(at: Date | string | null | undefined): string {
  if (!at) return "—";
  const d = typeof at === "string" ? new Date(at) : at;
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase();
  return `${month} ${d.getUTCDate()}`;
}

/** "214,882" — grouped counts read as evidence. */
export function formatCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US");
}

/** A pluralized noun phrase: "1 database", "3 databases". */
export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${formatCount(n)} ${n === 1 ? singular : pluralForm}`;
}
