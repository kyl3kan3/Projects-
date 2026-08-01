/**
 * Display helpers. Pure, no locale surprises: the dashboard reads the same in
 * every timezone because everything relative is computed against a passed-in
 * `now` and everything absolute is UTC.
 */

/** `m***@gmail.com` — the join feed shows activity without leaking the list. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 1) return `${local}***${domain}`;
  return `${local[0]}***${domain}`;
}

/** `2m ago`, `4h ago`, `3d ago`. Short enough for a 390px row. */
export function relativeTime(when: Date, now: Date = new Date()): string {
  const seconds = Math.floor((now.getTime() - when.getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function isoDate(when: Date): string {
  return when.toISOString().slice(0, 10);
}

export function utcTimestamp(when: Date): string {
  return `${when.toISOString().slice(0, 10)} ${when.toISOString().slice(11, 16)} UTC`;
}

/** `2,847`. Counts are always grouped — a raw 2847 reads as a code. */
export function count(n: number): string {
  return n.toLocaleString("en-US");
}

/** `#347`, with the numeral zero-padded to at least two digits (DESIGN.md). */
export function positionLabel(position: number): string {
  return `#${position}`;
}

/** `04` — the leaderboard rank column, mono and always two digits. */
export function rankLabel(rank: number): string {
  return rank < 10 ? `0${rank}` : String(rank);
}

/** Truncate in the middle so both ends of a share URL stay readable. */
export function truncateMiddle(text: string, max = 34): string {
  if (text.length <= max) return text;
  const half = Math.floor((max - 1) / 2);
  return `${text.slice(0, half)}…${text.slice(text.length - half)}`;
}

/**
 * Turn a name into a URL slug. Shared by list creation and the builder so a
 * rename can never produce a slug the router cannot serve.
 */
export function slugify(input: string, fallback = "launch"): string {
  const slug = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug || fallback;
}

/** Slugs that would shadow an app route. */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "api",
  "app",
  "billing",
  "blasts",
  "dashboard",
  "embed",
  "l",
  "lists",
  "login",
  "logout",
  "pricing",
  "settings",
  "signup",
  "signups",
  "referrals",
  "templates",
  "unsubscribe",
  "verify",
  "www",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}
