/**
 * Outbound mail: invitations, reminders, Q&A broadcasts, award and regret notices.
 *
 * Three guarantees:
 *
 *  - **Once.** Every send claims a row in `email_events` keyed on a dedupe string
 *    *before* the provider is called. The key is unique in Postgres, so a retried
 *    server action and an overlapping cron tick cannot both mail the same sub.
 *    Reminder rungs use `reminder:<invitation>:t3`, which is what pins each rung
 *    to exactly one send for all time.
 *  - **Reply-to the estimator.** Sub replies are half the workflow. Every message
 *    carries the GC's own reply-to so an emailed bid lands with the person chasing
 *    it, not in a shared inbox nobody reads.
 *  - **No key, no silence.** With no `RESEND_API_KEY` (or `DRY_RUN=1`) the message
 *    is logged in full and recorded as `logged`. A missing credential is never
 *    recorded as a delivery.
 */

import { Resend } from "resend";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { emailEvents, type EmailKind, type EmailStatus } from "@/db/schema";
import { env, has } from "@/lib/env";

let _resend: Resend | null = null;
function resend(): Resend {
  if (!_resend) _resend = new Resend(env.resendApiKey);
  return _resend;
}

export interface Mail {
  companyId: string;
  invitationId?: string | null;
  kind: EmailKind;
  /** Unique per logical message: `invite:<invitation>` / `reminder:<inv>:t3`. */
  dedupeKey: string;
  to: string;
  subject: string;
  /** Plain text. Subs read these on phones; the HTML is generated from it. */
  body: string;
  replyTo?: string | null;
  action?: { label: string; url: string };
}

export type MailResult = "sent" | "logged" | "duplicate" | "failed";

/** Claim the dedupe row. False means this message was already handled. */
async function claim(mail: Mail): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .insert(emailEvents)
    .values({
      companyId: mail.companyId,
      invitationId: mail.invitationId ?? null,
      kind: mail.kind,
      dedupeKey: mail.dedupeKey,
      toAddress: mail.to,
      subject: mail.subject,
      status: "queued",
    })
    .onConflictDoNothing({ target: emailEvents.dedupeKey })
    .returning({ id: emailEvents.id });
  return rows.length > 0;
}

async function finish(
  dedupeKey: string,
  status: EmailStatus,
  extra: { providerMessageId?: string | null; error?: string } = {},
): Promise<void> {
  const db = getDb();
  await db
    .update(emailEvents)
    .set({
      status,
      providerMessageId: extra.providerMessageId ?? null,
      error: extra.error?.slice(0, 500) ?? null,
      occurredAt: new Date(),
    })
    .where(eq(emailEvents.dedupeKey, dedupeKey));
}

function textBody(mail: Mail): string {
  const lines = [mail.body.trim()];
  if (mail.action) lines.push("", `${mail.action.label}: ${mail.action.url}`);
  lines.push("", "Your numbers are never shown to other bidders, and never sold.");
  return lines.join("\n");
}

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Deliberately plain HTML on the portal's light ground: a sub opening this in a
 * truck cab needs a legible sentence and one button, not a layout.
 */
function htmlBody(mail: Mail): string {
  const paragraphs = mail.body
    .trim()
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;line-height:1.55">${escape(p).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
  const action = mail.action
    ? `<p style="margin:24px 0 0"><a href="${escape(mail.action.url)}" style="display:inline-block;background:#1B2129;color:#F2F4F6;text-decoration:none;padding:14px 20px;border-radius:8px;font-weight:600;font-size:15px">${escape(mail.action.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#F4F5F6;color:#1B2129;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px"><div style="max-width:520px;margin:0 auto;padding:32px 20px">${paragraphs}${action}<p style="margin:32px 0 0;font-size:13px;color:#5C6873">Bid requested via BidBoard. Your numbers are never shown to other bidders, and never sold.</p></div></body></html>`;
}

export async function sendMail(mail: Mail): Promise<MailResult> {
  if (!(await claim(mail))) return "duplicate";

  const live = has("RESEND_API_KEY") && !env.dryRun;
  if (!live) {
    console.info(
      `[email] would send (${env.dryRun ? "DRY_RUN=1" : "no RESEND_API_KEY"})\n  to: ${mail.to}\n  reply-to: ${mail.replyTo ?? "-"}\n  subject: ${mail.subject}\n  ${textBody(mail).replace(/\n/g, "\n  ")}`,
    );
    await finish(mail.dedupeKey, "logged");
    return "logged";
  }

  try {
    const { data, error } = await resend().emails.send({
      from: env.emailFrom,
      to: mail.to,
      subject: mail.subject,
      text: textBody(mail),
      html: htmlBody(mail),
      ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
    });
    if (error) {
      await finish(mail.dedupeKey, "failed", { error: error.message });
      return "failed";
    }
    await finish(mail.dedupeKey, "sent", { providerMessageId: data?.id ?? null });
    return "sent";
  } catch (err) {
    await finish(mail.dedupeKey, "failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return "failed";
  }
}

/** Was this message already handled? Lets the sweep skip work before composing. */
export async function alreadySent(dedupeKey: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ id: emailEvents.id })
    .from(emailEvents)
    .where(eq(emailEvents.dedupeKey, dedupeKey));
  return Boolean(row);
}

/**
 * Delivery events from Resend. Opens and bounces are what make the status board
 * honest — "sent" is not "read", and a bounce has to surface immediately or the
 * estimator chases a sub who never got the invite.
 */
export async function recordDeliveryEvent(input: {
  providerMessageId: string;
  status: Extract<EmailStatus, "delivered" | "opened" | "bounced">;
  occurredAt?: Date;
}): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(emailEvents)
    .where(eq(emailEvents.providerMessageId, input.providerMessageId));
  if (!row) return null;

  // Never walk the ladder backwards: a "delivered" webhook arriving after an
  // "opened" one must not un-open the invitation.
  const rank: Record<string, number> = {
    queued: 0,
    logged: 1,
    sent: 2,
    delivered: 3,
    opened: 4,
    bounced: 5,
    failed: 5,
  };
  if ((rank[input.status] ?? 0) <= (rank[row.status] ?? 0)) return row.invitationId;

  await db
    .update(emailEvents)
    .set({ status: input.status, occurredAt: input.occurredAt ?? new Date() })
    .where(eq(emailEvents.id, row.id));
  return row.invitationId;
}

/** Per-invitation email history for the status board's secondary line. */
export async function emailHistoryFor(invitationIds: string[]) {
  if (invitationIds.length === 0) return [];
  const db = getDb();
  return db
    .select()
    .from(emailEvents)
    .where(inArray(emailEvents.invitationId, invitationIds));
}

export async function emailsForCompany(companyId: string, kind: EmailKind) {
  const db = getDb();
  return db
    .select()
    .from(emailEvents)
    .where(and(eq(emailEvents.companyId, companyId), eq(emailEvents.kind, kind)));
}
