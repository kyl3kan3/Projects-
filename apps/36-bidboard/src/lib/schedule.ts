/**
 * Reminder scheduling and derived invitation status. Pure functions — the sweep
 * in tick.ts does the I/O.
 *
 * Two failure modes this file exists to prevent, both of them seen in the wild:
 *
 *  - **The nag that never stops.** "Unsubmitted" stays true forever, so a naive
 *    daily sweep mails a sub every morning until the heat death of the universe.
 *    Reminders here are pinned to *fixed distances* from the due date (T-7/T-3/T-1)
 *    and stop entirely once the date passes.
 *  - **The ladder that goes silent.** Picking the *loosest* crossed rung means a
 *    T-7 reminder fires and nothing ever follows it. `dueReminderRung` returns the
 *    **tightest** crossed rung, and each rung is deduped by its own key
 *    (`reminder:<invitation>:t3`) against a unique index — so a sub invited four
 *    days out gets T-3 and T-1, never a back-dated T-7.
 */

import { daysUntil } from "@/lib/format";
import type { InvitationStatus } from "@/db/schema";

/** Days before the due date a reminder may go out, if the GC hasn't changed them. */
export const DEFAULT_REMINDER_DAYS = [7, 3, 1];

/** How long past the bid due date a portal link keeps working. */
export const TOKEN_GRACE_DAYS = 7;

export function reminderDedupeKey(invitationId: string, rung: number): string {
  return `reminder:${invitationId}:t${rung}`;
}

/**
 * Which reminder rung is due right now, or null.
 *
 * `rungs` may be any set of positive day-distances; they are evaluated tightest
 * first. Returns null once the due date has passed — an overdue invitation is a
 * phone call, not another email.
 */
export function dueReminderRung(
  bidDueAt: Date,
  now: Date,
  rungs: number[] = DEFAULT_REMINDER_DAYS,
): number | null {
  const days = daysUntil(bidDueAt, now);
  if (days < 0) return null;
  const crossed = rungs.filter((r) => r > 0 && days <= r);
  if (crossed.length === 0) return null;
  return Math.min(...crossed);
}

/** Sanitise a GC-entered reminder schedule: positive integers, unique, descending. */
export function normalizeReminderDays(input: number[]): number[] {
  const clean = [...new Set(input.map((n) => Math.trunc(n)).filter((n) => n > 0 && n <= 60))];
  return clean.sort((a, b) => b - a);
}

/* ----------------------------------------------------- derived status ------ */

/** Everything the board needs to decide what an invitation *currently* is. */
export interface InvitationFacts {
  storedStatus: InvitationStatus;
  hasSubmittedBid: boolean;
  declinedAt: Date | null;
  openedAt: Date | null;
  bidDueAt: Date;
  revokedAt?: Date | null;
}

/**
 * Status as of now, never the stored column.
 *
 * `no_response` is the reason this is derived: it becomes true the moment the due
 * date passes, and no writer is watching the clock. Rendering the stored value
 * would show "OPENED" on an invitation three weeks past its date.
 */
export function derivedStatus(facts: InvitationFacts, now: Date = new Date()): InvitationStatus {
  if (facts.hasSubmittedBid) return "submitted";
  if (facts.declinedAt) return "declined";
  if (daysUntil(facts.bidDueAt, now) < 0) return "no_response";
  if (facts.storedStatus === "will_bid") return "will_bid";
  if (facts.openedAt) return "opened";
  return "sent";
}

export const STATUS_LABEL: Record<InvitationStatus, string> = {
  sent: "SENT",
  opened: "OPENED",
  will_bid: "WILL BID",
  declined: "DECLINED",
  submitted: "SUBMITTED",
  no_response: "NO RESPONSE",
};

/** DESIGN.md § status pill: amber pending, green in, red out, text-2 neutral. */
export const STATUS_TONE: Record<InvitationStatus, "amber" | "green" | "red" | "neutral"> = {
  sent: "neutral",
  opened: "neutral",
  will_bid: "amber",
  declined: "red",
  submitted: "green",
  no_response: "amber",
};
