/**
 * The notification texts, in one place.
 *
 * Every one of these is a message a client or an agency owner actually reads, so
 * they are written, not templated out of field names. They all go through
 * `sendMail`, which dedupes and falls back to logging when there is no API key.
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  contacts,
  portals,
  users,
  workspaces,
  type Approval,
  type Contact,
  type Invoice,
  type Portal,
  type Thread,
  type Workspace,
} from "@/db/schema";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/email";
import { magicLinkUrl } from "@/lib/magic-auth";
import { replyAddressFor } from "@/lib/messages";
import { moneyShort } from "@/lib/format";

/** The base URL a client should be sent to: the agency's domain when it verifies. */
export function portalBaseUrl(workspace: Workspace): string {
  if (workspace.customDomain && workspace.customDomainVerifiedAt) {
    return `https://${workspace.customDomain}`;
  }
  return env.appUrl;
}

export function portalUrl(workspace: Workspace, portal: Portal, path = ""): string {
  return `${portalBaseUrl(workspace)}/p/${portal.slug}${path}`;
}

async function ownerEmail(workspace: Workspace): Promise<string | null> {
  const db = getDb();
  const [owner] = await db.select().from(users).where(eq(users.id, workspace.ownerUserId));
  return owner?.email ?? null;
}

async function portalContacts(portal: Portal): Promise<Contact[]> {
  if (!portal.clientId) return [];
  const db = getDb();
  return db.select().from(contacts).where(eq(contacts.clientId, portal.clientId));
}

/* ------------------------------------------------------------ invitation --- */

export async function sendInvitation(input: {
  workspace: Workspace;
  portal: Portal;
  contact: Contact;
  token: string;
  tokenId: string;
}): Promise<void> {
  const url = magicLinkUrl(portalBaseUrl(input.workspace), input.token);
  await sendMail(
    {
      workspaceId: input.workspace.id,
      portalId: input.portal.id,
      kind: "invitation",
      // The token row id: one invitation email per link minted, never a second.
      dedupeKey: `invite:${input.tokenId}`,
      to: input.contact.email,
      subject: `Your ${input.workspace.name} project portal`,
      body: `Hello ${input.contact.name},\n\n${input.workspace.name} has set up a private portal for ${input.portal.title}. Status, files, approvals and invoices live there — no password to remember, and no need to email for an update.\n\nThe link below is yours alone. It works once and opens the portal on this device for the next two months.`,
      action: { label: "Open your portal", url },
    },
    input.workspace,
  );
}

/* -------------------------------------------------------------- approvals --- */

export async function notifyApprovalRequested(input: {
  workspace: Workspace;
  portal: Portal;
  approval: Approval;
}): Promise<void> {
  const url = portalUrl(input.workspace, input.portal, `/approvals/${input.approval.id}`);
  for (const contact of await portalContacts(input.portal)) {
    await sendMail(
      {
        workspaceId: input.workspace.id,
        portalId: input.portal.id,
        kind: "approval_requested",
        dedupeKey: `approval:${input.approval.id}:requested:${contact.id}`,
        to: contact.email,
        subject: `Approval needed: ${input.approval.title}`,
        body: `Hello ${contact.name},\n\n${input.workspace.name} has something for you to look at: ${input.approval.title}.\n\nOne tap approves it. If it isn't right, request changes and say what needs to move — it goes straight back to the team with your note attached.`,
        action: { label: "Review it", url },
      },
      input.workspace,
    );
  }
}

export async function notifyApprovalDecided(input: {
  workspace: Workspace;
  portal: Portal;
  approval: Approval;
  decidedBy: string;
}): Promise<void> {
  const to = await ownerEmail(input.workspace);
  if (!to) return;
  const approved = input.approval.status === "approved";
  await sendMail(
    {
      workspaceId: input.workspace.id,
      portalId: input.portal.id,
      kind: "approval_decided",
      dedupeKey: `approval:${input.approval.id}:decided`,
      to,
      subject: approved
        ? `Approved: ${input.approval.title}`
        : `Changes requested: ${input.approval.title}`,
      body: approved
        ? `${input.decidedBy} approved ${input.approval.title} on the ${input.portal.title} portal.\n\nThe audit trail has the timestamp, and the file is badged approved in the portal's file list.`
        : `${input.decidedBy} asked for changes on ${input.approval.title} (${input.portal.title}).\n\nWhat they wrote:\n\n${input.approval.decisionComment ?? "(no comment)"}`,
      action: { label: "Open the portal", url: portalUrl(input.workspace, input.portal, "/approvals") },
    },
    input.workspace,
  );
}

