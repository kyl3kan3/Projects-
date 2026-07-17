/**
 * src/lib/reminders.ts
 *
 * The fan-out: T-7/3/1 per critical date to owning parties, exactly
 * once per (date, offset) via the ledger, with per-party digest
 * coalescing (one email per party per day even when three dates hit
 * the same offset).
 *
 * TODO:
 * - [ ] dueReminders(accountId, today): unsent (date, offset) pairs.
 * - [ ] coalesce(due): group by party -> digest sections.
 * - [ ] sendDigests(groups): Resend, ledger rows per (date, offset),
 *       DRY_RUN honored.
 * - [ ] resetUnsentForMovedDates(dealId, movedKeys): recompute hook —
 *       sent history is never rewritten.
 */

export async function dueReminders(
  accountId: string,
  today: Date,
): Promise<Array<{ criticalDateId: string; offsetDays: number }>> {
  throw new Error("Not implemented");
}

export async function sendDigests(accountId: string, today: Date): Promise<{ sent: number }> {
  throw new Error("Not implemented");
}
