/**
 * Outbound messages: the Monday crew link by SMS, cert escalations and
 * missed-talk nudges by email.
 *
 * Two things here are load-bearing.
 *
 * **DRY_RUN.** Field phone numbers belong to real people. When DRY_RUN is on —
 * and it defaults on whenever no provider credential is configured — nothing
 * leaves the building; the message is logged and recorded in the ledger with
 * `dryRun: true`, so the sweep is still fully exercisable.
 *
 * **The ledger claims before it sends.** `claimRung` inserts the
 * (target, rung, channel) row with ON CONFLICT DO NOTHING and only sends if the
 * insert produced a row. A cron that fires twice in a day therefore sends once,
 * and a 60-day warning cannot be the only notice a customer ever receives,
 * because each rung is its own row. The trade is deliberate: a send that throws
 * after the claim is not retried, which is the right way round for email — a
 * duplicate escalation at 3am costs trust, a missed one costs a reminder.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { reminders, type ReminderChannel, type ReminderRung, type ReminderTargetKind } from "@/db/schema";
import { env } from "@/lib/env";

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain text. The templates here are deliberately plain: they get read on
   *  phones in trucks, and a nudge is one sentence and a link. */
  text: string;
}

export interface SmsMessage {
  to: string;
  body: string;
}

export type SendResult = { sent: boolean; dryRun: boolean; error?: string };

export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  if (env.dryRun || !env.resendApiKey) {
    console.info(`[dry-run email] to=${msg.to} subject=${msg.subject}\n${msg.text}`);
    return { sent: false, dryRun: true };
  }
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(env.resendApiKey);
    const res = await resend.emails.send({
      from: env.emailFrom,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
    });
    if (res.error) return { sent: false, dryRun: false, error: res.error.message };
    return { sent: true, dryRun: false };
  } catch (err) {
    return { sent: false, dryRun: false, error: err instanceof Error ? err.message : "send failed" };
  }
}

export async function sendSms(msg: SmsMessage): Promise<SendResult> {
  const { accountSid, authToken, fromNumber } = env.twilio;
  if (env.dryRun || !accountSid || !authToken || !fromNumber) {
    console.info(`[dry-run sms] to=${msg.to}\n${msg.body}`);
    return { sent: false, dryRun: true };
  }
  try {
    const twilio = (await import("twilio")).default;
    const client = twilio(accountSid, authToken);
    await client.messages.create({ to: msg.to, from: fromNumber, body: msg.body });
    return { sent: true, dryRun: false };
  } catch (err) {
    return { sent: false, dryRun: false, error: err instanceof Error ? err.message : "send failed" };
  }
}

export interface RungClaim {
  companyId: string;
  targetKind: ReminderTargetKind;
  targetId: string;
  rung: ReminderRung;
  channel: ReminderChannel;
  detail?: Record<string, unknown>;
}

/**
 * Claim a rung. Returns the reminder id when this call is the one that won it,
 * and null when it was already sent — the caller then skips the send.
 */
export async function claimRung(claim: RungClaim): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .insert(reminders)
    .values({
      companyId: claim.companyId,
      targetKind: claim.targetKind,
      targetId: claim.targetId,
      rung: claim.rung,
      channel: claim.channel,
      detail: claim.detail ?? null,
    })
    .onConflictDoNothing({
      target: [reminders.targetKind, reminders.targetId, reminders.rung, reminders.channel],
    })
    .returning({ id: reminders.id });
  return row?.id ?? null;
}

/** Record what actually happened on a claimed rung. */
export async function annotateRung(
  reminderId: string,
  detail: Record<string, unknown>,
): Promise<void> {
  const db = getDb();
  await db.update(reminders).set({ detail }).where(eq(reminders.id, reminderId));
}
