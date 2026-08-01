/**
 * Formatting for the two audiences.
 *
 * The client portal speaks plainly ("Tue", "2 days ago"); the agency dashboard
 * speaks in mono stamps (`LAST VIEWED 2D AGO`, `UPDATED JUN 30`) because those
 * are data, per DESIGN.md's type specimen. Money is always cents in, string out —
 * floats never touch an invoice.
 */

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

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** `$4,800.00` from 480000 cents. Currency is the agency's, from Stripe. */
export function money(cents: number, currency = "usd"): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const whole = Math.floor(abs / 100).toLocaleString("en-US");
  const frac = String(abs % 100).padStart(2, "0");
  const symbol = currency.toLowerCase() === "usd" ? "$" : currency.toUpperCase() + " ";
  return `${negative ? "-" : ""}${symbol}${whole}.${frac}`;
}

/** `$4,800` — drops cents when they are zero, for headline figures. */
export function moneyShort(cents: number, currency = "usd"): string {
  const full = money(cents, currency);
  return full.endsWith(".00") ? full.slice(0, -3) : full;
}

/** `JUL 3` — the mono stamp used on timeline phases and audit lines. */
export function stampDate(d: Date): string {
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** `JUL 3, 11:42 AM` — the approval audit line's exact shape (DESIGN.md). */
export function stampDateTime(d: Date): string {
  let hour = d.getUTCHours();
  const meridiem = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 === 0 ? 12 : hour % 12;
  const minute = String(d.getUTCMinutes()).padStart(2, "0");
  return `${stampDate(d)}, ${hour}:${minute} ${meridiem}`;
}

/** `Tue` for anything inside the last week, otherwise `Jun 30`. */
export function dayLabel(d: Date, now = new Date()): string {
  const ageMs = now.getTime() - d.getTime();
  if (ageMs < 7 * 86_400_000 && ageMs > -86_400_000) return DAYS[d.getUTCDay()];
  const month = MONTHS[d.getUTCMonth()];
  return `${month[0]}${month.slice(1).toLowerCase()} ${d.getUTCDate()}`;
}

/**
 * `2D AGO` / `4H AGO` / `NEVER` — the freshness stamp on the agency dashboard.
 * Rounded down, so it never claims a portal is fresher than it is.
 */
export function agoStamp(d: Date | null, now = new Date()): string {
  if (!d) return "NEVER";
  const seconds = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 1000));
  if (seconds < 60) return "JUST NOW";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}M AGO`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}H AGO`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}D AGO`;
  const months = Math.floor(days / 30);
  return `${months}MO AGO`;
}

/** "waiting 3 days" — how the attention queue describes a stalled approval. */
export function waitingFor(since: Date, now = new Date()): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - since.getTime()) / 1000));
  const hours = Math.floor(seconds / 3600);
  if (hours < 1) return "waiting minutes";
  if (hours < 24) return `waiting ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  return `waiting ${days} day${days === 1 ? "" : "s"}`;
}

/** `142 KB` / `2.4 MB`. Bytes only when it really is bytes. */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/** Monogram tile letters: "Meridian Roasters" -> "MR", "Northbeam" -> "N". */
export function monogram(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter((w) => /[a-z0-9]/i.test(w));
  if (words.length === 0) return "—";
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** URL-safe slug, with a stable minimum length so routes never collide on "". */
export function slugify(input: string, fallback = "portal"): string {
  const slug = input
    .toLowerCase()
    .normalize("NFKD")
    // Drop the combining marks NFKD just split off, so "Ünified" becomes
    // "unified" rather than "u-nified".
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug.length >= 2 ? slug : fallback;
}

/** Overall progress across timeline phases, 0–100, weighted evenly. */
export function overallProgress(phases: { progressPct: number }[]): number {
  if (phases.length === 0) return 0;
  const total = phases.reduce((sum, p) => sum + clampPct(p.progressPct), 0);
  return Math.round(total / phases.length);
}

export function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}
