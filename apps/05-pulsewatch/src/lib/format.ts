/**
 * Formatting helpers.
 *
 * DESIGN.md: "Every latency, percentage, and timestamp is mono tabular, no
 * exceptions." These produce the exact strings the spec shows — "212ms",
 * "down 4m 12s", "last ping 22m ago", "expires in 41d", "99.98%".
 */

export function latency(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/** "4m 12s", "2h 06m", "3d 04h" — two units, largest first. */
export function duration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, "0")}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${String(h % 24).padStart(2, "0")}h`;
}

export function durationBetween(from: Date, to: Date = new Date()): string {
  return duration((to.getTime() - from.getTime()) / 1000);
}

/** "22m ago", "3d ago", "just now". */
export function ago(date: Date | null | undefined, now: Date = new Date()): string {
  if (!date) return "never";
  const s = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** "in 41d", "in 6h", "expired". */
export function until(date: Date | null | undefined, now: Date = new Date()): string {
  if (!date) return "unknown";
  const s = Math.floor((date.getTime() - now.getTime()) / 1000);
  if (s <= 0) return "expired";
  const d = Math.floor(s / 86_400);
  if (d >= 1) return `in ${d}d`;
  const h = Math.floor(s / 3600);
  if (h >= 1) return `in ${h}h`;
  return `in ${Math.floor(s / 60)}m`;
}

/** 99.98 -> "99.98%". Two decimals, because the third is a lie at our volume. */
export function uptimePct(ok: number, total: number): string {
  if (total === 0) return "—";
  return `${((ok / total) * 100).toFixed(2)}%`;
}

/** "02:14:07" UTC — the incident timeline's tick format. */
export function clock(date: Date): string {
  return date.toISOString().slice(11, 19);
}

export function shortDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Human interval: 60 -> "1 min", 300 -> "5 min", 3600 -> "1 hr". */
export function interval(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${Math.round(seconds / 3600)} hr`;
}

/** p50/p99 pair as the monitor row renders it: "212ms · 480ms". */
export function latencyPair(p50: number | null, p99: number | null): string {
  return `${latency(p50)} · ${latency(p99)}`;
}
