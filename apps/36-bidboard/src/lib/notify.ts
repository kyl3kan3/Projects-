/**
 * Every message BidBoard sends, composed in one place.
 *
 * The copy matters more than it looks like it does. A sub decides whether to bid
 * a job from the first two lines of an email in a truck cab, and a GC's
 * relationship with their subs is the asset the product is built on — which is why
 * regret notices are on by default and say a real thing. Subs remember GCs who
 * tell them.
 *
 * Nothing here decides *whether* to send: `sendMail` claims a dedupe key first, so
 * every function below is safe to call twice.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users, type Bid, type Company, type Invitation, type Project, type SubCompany, type SubContact, type TradePackage } from "@/db/schema";
import { sendMail, type MailResult } from "@/lib/email";
import { money, plainDate } from "@/lib/format";
import { portalUrl } from "@/lib/portal-tokens";
import { env } from "@/lib/env";
import type { PortalContext } from "@/lib/portal";

function replyTo(company: Company): string | null {
  return company.replyToEmail ?? null;
}

function dueLine(project: Project): string {
  return `Bids are due ${plainDate(project.bidDueAt)}.`;
}

/* ----------------------------------------------------------------- invites --- */

export async function sendInviteEmail(input: {
  company: Company;
  project: Project;
  pkg: TradePackage;
  subCompany: SubCompany;
  contact: SubContact;
  invitation: Invitation;
  token: string;
  personalNote: string | null;
}): Promise<MailResult> {
  const { company, project, pkg, contact, invitation, token } = input;
  const link = portalUrl(token);
  const note = input.personalNote?.trim();

  const body = [
    `${contact.name.split(" ")[0]},`,
    `${company.name} is inviting ${input.subCompany.name} to bid ${pkg.tradeLabel} (CSI ${pkg.csiDivision}) on ${project.name}${project.address ? `, ${project.address}` : ""}.`,
    note ? note : null,
    `${dueLine(project)} The link below opens the plans, the scope notes and a bid form you can fill on your phone — no account, no password.`,
    pkg.scopeNotes ? `Scope notes: ${pkg.scopeNotes.slice(0, 400)}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  return sendMail({
    companyId: company.id,
    invitationId: invitation.id,
    kind: "invite",
    dedupeKey: `invite:${invitation.id}`,
    to: contact.email,
    subject: `${project.name} — ${pkg.tradeLabel} bid requested by ${company.name}`,
    body,
    replyTo: replyTo(company),
    action: { label: "Open the bid package", url: link },
  });
}

export async function sendReminderEmail(input: {
  company: Company;
  project: Project;
  pkg: TradePackage;
  contact: SubContact;
  invitation: Invitation;
  token: string;
  rung: number;
  dedupeKey: string;
}): Promise<MailResult> {
  const { company, project, pkg, contact, invitation, rung } = input;
  const when =
    rung === 1 ? "tomorrow" : rung === 0 ? "today" : `in ${rung} days`;

  const body = [
    `${contact.name.split(" ")[0]},`,
    `A reminder that ${company.name} is still waiting on your ${pkg.tradeLabel} number for ${project.name}. Bids are due ${when} (${plainDate(project.bidDueAt)}).`,
    `If you are not bidding this one, say so with one tap on the link below — it saves us both a phone call.`,
  ].join("\n\n");

  return sendMail({
    companyId: company.id,
    invitationId: invitation.id,
    kind: "reminder",
    dedupeKey: input.dedupeKey,
    to: contact.email,
    subject: `Reminder: ${pkg.tradeLabel} bid for ${project.name} due ${when}`,
    body,
    replyTo: replyTo(company),
    action: { label: "Open the bid package", url: portalUrl(input.token) },
  });
}

/* -------------------------------------------------------------------- Q & A --- */

/**
 * A broadcast answer. Every bidder on the trade gets the same words at the same
 * time — that is what stops a Q&A from becoming a private advantage.
 */
export async function sendQaBroadcast(input: {
  company: Company;
  project: Project;
  pkg: TradePackage;
  contact: SubContact;
  invitation: Invitation;
  token: string;
  questionId: string;
  question: string;
  answer: string;
}): Promise<MailResult> {
  const body = [
    `A question came in on ${input.pkg.tradeLabel} for ${input.project.name}, and the answer goes to every bidder:`,
    `Q: ${input.question}`,
    `A: ${input.answer}`,
    `${dueLine(input.project)}`,
  ].join("\n\n");

  return sendMail({
    companyId: input.company.id,
    invitationId: input.invitation.id,
    kind: "qa",
    dedupeKey: `qa:${input.questionId}:${input.invitation.id}`,
    to: input.contact.email,
    subject: `${input.project.name} — answer for all ${input.pkg.tradeLabel} bidders`,
    body,
    replyTo: replyTo(input.company),
    action: { label: "Open the bid package", url: portalUrl(input.token) },
  });
}

/* ------------------------------------------------------- award and regret --- */

export async function sendAwardEmail(input: {
  company: Company;
  project: Project;
  pkg: TradePackage;
  contact: SubContact;
  invitation: Invitation;
  totalCents: number;
  note: string | null;
}): Promise<MailResult> {
  const body = [
    `${input.contact.name.split(" ")[0]},`,
    `${input.company.name} is awarding the ${input.pkg.tradeLabel} package on ${input.project.name} to you at ${money(input.totalCents)}.`,
    input.note?.trim() || "A subcontract will follow. Thank you for the number.",
  ].join("\n\n");

  return sendMail({
    companyId: input.company.id,
    invitationId: input.invitation.id,
    kind: "award",
    dedupeKey: `award:${input.pkg.id}:${input.invitation.id}`,
    to: input.contact.email,
    subject: `Awarded: ${input.pkg.tradeLabel} on ${input.project.name}`,
    body,
    replyTo: replyTo(input.company),
  });
}

export async function sendRegretEmail(input: {
  company: Company;
  project: Project;
  pkg: TradePackage;
  contact: SubContact;
  invitation: Invitation;
}): Promise<MailResult> {
  const body = [
    `${input.contact.name.split(" ")[0]},`,
    `${input.company.name} has awarded the ${input.pkg.tradeLabel} package on ${input.project.name} to another bidder. Your number was competitive and we appreciate the time it took to put together.`,
    `We will have you on the next one.`,
  ].join("\n\n");

  return sendMail({
    companyId: input.company.id,
    invitationId: input.invitation.id,
    kind: "regret",
    dedupeKey: `regret:${input.pkg.id}:${input.invitation.id}`,
    to: input.contact.email,
    subject: `${input.project.name} — ${input.pkg.tradeLabel} awarded`,
    body,
    replyTo: replyTo(input.company),
  });
}

/* -------------------------------------------------- inbound to the estimator --- */

/**
 * "A bid just landed." Sent to the GC's seats, deduped per bid revision so a
 * resubmission notifies once and a retry notifies not at all.
 */
export async function notifyBidSubmitted(input: {
  ctx: PortalContext;
  bid: Bid;
  isRevision: boolean;
}): Promise<void> {
  const { ctx, bid } = input;
  const db = getDb();
  const seats = await db.select().from(users).where(eq(users.companyId, ctx.companyId));
  const kindLine =
    bid.kind === "lump_sum"
      ? `a lump sum of ${money(bid.totalCents)}`
      : `${money(bid.totalCents)} across the bid form`;

  for (const seat of seats) {
    if (seat.role === "viewer") continue;
    await sendMail({
      companyId: ctx.companyId,
      invitationId: ctx.invitationId,
      kind: "submitted",
      dedupeKey: `submitted:${bid.id}:${seat.id}`,
      to: seat.email,
      subject: `${ctx.subCompany.name} ${input.isRevision ? `revised their bid (rev ${bid.revision})` : "submitted a bid"} — ${ctx.pkg.tradeLabel}`,
      body: [
        `${ctx.subCompany.name} ${input.isRevision ? `sent revision ${bid.revision} of their` : "submitted a"} ${ctx.pkg.tradeLabel} bid on ${ctx.project.name}: ${kindLine}.`,
        `Open the leveling grid to see where it lands.`,
      ].join("\n\n"),
      replyTo: ctx.company.replyToEmail,
      action: {
        label: "Level the bids",
        url: `${env.appUrl}/projects/${ctx.project.id}/packages/${ctx.pkg.id}/leveling`,
      },
    });
  }
}

/** A sub asked something. The estimator hears about it once. */
export async function notifyQuestionAsked(input: {
  ctx: PortalContext;
  questionId: string;
  body: string;
}): Promise<void> {
  const db = getDb();
  const seats = await db.select().from(users).where(eq(users.companyId, input.ctx.companyId));
  for (const seat of seats) {
    if (seat.role === "viewer") continue;
    await sendMail({
      companyId: input.ctx.companyId,
      invitationId: input.ctx.invitationId,
      kind: "qa",
      dedupeKey: `question:${input.questionId}:${seat.id}`,
      to: seat.email,
      subject: `Question on ${input.ctx.pkg.tradeLabel} — ${input.ctx.project.name}`,
      body: [
        `${input.ctx.subCompany.name} asked a question about ${input.ctx.pkg.tradeLabel} on ${input.ctx.project.name}:`,
        input.body,
        `Answering it broadcasts your answer to every bidder on this trade.`,
      ].join("\n\n"),
      replyTo: input.ctx.company.replyToEmail,
      action: {
        label: "Answer it",
        url: `${env.appUrl}/projects/${input.ctx.project.id}/packages/${input.ctx.pkg.id}`,
      },
    });
  }
}
