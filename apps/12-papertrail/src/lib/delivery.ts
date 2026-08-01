/**
 * Sending documents to clients.
 *
 * One path for all three document types, because they are one chain: the share
 * link is the document, the email is a covering note, and both are recorded on
 * the timeline whether or not the mail provider was reachable.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { documents, reminderSends, type Brand, type Client, type DocumentRow } from "@/db/schema";
import { env } from "@/lib/env";
import { plan } from "@/lib/plans";
import { formatMoney } from "@/lib/money";
import { describeDue, formatShortDate } from "@/lib/dates";
import { logEvent, transition } from "@/lib/documents";
import { sendMail, type SendResult } from "@/lib/email";
import type { PlanId } from "@/db/schema";

/** The client-facing URL for a document. */
export function documentUrl(token: string): string {
  return `${env.appUrl}/d/${token}`;
}

export interface DeliveryContext {
  document: DocumentRow;
  client: Client;
  brand: Brand | null;
  freelancerName: string;
  freelancerEmail: string;
  planId: PlanId;
  total: number;
  invoiceNumber?: string | null;
  dueAt?: Date | null;
}

/** The covering note for each document type. Short, and it links to the sheet. */
export function coveringNote(ctx: DeliveryContext): { subject: string; body: string } {
  const link = documentUrl(ctx.document.publicToken);
  const amount = formatMoney(ctx.total, ctx.document.currency);
  const from = ctx.freelancerName;
  const badge = plan(ctx.planId).badge ? "\n\nSent with PaperTrail — papertrail.app" : "";

  if (ctx.document.type === "proposal") {
    return {
      subject: `Proposal — ${ctx.document.title}`,
      body: [
        `Hi ${ctx.client.name},`,
        `Here's the proposal for ${ctx.document.title}, ${amount} in total. Optional extras are marked, and you can tick the ones you want before accepting — the total updates as you do.`,
        `Read and accept it here: ${link}`,
        `Any questions, just reply to this email.`,
        `${from}${badge}`,
      ].join("\n\n"),
    };
  }
  if (ctx.document.type === "contract") {
    const deposit = ctx.document.depositPercent;
    const depositLine =
      deposit > 0
        ? `Signing sends you the ${deposit}% deposit invoice straight away; the balance is invoiced on completion.`
        : `The full amount is invoiced on completion.`;
    return {
      subject: `Contract for signature — ${ctx.document.title}`,
      body: [
        `Hi ${ctx.client.name},`,
        `This is the agreement for ${ctx.document.title}, based on exactly what you accepted (${amount}). ${depositLine}`,
        `You can read and sign it here: ${link}`,
        `It takes about a minute — type or draw your signature, and you'll get a copy of the signed record.`,
        `${from}${badge}`,
      ].join("\n\n"),
    };
  }
  const due = ctx.dueAt ? ` It's ${describeDue(ctx.dueAt, new Date())}.` : "";
  return {
    subject: `${ctx.invoiceNumber ?? "Invoice"} — ${amount} — ${ctx.document.title}`,
    body: [
      `Hi ${ctx.client.name},`,
      `Invoice ${ctx.invoiceNumber ?? ""} for ${ctx.document.title} is attached to the link below — ${amount}.${due}`,
      `View and pay it here: ${link}`,
      `Thanks,\n${from}${badge}`,
    ].join("\n\n"),
  };
}

/**
 * Send a document. Moves a draft to `sent`, stamps `sentAt`, mails the covering
 * note, and records the attempt. Re-sending an already-sent document is allowed
 * (clients lose emails) and does not reset the status or the terms clock.
 */
export async function sendDocument(ctx: DeliveryContext): Promise<SendResult> {
  const db = getDb();
  const first = ctx.document.status === "draft";
  const now = new Date();

  if (first) {
    const moved = await transition(ctx.document.id, "sent", { sentAt: now });
    if (!moved) throw new Error("This document can't be sent from its current state.");
    ctx.document.status = "sent";
    ctx.document.sentAt = now;
  }

  const note = coveringNote(ctx);
  const result = await sendMail({
    to: ctx.client.email,
    subject: note.subject,
    body: note.body,
    replyTo: ctx.freelancerEmail,
    fromName: ctx.brand?.name ?? ctx.freelancerName,
    senderDomain:
      plan(ctx.planId).senderDomain && ctx.brand?.senderDomainVerified
        ? ctx.brand?.senderDomain
        : null,
  });

  await logEvent(
    ctx.document.id,
    "sent",
    result.delivered
      ? `Emailed to ${ctx.client.email}`
      : `Link ready — email not sent (${result.error ?? "no provider"})`,
    "you",
    { messageId: result.messageId ?? null },
  );

  if (!first) {
    await db.update(documents).set({ updatedAt: now }).where(eq(documents.id, ctx.document.id));
  }
  return result;
}

/** Send a reminder and log it against the sequence. One row per step, ever. */
export async function sendReminder(args: {
  documentId: string;
  step: number;
  to: string;
  cc?: string[];
  subject: string;
  body: string;
  replyTo: string;
  fromName: string;
  senderDomain: string | null;
}): Promise<SendResult> {
  const db = getDb();
  // Claim the step first: the unique index means a concurrent sweep loses here
  // rather than sending a second copy of the same notice.
  const claimed = await db
    .insert(reminderSends)
    .values({ documentId: args.documentId, step: args.step, toEmail: args.to })
    .onConflictDoNothing({ target: [reminderSends.documentId, reminderSends.step] })
    .returning();
  if (!claimed.length) return { delivered: false, error: "Already sent" };

  const result = await sendMail({
    to: args.to,
    cc: args.cc,
    subject: args.subject,
    body: args.body,
    replyTo: args.replyTo,
    fromName: args.fromName,
    senderDomain: args.senderDomain,
  });

  await db
    .update(reminderSends)
    .set({
      delivered: result.delivered,
      providerMessageId: result.messageId ?? null,
      error: result.error ?? null,
    })
    .where(eq(reminderSends.id, claimed[0].id));

  await logEvent(
    args.documentId,
    "reminded",
    result.delivered
      ? `Reminder ${args.step} of 3 sent to ${args.to}`
      : `Reminder ${args.step} of 3 could not be emailed (${result.error ?? "no provider"})`,
    "papertrail",
  );
  return result;
}

/** "Signed Jul 14" — used on chain cards. */
export function stampLine(document: DocumentRow): string {
  if (document.signedAt) return `Signed ${formatShortDate(document.signedAt)}`;
  if (document.acceptedAt) return `Accepted ${formatShortDate(document.acceptedAt)}`;
  if (document.sentAt) return `Sent ${formatShortDate(document.sentAt)}`;
  return "Draft";
}
