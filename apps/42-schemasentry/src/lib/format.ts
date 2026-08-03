/**
 * Display formatting. Pure, so it can be used in client components without
 * dragging the database client into the browser bundle.
 */

/** `4 min ago`, `3 days ago`, `just now`. Mono, tabular, no "about". */
export function relativeTime(then: Date | string, now: Date = new Date()): string {
  const at = typeof then === "string" ? new Date(then) : then;
  const seconds = Math.round((now.getTime() - at.getTime()) / 1000);
  if (!Number.isFinite(seconds)) return "unknown";
  if (seconds < 0) return "just now";
  if (seconds < 45) return "just now";
  if (seconds < 90) return "1 min ago";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} mo ago`;
  const years = Math.round(months / 12);
  return `${years} yr${years === 1 ? "" : "s"} ago`;
}

/** `2026-08-03` — the changelog's dateline, unambiguous in every locale. */
export function isoDate(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toISOString().slice(0, 10);
}

/** `3 Aug 2026` — for the public changelog, where a human is reading. */
export function longDate(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** `2 BREAKING · 3 RISKY · 11 COMPATIBLE` — DESIGN.md's verdict-stamp counts. */
export function countLine(summary: {
  breaking: number;
  risky: number;
  compatible: number;
  info?: number;
}): string {
  const parts = [
    `${summary.breaking} BREAKING`,
    `${summary.risky} RISKY`,
    `${summary.compatible} COMPATIBLE`,
  ];
  if (summary.info && summary.info > 0) parts.push(`${summary.info} ACKNOWLEDGED`);
  return parts.join(" · ");
}

/** `9f3c2ab → 4d81e07`, both mono. */
export function versionPair(from: string, to: string): string {
  return `${from} → ${to}`;
}

/** Trim a version label for a narrow row without losing its identity. */
export function shortLabel(label: string, max = 18): string {
  if (label.length <= max) return label;
  return `${label.slice(0, max - 1)}…`;
}

/** `payments-api` from `Payments API`. Also used for changelog URLs. */
export function slugify(input: string, fallback = "api"): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || fallback
  );
}

/** Parse the textarea format used by the consumer editor: one entry per line. */
export function parseLines(input: string | null | undefined): string[] {
  if (!input) return [];
  return [
    ...new Set(
      input
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
}

/** `#/paths/~1v1~1orders` → a tappable, wrappable pointer. */
export function prettyPointer(pointer: string): string {
  return pointer.replace(/~1/g, "/").replace(/~0/g, "~");
}
