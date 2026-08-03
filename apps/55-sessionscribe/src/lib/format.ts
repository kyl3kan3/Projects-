/**
 * src/lib/format.ts
 *
 * Display helpers. Pure functions only — no database, no secrets — so a client
 * component can import this file without dragging `postgres` into the browser
 * bundle.
 *
 * Two rules live here rather than in the screens:
 *
 *  1. **Every clock reading is practice-local.** Timestamps are stored UTC and
 *     rendered through the practice's IANA timezone. A note signed at 15:07 in
 *     New York must read "3:07 PM" to the clinician who signed it, not whatever
 *     the server's TZ happens to be.
 *  2. **Status is derived as of now, never read from a column a sweep updates.**
 *     `displayStatus()` takes the row plus the current time, so a draft that has
 *     been sitting unsigned for three days says so on a page that nothing has
 *     touched since Tuesday.
 */

import type { NoteStatus, SessionStatus } from "@/db/schema";

/* ----------------------------------------------------------------- clocks */

function parts(
  at: Date,
  timeZone: string,
  opts: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, ...opts }).format(at);
}

/** "3:07 PM" — every row time, every signature stamp. */
export function formatTime(at: Date, timeZone: string): string {
  return parts(at, timeZone, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** "3:07" — the between-sessions clock chip, no meridiem, mono, tabular. */
export function formatClock(at: Date, timeZone: string): string {
  return parts(at, timeZone, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).replace(/\s?[AP]M$/i, "");
}

/** "THURSDAY JUL 17" — the Today screen's day label, uppercased by CSS. */
export function formatDayLabel(at: Date, timeZone: string): string {
  return parts(at, timeZone, {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).replace(",", "");
}

/** "2026-07-17" — practice-local calendar date, used for grouping and inputs. */
export function localDateKey(at: Date, timeZone: string): string {
  // "en-CA" formats as YYYY-MM-DD, which is the key we want, in the practice's
  // zone. Building it from the en-US parts by hand is the version that gets the
  // month and day the wrong way round.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** "Jul 17, 2026" — history rows and PDF headers. */
export function formatDate(at: Date, timeZone: string): string {
  return parts(at, timeZone, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** "2026-07-17 15:07" — the mono stamp on a signature block. */
export function formatStamp(at: Date, timeZone: string): string {
  const t = parts(at, timeZone, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    // hourCycle h23 so midnight is 00:07, not 24:07 — Intl's hour12:false
    // default renders 24 for the zeroth hour in some locales.
    hourCycle: "h23",
  });
  return `${localDateKey(at, timeZone)} ${t}`;
}

/** "2026-07" — the usage-counter period key, practice-local. */
export function periodKey(at: Date, timeZone: string): string {
  return localDateKey(at, timeZone).slice(0, 7);
}

/** Whole days between two instants, floored. Negative when `to` is earlier. */
export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

/** "2 days", "18 hours", "just now" — how long a draft has waited. */
export function relativeAge(from: Date, now: Date): string {
  const ms = Math.max(0, now.getTime() - from.getTime());
  const mins = Math.floor(ms / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

/** Mono duration for a session: "50 min", "1h 05m". */
export function formatDuration(minutes: number | null): string {
  if (!minutes || minutes <= 0) return "—";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** ms offset -> "12:04" transcript timecode. */
export function timecode(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ hashes */

/**
 * `a41f…9c2e` — DESIGN.md's truncated-middle content hash. Full value on tap,
 * which is why the untruncated string is always passed alongside.
 */
export function shortHash(hash: string): string {
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 4)}…${hash.slice(-4)}`;
}

/* ------------------------------------------------------------------ status */

export type DisplayStatus =
  | "captured"
  | "transcribing"
  | "drafting"
  | "ready"
  | "unsigned"
  | "signed"
  | "amending"
  | "failed";

export const STATUS_LABEL: Record<DisplayStatus, string> = {
  captured: "QUEUED",
  transcribing: "TRANSCRIBING",
  drafting: "DRAFTING",
  ready: "READY",
  unsigned: "UNSIGNED",
  signed: "SIGNED",
  amending: "AMENDING",
  failed: "FAILED",
};

/** sage = ready/signed, amber = in-flight or waiting on a human, red = failed. */
export const STATUS_TONE: Record<DisplayStatus, "accent" | "warn" | "bad" | "faint"> =
  {
    captured: "warn",
    transcribing: "warn",
    drafting: "warn",
    ready: "accent",
    unsigned: "warn",
    signed: "faint",
    amending: "warn",
    failed: "bad",
  };

export interface StatusInput {
  sessionStatus: SessionStatus;
  noteStatus: NoteStatus | null;
  /** When the draft became reviewable — drives the aging nudge. */
  draftGeneratedAt: Date | null;
}

/** Hours a reviewable draft may sit before the row nudges the clinician. */
export const UNSIGNED_AGING_HOURS = 24;

/**
 * The status a screen renders. Note status wins over session status where they
 * disagree, because the note is the record and the session row is the pipeline's
 * scratch space.
 */
export function displayStatus(input: StatusInput, now: Date): DisplayStatus {
  if (input.noteStatus === "signed") return "signed";
  if (input.noteStatus === "amended") return "amending";
  if (input.sessionStatus === "failed") return "failed";
  if (input.noteStatus === "draft") {
    const since = input.draftGeneratedAt;
    if (
      since &&
      now.getTime() - since.getTime() >= UNSIGNED_AGING_HOURS * 3_600_000
    ) {
      return "unsigned";
    }
    return "ready";
  }
  if (input.sessionStatus === "transcribing") return "transcribing";
  if (input.sessionStatus === "drafting") return "drafting";
  return "captured";
}

/** Human sentence under a row: what is happening and what is owed. */
export function statusLine(
  status: DisplayStatus,
  ctx: { since: Date | null; now: Date; failureReason?: string | null },
): string {
  switch (status) {
    case "captured":
      return "queued for the pipeline";
    case "transcribing":
      return "separating speakers";
    case "drafting":
      return "drafting sections";
    case "ready":
      return ctx.since
        ? `draft ready ${relativeAge(ctx.since, ctx.now)} ago · needs your review`
        : "draft ready · needs your review";
    case "unsigned":
      return ctx.since
        ? `unsigned for ${relativeAge(ctx.since, ctx.now)}`
        : "unsigned";
    case "signed":
      return "signed and locked";
    case "amending":
      return "amendment in review · needs a new signature";
    case "failed":
      return ctx.failureReason ?? "pipeline failed — retry or write shorthand";
  }
}

/* ------------------------------------------------------------------ labels */

export const MODALITY_LABEL: Record<string, string> = {
  general: "General",
  cbt: "CBT",
  emdr: "EMDR",
  couples: "Couples",
  play: "Play",
  sfbt: "SFBT",
};

export const CONSENT_LABEL: Record<string, string> = {
  none: "No consent on file",
  verbal: "Verbal consent",
  written: "Written consent",
};

export const CAPTURE_LABEL: Record<string, string> = {
  recording: "Recorded in browser",
  upload: "Uploaded audio",
  shorthand: "Typed shorthand",
};

/** "J.R. — EMDR / DAP" — the session row title, assembled in one place. */
export function rowTitle(
  displayLabel: string,
  modality: string,
  format: string,
): string {
  return `${displayLabel} — ${MODALITY_LABEL[modality] ?? modality} / ${format.toUpperCase()}`;
}

export function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/** Bytes for the audio row: "8.4 MB". */
export function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "—";
  const mb = bytes / 1_048_576;
  if (mb < 1) return `${Math.round(bytes / 1024)} KB`;
  return `${mb.toFixed(1)} MB`;
}

/** Micro-dollars -> "$0.042". Per-note COGS telemetry renders through this. */
export function formatMicros(micros: number): string {
  if (micros <= 0) return "$0.00";
  const dollars = micros / 1_000_000;
  return dollars < 0.1 ? `$${dollars.toFixed(3)}` : `$${dollars.toFixed(2)}`;
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}
