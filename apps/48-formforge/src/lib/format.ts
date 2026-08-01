/**
 * src/lib/format.ts
 *
 * Pure display helpers. No database, no crypto, no `postgres` import — this file
 * is safe for client components, which is the point: a client component that
 * reaches a module that reaches the db client drags `postgres` into the browser
 * bundle.
 */

import type { IntakeStatus } from "@/db/schema";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** `JUL 4` — the mono version stamp and row dates. */
export function shortDate(at: Date, timeZone = "UTC"): string {
  const parts = zoned(at, timeZone);
  return `${MONTHS[parts.month - 1]} ${parts.day}`;
}

/** `JUL 4 2026 · 14:02` in the practice's zone. */
export function stampLocal(at: Date, timeZone = "UTC"): string {
  const p = zoned(at, timeZone);
  return `${MONTHS[p.month - 1]} ${p.day} ${p.year} · ${pad(p.hour)}:${pad(p.minute)}`;
}

/** `14:02:11` — the audit row's leading column. */
export function clockLocal(at: Date, timeZone = "UTC"): string {
  const p = zoned(at, timeZone);
  return `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

/** `2026-07-04` in the practice's zone — day grouping on the ledger. */
export function dayLocal(at: Date, timeZone = "UTC"): string {
  const p = zoned(at, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function zoned(
  at: Date,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const out: Record<string, string> = {};
  for (const part of fmt.formatToParts(at)) if (part.type !== "literal") out[part.type] = part.value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour),
    minute: Number(out.minute),
    second: Number(out.second),
  };
}

/**
 * Compact age of a row: `4h`, `4d`, `3w`. The status board's right column.
 * Rounds down, so "4d" never appears before four full days have passed.
 */
export function ageLabel(from: Date, now: Date = new Date()): string {
  const ms = Math.max(0, now.getTime() - from.getTime());
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 21) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 9) return `${weeks}w`;
  return `${Math.floor(days / 30)}mo`;
}

/* ---------------------------------------------------------------- statuses */

/**
 * The status a screen should show, derived as of now.
 *
 * A stored `status` column says what the packet has *done*; whether it is
 * overdue is a fact about the clock. Deriving it here means a packet 212 days
 * past its link expiry never renders as "Sent" just because no sweep has run —
 * the sweep only makes the stored column agree with what the screen already says.
 */
export type DisplayStatus = "sent" | "started" | "completed" | "signed" | "overdue" | "expired";

export function displayStatus(
  intake: { status: IntakeStatus; sentAt: Date; expiresAt: Date },
  overdueHours = 120,
  now: Date = new Date(),
): DisplayStatus {
  if (intake.status === "signed") return "signed";
  if (intake.status === "completed") return "completed";
  if (now.getTime() > intake.expiresAt.getTime()) return "expired";
  const ageHours = (now.getTime() - intake.sentAt.getTime()) / 3_600_000;
  if (ageHours >= overdueHours) return "overdue";
  return intake.status === "started" ? "started" : "sent";
}

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  sent: "SENT",
  started: "STARTED",
  completed: "COMPLETED",
  signed: "SIGNED",
  overdue: "OVERDUE",
  expired: "EXPIRED",
};

/** DESIGN.md: ink-3 sent, teal started, moss signed, clay overdue. */
export const STATUS_TONE: Record<DisplayStatus, "faint" | "accent" | "good" | "bad"> = {
  sent: "faint",
  started: "accent",
  completed: "accent",
  signed: "good",
  overdue: "bad",
  expired: "bad",
};

/* ------------------------------------------------------------------ numbers */

/** Completion rate over a window, as a whole percent. Empty windows read "—". */
export function completionRate(completed: number, sent: number): string {
  if (sent <= 0) return "—";
  return `${Math.round((completed / sent) * 100)}%`;
}

export function bytesLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Initials for a patient row where the full name is not being decrypted. */
/**
 * DESIGN.md renders a hash truncated, with the full value on tap. It lives here
 * rather than in lib/crypto.ts so a page can render a hash without importing the
 * cipher — `phi.test.ts` fails a page that imports lib/crypto at all.
 */
export function shortHash(hex: string): string {
  return `${hex.slice(0, 4)}…${hex.slice(-4)}`.toUpperCase();
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