/* --------------------------------------------------------------- messages --- */

export async function notifyMessageToClient(input: {
  workspace: Workspace;
  portal: Portal;
  thread: Thread;
  messageId: string;
  authorName: string;
  body: string;
}): Promise<void> {
  const url = portalUrl(input.workspace, input.portal, "/messages");
  for (const contact of await portalContacts(input.portal)) {
    await sendMail(
      {
        workspaceId: input.workspace.id,
        portalId: input.portal.id,
        kind: "message",
        dedupeKey: `message:${input.messageId}:${contact.id}`,
        to: contact.email,
        subject: `${input.thread.subject}`,
        body: `${input.authorName} wrote:\n\n${input.body}\n\nReply to this email and it lands in the portal thread — you don't have to open anything.`,
        // The whole point of the messages module: reply-to threading.
        replyTo: replyAddressFor(input.thread),
        action: { label: "Open the thread", url },
      },
      input.workspace,
    );
  }
}

export async function notifyMessageToAgency(input: {
  workspace: Workspace;
  portal: Portal;
  thread: Thread;
  messageId: string;
  authorName: string;
  body: string;
}): Promise<void> {
  const to = await ownerEmail(input.workspace);
  if (!to) return;
  await sendMail(
    {
      workspaceId: input.workspace.id,
      portalId: input.portal.id,
      kind: "message",
      dedupeKey: `message:${input.messageId}:agency`,
      to,
      subject: `${input.portal.title}: ${input.thread.subject}`,
      body: `${input.authorName} replied on the ${input.portal.title} portal:\n\n${input.body}`,
      replyTo: replyAddressFor(input.thread),
      action: { label: "Open the thread", url: portalUrl(input.workspace, input.portal, "/messages") },
    },
    input.workspace,
  );
}

/* --------------------------------------------------------------- invoices --- */

export async function notifyInvoice(input: {
  workspace: Workspace;
  portal: Portal;
  invoice: Invoice;
}): Promise<void> {
  const url = portalUrl(input.workspace, input.portal, "/invoices");
  for (const contact of await portalContacts(input.portal)) {
    await sendMail(
      {
        workspaceId: input.workspace.id,
        portalId: input.portal.id,
        kind: "invoice",
        dedupeKey: `invoice:${input.invoice.id}:${contact.id}`,
        to: contact.email,
        subject: `Invoice ${input.invoice.number} — ${moneyShort(input.invoice.amountCents, input.invoice.currency)}`,
        body: `Hello ${contact.name},\n\nInvoice ${input.invoice.number} for ${moneyShort(
          input.invoice.amountCents,
          input.invoice.currency,
        )} is on your portal${input.invoice.dueAt ? `, due ${input.invoice.dueAt.toISOString().slice(0, 10)}` : ""}. You can pay it there.`,
        action: { label: "View the invoice", url },
      },
      input.workspace,
    );
  }
}

/* ------------------------------------------------------- freshness nudges --- */

/**
 * "This portal hasn't been updated in a week." Sent to the agency, never the
 * client — the client should not be told their agency has gone quiet.
 */
export async function notifyStalePortal(input: {
  workspace: Workspace;
  portal: Portal;
  days: number;
  /** Bucket the dedupe key so the nudge repeats weekly rather than once ever. */
  weekKey: string;
}): Promise<void> {
  const to = await ownerEmail(input.workspace);
  if (!to) return;
  await sendMail(
    {
      workspaceId: input.workspace.id,
      portalId: input.portal.id,
      kind: "stale_portal",
      dedupeKey: `stale:${input.portal.id}:${input.weekKey}`,
      to,
      subject: `${input.portal.title} has been quiet for ${input.days} days`,
      body: `Nothing has changed on the ${input.portal.title} portal in ${input.days} days.\n\nA phase nudged forward or one line in a thread is usually enough. Silence is what starts the "any update?" emails.`,
      action: { label: "Post an update", url: `${env.appUrl}/compose` },
    },
    input.workspace,
  );
}

/** Load the workspace for a portal — used by callers that only hold a portal. */
export async function workspaceForPortal(portalId: string): Promise<Workspace | null> {
  const db = getDb();
  const [portal] = await db.select().from(portals).where(eq(portals.id, portalId));
  if (!portal) return null;
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, portal.workspaceId));
  return workspace ?? null;
}
