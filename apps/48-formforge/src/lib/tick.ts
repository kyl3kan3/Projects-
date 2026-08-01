/**
 * src/lib/tick.ts
 *
 * The scheduled work, in one bounded pass:
 *
 *   1. roll links past their expiry into `expired` and cancel their reminders
 *   2. send every reminder rung that has come due
 *   3. run the retention sweep for each practice
 *
 * Written to be correct **at any frequency**. Vercel Hobby cron runs once a day;
 * the long-lived worker (`npm run worker`) calls this every minute. Neither
 * assumes the other ran: nothing here keeps a cursor, every step works from
 * current state, and every step is idempotent. A time budget stops the pass
 * early rather than timing out — the next pass picks up the same facts.
 *
 * ARCHITECTURE.md specifies BullMQ on Redis for this. It is a Postgres ledger
 * instead, deliberately: the brief's deployment target has no always-on process,
 * and a delayed-job queue whose jobs are "send this row" is a second source of
 * truth for something the database already knows. The ledger also survives a
 * Redis flush, which a reminder ladder measured in days needs to.
 */

import { and, eq, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { intakes, patients, practices, users, type Reminder } from "@/db/schema";
import { env } from "@/lib/env";
import { sendEmail, sendSms } from "@/lib/delivery";
import {
  claimDueReminders,
  markReminderFailed,
  recordReminderProvider,
} from "@/lib/reminders";
import { expireStaleIntakes, retentionSweep } from "@/lib/intakes";
import { intakeReminderEmail, intakeReminderSms, intakeUrl } from "@/lib/messages";
import { appendAuditEvent } from "@/lib/audit";
import { practiceDek } from "@/lib/phi";
import { open } from "@/lib/crypto";
import { settingsOf } from "@/lib/practices";
import { purgeUploadObjects } from "@/lib/uploads";

export interface TickResult {
  expired: number;
  remindersSent: number;
  remindersSkipped: number;
  remindersFailed: number;
  retentionDeleted: number;
  budgetHit: boolean;
  ms: number;
}

const DEFAULT_BUDGET_MS = 50_000;

/**
 * A reminder needs the raw link token to be useful, and the raw token was never
 * stored — that is the point of hashing it. So a reminder re-issues the link by
 * minting a fresh token for the same intake, which also means a forwarded old
 * email stops working. The alternative (keeping the raw token) would put a
 * replayable credential in the database.
 */
async function reissueForReminder(intakeId: string): Promise<string> {
  const { generateIntakeToken, hashIntakeToken } = await import("@/lib/crypto");
  const rawToken = generateIntakeToken();
  const db = getDb();
  await db
    .update(intakes)
    .set({ tokenHash: hashIntakeToken(rawToken, env.intakeTokenSecret), updatedAt: new Date() })
    .where(eq(intakes.id, intakeId));
  return rawToken;
}

async function deliverReminder(reminder: Reminder): Promise<"sent" | "skipped" | "failed"> {
  const db = getDb();
  const [intake] = await db.select().from(intakes).where(eq(intakes.id, reminder.intakeId));
  if (!intake) return "skipped";
  // Completed, signed, or expired between scheduling and now: say nothing.
  if (!["sent", "started"].includes(intake.status)) return "skipped";
  if (intake.expiresAt.getTime() <= Date.now()) return "skipped";

  const [practice] = await db.select().from(practices).where(eq(practices.id, intake.practiceId));
  if (!practice) return "skipped";
  const [patient] = await db.select().from(patients).where(eq(patients.id, intake.patientId));
  if (!patient) return "skipped";

  const dek = practiceDek(practice);
  // A first name, an email address and a phone number. The message templates
  // cannot see anything else — see lib/messages.ts.
  const firstName = open(patient.firstNameEnc, dek).toString("utf8");
  const email = patient.emailEnc ? open(patient.emailEnc, dek).toString("utf8") : null;
  const phone = patient.phoneEnc ? open(patient.phoneEnc, dek).toString("utf8") : null;

  if (reminder.channel === "sms" && (patient.smsOptOut || !phone)) return "skipped";
  if (reminder.channel === "email" && !email) return "skipped";

  const rawToken = await reissueForReminder(intake.id);
  const url = intakeUrl(env.appUrl, rawToken);
  const inputs = { firstName, practiceName: practice.name, url };

  const result =
    reminder.channel === "email"
      ? await sendEmail(email!, intakeReminderEmail(inputs))
      : await sendSms(phone!, intakeReminderSms(inputs));

  if (!result.ok) {
    await markReminderFailed(reminder.id, result.error ?? "delivery failed");
    return "failed";
  }
  if (result.providerMessageId) await recordReminderProvider(reminder.id, result.providerMessageId);

  await appendAuditEvent({
    practiceId: intake.practiceId,
    actorType: "system",
    actorId: "cron",
    actorLabel: "reminder scheduler",
    action: "reminded",
    targetType: "intake",
    targetId: intake.id,
    targetLabel: `reminder ${reminder.step + 1}`,
    metadata: { channel: reminder.channel, step: reminder.step, result: result.simulated ? "simulated" : "sent" },
  });
  return "sent";
}

export async function runTick(opts: { budgetMs?: number } = {}): Promise<TickResult> {
  const startedAt = Date.now();
  const budget = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const result: TickResult = {
    expired: 0,
    remindersSent: 0,
    remindersSkipped: 0,
    remindersFailed: 0,
    retentionDeleted: 0,
    budgetHit: false,
    ms: 0,
  };

  result.expired = await expireStaleIntakes();

  const due = await claimDueReminders(100);
  for (const reminder of due) {
    if (Date.now() - startedAt > budget) {
      result.budgetHit = true;
      break;
    }
    try {
      const outcome = await deliverReminder(reminder);
      if (outcome === "sent") result.remindersSent += 1;
      else if (outcome === "skipped") result.remindersSkipped += 1;
      else result.remindersFailed += 1;
    } catch (err) {
      console.error("[tick] reminder failed", reminder.id, err);
      await markReminderFailed(reminder.id, err instanceof Error ? err.message : "unknown error");
      result.remindersFailed += 1;
    }
  }

  const db = getDb();
  const allPractices = await db.select().from(practices);
  for (const practice of allPractices) {
    if (Date.now() - startedAt > budget) {
      result.budgetHit = true;
      break;
    }
    const settings = settingsOf(practice);
    result.retentionDeleted += await retentionSweepWithObjects(practice.id, settings);
  }

  result.ms = Date.now() - startedAt;
  return result;
}

/**
 * The retention sweep with object storage handled first — deleting the row before
 * the object would orphan the object forever, and an orphaned encrypted file is
 * still a record you told a practice you had deleted.
 *
 * The cutoff comparison happens in Postgres (`sent_at <= now() - interval`), not
 * against a JS Date, so a millisecond-truncated value can never disagree with a
 * microsecond `timestamptz`.
 */
async function retentionSweepWithObjects(
  practiceId: string,
  settings: ReturnType<typeof settingsOf>,
): Promise<number> {
  const db = getDb();
  const doomed = await db
    .select({ id: intakes.id })
    .from(intakes)
    .where(
      and(
        eq(intakes.practiceId, practiceId),
        lte(intakes.sentAt, sql`now() - make_interval(years => ${settings.retentionYears})`),
      ),
    )
    .limit(200);
  if (!doomed.length) return 0;
  for (const row of doomed) await purgeUploadObjects(practiceId, row.id);
  return retentionSweep(practiceId, settings);
}

/** Owners of a practice, for the clinician notification. */
export async function practiceRecipients(practiceId: string): Promise<{ name: string; email: string }[]> {
  const db = getDb();
  const rows = await db
    .select({ name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.practiceId, practiceId));
  return rows.filter((r) => r.role !== "frontdesk").map((r) => ({ name: r.name, email: r.email }));
}
