/**
 * Display helpers shared by server and client components.
 *
 * Deliberately free of any import that reaches the database client: a client
 * component that imports a module which imports `@/db` pulls postgres.js into
 * the browser bundle. Everything here is pure string and number work.
 */

import type { AgingBucket } from "@/lib/dates";
import type { LadderHold } from "@/lib/ladder";

/** The colour a row's status dot takes. Semantic only, never decorative. */
export type DotTone = "amber" | "red" | "banker" | "faint";

export function dotToneFor(args: {
  daysLate: number;
  hold: LadderHold | null;
  settled: boolean;
  stepsSent: number;
}): DotTone {
  if (args.settled) return "banker";
  if (args.hold === "disputed" || args.hold === "ladder_complete") return "red";
  if (args.daysLate > 60 || args.stepsSent >= 4) return "red";
  if (args.stepsSent > 0 || args.daysLate > 0) return "amber";
  return "faint";
}

export const DOT_COLOR: Record<DotTone, string> = {
  amber: "var(--color-amber)",
  red: "var(--color-red)",
  banker: "var(--color-banker)",
  faint: "var(--color-text-aa)",
};

/** The four aging segments, in order, with their exact fills from DESIGN.md. */
export const BUCKET_FILL: Record<AgingBucket, string> = {
  current: "var(--color-bar-current)",
  d31to60: "color-mix(in srgb, var(--color-amber) 70%, transparent)",
  d61to90: "color-mix(in srgb, var(--color-red) 60%, transparent)",
  d90plus: "var(--color-red)",
};

export const BUCKET_ORDER: AgingBucket[] = ["current", "d31to60", "d61to90", "d90plus"];

/** "71d" — a mono day count. */
export function daysLabel(days: number): string {
  return `${Math.max(0, Math.round(days))}d`;
}

/** "DSO 47d ↓3" — the hero's companion stat. */
export function dsoLabel(dso: number | null, change: number | null): string {
  if (dso === null) return "DSO —";
  if (change === null || change === 0) return `DSO ${dso}d`;
  return `DSO ${dso}d ${change < 0 ? "↓" : "↑"}${Math.abs(change)}`;
}

/** Sentence case for a hold reason, used in row state lines. */
export function titleCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "6 queued sends" / "1 queued send". */
export function plural(count: number, one: string, many?: string): string {
  return `${count} ${count === 1 ? one : (many ?? `${one}s`)}`;
}

/**
 * Shorten signed portal links for on-screen previews.
 *
 * The stored snapshot keeps the real URL — this is presentation only, so a human
 * reviewing a queued send reads the sentence rather than 300 characters of JWT.
 */
export function shortenPortalLinks(text: string): string {
  return text.replace(/(https?:\/\/[^\s]*?\/portal\/)[A-Za-z0-9._-]{12,}/g, "$1…");
}

/** A relative "synced 6m ago" for the header's sync chip. */
export function timeAgo(at: Date | null, now: Date = new Date()): string {
  if (!at) return "never synced";
  const seconds = Math.max(0, Math.floor((now.getTime() - at.getTime()) / 1000));
  if (seconds < 60) return "synced just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `synced ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `synced ${hours}h ago`;
  return `synced ${Math.floor(hours / 24)}d ago`;
}
