/**
 * src/lib/reminders.ts
 *
 * The reminder ledger: persisting the ladder that lib/ladder.ts computes, and
 * claiming rungs that have come due.
 *
 * The ladder is materialised once, at send time, as rows pinned to fixed
 * distances from `sent_at`. A rung exists once and fires once — the unique index
 * on (intake, channel, step) is the dedupe, and `claimDueReminders` flips status
 * in the same statement that selects, so two overlapping cron runs cannot both
 * send the same nudge.
 *
 * Messages carry the patient's first name, the practice name and the link and
 * nothing else — see lib/messages.ts, where a test asserts exactly that.
 */

import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { reminders, type Reminder } from "@/db/schema";
import type { ReminderPlan } from "@/lib/ladder";

export { isQuiet, planReminders, shiftOutOfQuietHours, type ReminderPlan } from "@/lib/ladder";

/* ------------------------------------------------------------------- ledger */

/** Write the ladder. Idempotent: replaying a send cannot duplicate a rung. */
export async function scheduleReminders(
  practiceId: string,
  intakeId: string,
  plans: ReminderPlan[],
): Promise<number> {
  if (!plans.length) return 0;
  const db = getDb();
  const rows = await db
    .insert(reminders)
    .values(
      plans.map((p) => ({
        practiceId,
        intakeId,
        channel: p.channel,
        step: p.step,
        scheduledFor: p.scheduledFor,
      })),
    )
    .onConflictDoNothing({
      target: [reminders.intakeId, reminders.channel, reminders.step],
    })
    .returning({ id: reminders.id });
  return rows.length;
}

/**
 * Stop the ladder. Called the moment a packet completes, and by the retention
 * sweep for expired links. Only `pending` rows move, so an already-sent rung
 * keeps its history.
 */
export async function cancelReminders(intakeId: string, reason: "completed" | "expired"): Promise<number> {
  const db = getDb();
  const rows = await db
    .update(reminders)
    .set({ status: "cancelled", error: reason })
    .where(and(eq(reminders.intakeId, intakeId), eq(reminders.status, "pending")))
    .returning({ id: reminders.id });
  return rows.length;
}

/**
 * Claim due rungs for sending.
 *
 * The comparison is `scheduled_for <= now()` **inside Postgres**. Passing a JS
 * Date would compare a millisecond-truncated value against a microsecond
 * timestamptz, and a row written by `now()` would read as due and then never be
 * claimed — a ladder that silently never runs.
 */
export async function claimDueReminders(limit = 50): Promise<Reminder[]> {
  const db = getDb();
  const due = await db
    .select({ id: reminders.id })
    .from(reminders)
    .where(and(eq(reminders.status, "pending"), lte(reminders.scheduledFor, sql`now()`)))
    .orderBy(reminders.scheduledFor)
    .limit(limit);
  if (!due.length) return [];

  // Claim by flipping status in one statement: two overlapping ticks cannot both
  // win the same row, because the second sees no `pending` row to update.
  return db
    .update(reminders)
    .set({ status: "sent", sentAt: new Date() })
    .where(
      and(
        inArray(
          reminders.id,
          due.map((r) => r.id),
        ),
        eq(reminders.status, "pending"),
      ),
    )
    .returning();
}

export async function markReminderFailed(id: string, error: string): Promise<void> {
  const db = getDb();
  await db
    .update(reminders)
    .set({ status: "failed", error: error.slice(0, 300), sentAt: null })
    .where(eq(reminders.id, id));
}

export async function recordReminderProvider(id: string, providerMessageId: string): Promise<void> {
  const db = getDb();
  await db.update(reminders).set({ providerMessageId }).where(eq(reminders.id, id));
}

export async function remindersForIntake(intakeId: string): Promise<Reminder[]> {
  const db = getDb();
  return db
    .select()
    .from(reminders)
    .where(eq(reminders.intakeId, intakeId))
    .orderBy(reminders.scheduledFor);
}

/** Pending rungs with no send yet — the "next reminder" line on intake detail. */
export async function nextReminder(intakeId: string): Promise<Reminder | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(reminders)
    .where(and(eq(reminders.intakeId, intakeId), eq(reminders.status, "pending"), isNull(reminders.sentAt)))
    .orderBy(reminders.scheduledFor)
    .limit(1);
  return row ?? null;
}
