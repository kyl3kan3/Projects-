/**
 * Outbound email and SMS, and the `deliveries` rows that make every send
 * auditable.
 *
 * Two safety rules, both of them because the recipients are somebody's actual
 * neighbours:
 *
 *  1. **DRY_RUN defaults to on.** An association's real roster gets imported
 *     into a dev database constantly. A stray reminder run to 63 households is
 *     not recoverable, so sends are logged and recorded as `sent` with a
 *     `[dry-run]` note unless DRY_RUN=0 *and* a provider key exists.
 *  2. **SMS requires opt-in, checked here, not at the call site.** Passing an
 *     un-opted-in member to `sendSms` records `opted_out` and sends nothing.
 *     TCPA is not a UI concern.
 */

import { and, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import {
  deliveries,
  members,
  type DeliveryChannel,
  type DeliveryStatus,
  type Member,
} from "@/db/schema";
import { env } from "@/lib/env";
import { escapeHtml, normalizePhone, renderTemplate } from "@/lib/text";

export { normalizePhone, renderTemplate };

export interface DeliveryContext {
  associationId: string;
  memberId: string | null;
  purpose: string;
  announcementId?: string | null;
  invoiceId?: string | null;
  issueId?: string | null;
}

export interface SendResult {
  status: DeliveryStatus;
  providerMessageId: string | null;
  error: string | null;
}

async function record(
  ctx: DeliveryContext,
  channel: DeliveryChannel,
  destination: string,
  result: SendResult,
): Promise<void> {
  await getDb()
    .insert(deliveries)
    .values({
      associationId: ctx.associationId,
      announcementId: ctx.announcementId ?? null,
      invoiceId: ctx.invoiceId ?? null,
      issueId: ctx.issueId ?? null,
      memberId: ctx.memberId,
      channel,
      destination,
      purpose: ctx.purpose,
      status: result.status,
      providerMessageId: result.providerMessageId,
      error: result.error,
    })
    // An announcement fan-out that half-failed can be retried without
    // re-emailing the people who already received it.
    .onConflictDoNothing();
}

/* ----------------------------------------------------------------- email --- */

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain text. HTML is derived from it — DuesDesk emails are letters. */
  text: string;
  replyTo?: string;
}

function emailHtml(subject: string, text: string): string {
  const escape = escapeHtml;
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.55">${escape(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f7f4;color:#1e2732;font:16px/1.55 -apple-system,Segoe UI,Helvetica,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;background:#fdfdfb;border:1px solid #e2e5de;border-radius:12px;padding:24px">
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${escape(subject)}</h1>
${paragraphs}
</div></body></html>`;
}

export async function sendEmail(
  ctx: DeliveryContext,
  message: EmailMessage,
): Promise<SendResult> {
  if (!message.to) {
    const result: SendResult = { status: "skipped", providerMessageId: null, error: "no email address on file" };
    await record(ctx, "email", "", result);
    return result;
  }

  if (env.dryRun || !env.resendApiKey) {
    const reason = env.dryRun ? "DRY_RUN" : "no RESEND_API_KEY";
    console.info(`[email:${reason}] to=${message.to} subject=${message.subject}`);
    const result: SendResult = {
      status: "sent",
      providerMessageId: `dryrun_${Date.now().toString(36)}`,
      error: `[dry-run: ${reason}] not actually delivered`,
    };
    await record(ctx, "email", message.to, result);
    return result;
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(env.resendApiKey);
    const res = await resend.emails.send({
      from: env.emailFrom,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: emailHtml(message.subject, message.text),
      replyTo: message.replyTo,
    });
    if (res.error) throw new Error(res.error.message);
    const result: SendResult = {
      status: "sent",
      providerMessageId: res.data?.id ?? null,
      error: null,
    };
    await record(ctx, "email", message.to, result);
    return result;
  } catch (err) {
    const result: SendResult = {
      status: "failed",
      providerMessageId: null,
      error: err instanceof Error ? err.message : "send failed",
    };
    await record(ctx, "email", message.to, result);
    return result;
  }
}

/* ------------------------------------------------------------------- sms --- */

export async function sendSms(
  ctx: DeliveryContext,
  member: Pick<Member, "phone" | "smsOptIn">,
  body: string,
): Promise<SendResult> {
  if (!member.smsOptIn || !member.phone) {
    const result: SendResult = {
      status: member.phone ? "opted_out" : "skipped",
      providerMessageId: null,
      error: member.phone ? "member has not opted in to SMS" : "no phone number on file",
    };
    await record(ctx, "sms", member.phone ?? "", result);
    return result;
  }

  const { accountSid, authToken, from } = env.twilio;
  if (env.dryRun || !accountSid || !authToken || !from) {
    const reason = env.dryRun ? "DRY_RUN" : "Twilio not configured";
    console.info(`[sms:${reason}] to=${member.phone} body=${body.slice(0, 60)}`);
    const result: SendResult = {
      status: "sent",
      providerMessageId: `dryrun_${Date.now().toString(36)}`,
      error: `[dry-run: ${reason}] not actually delivered`,
    };
    await record(ctx, "sms", member.phone, result);
    return result;
  }

  try {
    // Twilio's REST API over fetch: one HTTP call, no SDK in the serverless
    // bundle, and the auth is a basic header.
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: member.phone, From: from, Body: body }),
      },
    );
    const json = (await res.json()) as { sid?: string; message?: string };
    if (!res.ok) throw new Error(json.message ?? `Twilio returned ${res.status}`);
    const result: SendResult = { status: "sent", providerMessageId: json.sid ?? null, error: null };
    await record(ctx, "sms", member.phone, result);
    return result;
  } catch (err) {
    const result: SendResult = {
      status: "failed",
      providerMessageId: null,
      error: err instanceof Error ? err.message : "send failed",
    };
    await record(ctx, "sms", member.phone, result);
    return result;
  }
}

/* ------------------------------------------------------- consent handling --- */

/**
 * A STOP reply. Honored immediately and for every member sharing the number —
 * households share phones, and TCPA does not care whose row it was.
 */
export async function recordStopReply(phone: string): Promise<number> {
  const db = getDb();
  const normalized = normalizePhone(phone);
  const rows = await db
    .update(members)
    .set({ smsOptIn: false, smsOptedOutAt: new Date() })
    .where(and(eq(members.phone, normalized), isNotNull(members.phone)))
    .returning({ id: members.id });
  return rows.length;
}

/** Opt-in is only ever set by the member's own action (portal toggle). */
export async function setSmsOptIn(memberId: string, optIn: boolean): Promise<void> {
  await getDb()
    .update(members)
    .set({ smsOptIn: optIn, smsOptedOutAt: optIn ? null : new Date() })
    .where(eq(members.id, memberId));
}
