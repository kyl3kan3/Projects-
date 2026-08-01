"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contacts, portals, threads, workspaces } from "@/db/schema";
import { requireActingContact, loadPortalShell } from "@/lib/portal-access";
import { decideApproval } from "@/lib/approvals";
import { appendMessage } from "@/lib/messages";
import { uploadFile } from "@/lib/files";
import { createMagicToken } from "@/lib/magic-auth";
import { notifyApprovalDecided, notifyMessageToAgency, sendInvitation } from "@/lib/notify";

export interface PortalActionState {
  error?: string;
  ok?: string;
}

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

function fail(err: unknown): PortalActionState {
  return { error: err instanceof Error ? err.message : "That didn't go through" };
}

/**
 * Every action here resolves the portal from the slug and then discards it: the
 * portal id used for the write comes from `requireActingContact`, i.e. from the
 * signed session cookie. A slug in the URL can only ever select which session to
 * check, never widen what it can touch.
 */

/* -------------------------------------------------------------- approvals --- */

export async function decideApprovalAction(
  _prev: PortalActionState,
  formData: FormData,
): Promise<PortalActionState> {
  const slug = str(formData, "slug");
  try {
    const viewer = await requireActingContact(slug);
    const decision = str(formData, "decision");
    if (decision !== "approved" && decision !== "changes_requested") {
      return { error: "Unknown decision" };
    }

    const approval = await decideApproval({
      portalId: viewer.portalId,
      approvalId: str(formData, "approvalId"),
      decision,
      contactId: viewer.contact.id,
      contactName: viewer.contact.name,
      comment: str(formData, "comment") || null,
    });

    // A marked-up file pinned to a change request is stored as a client upload,
    // in the same portal, versioned like anything else.
    const pinned = formData.get("pin");
    if (pinned instanceof File && pinned.size > 0) {
      await uploadFile({
        portalId: viewer.portalId,
        name: pinned.name,
        folder: "From you",
        data: Buffer.from(await pinned.arrayBuffer()),
        contentType: pinned.type || "application/octet-stream",
        uploadedBy: "client",
        uploadedByName: viewer.contact.name,
      });
    }

    await notifyApprovalDecided({
      workspace: viewer.workspace,
      portal: viewer.portal,
      approval,
      decidedBy: viewer.contact.name,
    });

    revalidatePath(`/p/${slug}`);
    revalidatePath(`/p/${slug}/approvals`);
    return {
      ok:
        decision === "approved"
          ? "Approved. Your name and the time are on the record."
          : "Sent back with your note.",
    };
  } catch (err) {
    return fail(err);
  }
}

/* --------------------------------------------------------------- messages --- */

export async function clientReplyAction(
  _prev: PortalActionState,
  formData: FormData,
): Promise<PortalActionState> {
  const slug = str(formData, "slug");
  try {
    const viewer = await requireActingContact(slug);
    const message = await appendMessage({
      portalId: viewer.portalId,
      threadId: str(formData, "threadId"),
      body: str(formData, "body"),
      authorKind: "client",
      authorName: viewer.contact.name,
      authorContactId: viewer.contact.id,
    });

    const db = getDb();
    const [thread] = await db.select().from(threads).where(eq(threads.id, message.threadId));
    if (thread) {
      await notifyMessageToAgency({
        workspace: viewer.workspace,
        portal: viewer.portal,
        thread,
        messageId: message.id,
        authorName: viewer.contact.name,
        body: message.body,
      });
    }
    revalidatePath(`/p/${slug}/messages`);
    return { ok: "Sent." };
  } catch (err) {
    return fail(err);
  }
}

/* ------------------------------------------------------------------ files --- */

export async function clientUploadAction(
  _prev: PortalActionState,
  formData: FormData,
): Promise<PortalActionState> {
  const slug = str(formData, "slug");
  try {
    const viewer = await requireActingContact(slug);
    if (!viewer.portal.enabledModules.includes("files")) {
      return { error: "This portal isn't taking files" };
    }
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "Choose a file first" };
    const stored = await uploadFile({
      portalId: viewer.portalId,
      name: file.name,
      folder: "From you",
      data: Buffer.from(await file.arrayBuffer()),
      contentType: file.type || "application/octet-stream",
      uploadedBy: "client",
      uploadedByName: viewer.contact.name,
    });
    revalidatePath(`/p/${slug}/files`);
    return { ok: `${stored.name} is with the team.` };
  } catch (err) {
    return fail(err);
  }
}

/* ----------------------------------------------------------- re-access --- */

/**
 * "Send me a new link." Deliberately uninformative: the response is identical
 * whether or not the address is on the portal, so this page can't be used to
 * discover who an agency's client contacts are.
 */
export async function requestAccessAction(
  _prev: PortalActionState,
  formData: FormData,
): Promise<PortalActionState> {
  const slug = str(formData, "slug");
  const email = str(formData, "email").toLowerCase();
  const generic = {
    ok: "If that address is on this portal, a fresh link is on its way. Links expire in 14 days.",
  };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "Enter the email address the invitation came to" };
  }

  const shell = await loadPortalShell(slug);
  if (!shell || !shell.portal.clientId || shell.portal.status === "archived") return generic;

  const db = getDb();
  const candidates = await db
    .select()
    .from(contacts)
    .where(eq(contacts.clientId, shell.portal.clientId));
  const contact = candidates.find((c) => c.email === email);
  if (!contact) return generic;

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, shell.portal.workspaceId));
  if (!workspace) return generic;

  try {
    const { token, tokenId } = await createMagicToken({
      portalId: shell.portal.id,
      contactId: contact.id,
    });
    await sendInvitation({ workspace, portal: shell.portal, contact, token, tokenId });
  } catch (err) {
    console.error("[portal] could not mint a re-access link", err);
  }
  return generic;
}

/**
 * The same thing from an agency's own domain root, where there is no slug: find
 * every live portal this address is a contact on *inside that workspace* and send a
 * link for each. The response is identical whether or not the address is known, so
 * portal.youragency.com can't be used to enumerate their client list.
 */
export async function requestAccessByDomainAction(
  _prev: PortalActionState,
  formData: FormData,
): Promise<PortalActionState> {
  const workspaceId = str(formData, "workspaceId");
  const email = str(formData, "email").toLowerCase();
  const generic = {
    ok: "If that address is on a portal here, its link is on its way. Links expire in 14 days.",
  };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "Enter the email address the invitation came to" };
  }

  const db = getDb();
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
  if (!workspace) return generic;

  const matches = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.workspaceId, workspace.id), eq(contacts.email, email)));

  for (const contact of matches) {
    const openPortals = await db
      .select()
      .from(portals)
      .where(and(eq(portals.clientId, contact.clientId), eq(portals.status, "active")));
    for (const portal of openPortals) {
      try {
        const { token, tokenId } = await createMagicToken({
          portalId: portal.id,
          contactId: contact.id,
        });
        await sendInvitation({ workspace, portal, contact, token, tokenId });
      } catch (err) {
        console.error("[portal] could not mint a domain re-access link", err);
      }
    }
  }
  return generic;
}
