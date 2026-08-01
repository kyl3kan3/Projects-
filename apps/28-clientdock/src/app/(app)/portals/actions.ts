"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { contacts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import {
  addContact,
  addLink,
  addPhase,
  createClient,
  createPortal,
  deleteLink,
  deletePhase,
  requireOwnedPortal,
  saveAsTemplate,
  setModules,
  setPhaseProgress,
  setPortalStatus,
  updatePortalDetails,
} from "@/lib/portals";
import { requestApproval, reviseApproval } from "@/lib/approvals";
import { deleteFileScoped, uploadFile } from "@/lib/files";
import { appendMessage, startThread } from "@/lib/messages";
import { recordInvoice } from "@/lib/invoices";
import { createMagicToken, magicLinkUrl, revokeTokensForContact } from "@/lib/magic-auth";
import {
  notifyApprovalRequested,
  notifyInvoice,
  notifyMessageToClient,
  portalBaseUrl,
  sendInvitation,
} from "@/lib/notify";
import { moduleAllowed, moduleUpsell, plan } from "@/lib/plans";

export interface ActionState {
  error?: string;
  ok?: string;
  /** Set by the invite action so the agency can copy a link when email is off. */
  link?: string;
}

function fail(err: unknown): ActionState {
  return { error: err instanceof Error ? err.message : "That didn't work" };
}

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

/* --------------------------------------------------------- create a portal --- */

export async function createPortalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { workspace } = await requireUser();
  let portalId: string;
  try {
    let clientId = str(formData, "clientId");
    const newCompany = str(formData, "newCompany");
    if (!clientId && newCompany) {
      const created = await createClient({
        workspaceId: workspace.id,
        company: newCompany,
        contactName: str(formData, "contactName"),
        contactEmail: str(formData, "contactEmail"),
      });
      clientId = created.client.id;
    }
    if (!clientId) return { error: "Pick an existing client or name a new one" };

    const modules = formData.getAll("modules").map(String);
    const portal = await createPortal({
      workspaceId: workspace.id,
      planId: workspace.plan,
      clientId,
      title: str(formData, "title") || undefined,
      preparedBy: str(formData, "preparedBy") || workspace.name,
      welcomeNote: str(formData, "welcomeNote") || null,
      modules: modules.length ? modules : undefined,
      duplicateFromPortalId: str(formData, "duplicateFrom") || null,
    });
    portalId = portal.id;
  } catch (err) {
    return fail(err);
  }
  redirect(`/portals/${portalId}`);
}

/* ------------------------------------------------------------- the composer --- */

export async function setModulesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workspace } = await requireUser();
  const portalId = str(formData, "portalId");
  const requested = formData.getAll("modules").map(String);
  try {
    const blocked = requested.find((m) => !moduleAllowed(workspace.plan, m));
    if (blocked) return { error: moduleUpsell(workspace.plan, blocked) ?? "That module isn't on your plan" };
    await setModules(workspace.id, portalId, workspace.plan, requested);
  } catch (err) {
    return fail(err);
  }
  revalidatePath(`/portals/${portalId}`);
  return { ok: "Modules saved" };
}

export async function updateDetailsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { workspace } = await requireUser();
  const portalId = str(formData, "portalId");
  try {
    await updatePortalDetails(workspace.id, portalId, {
      title: str(formData, "title"),
      preparedBy: str(formData, "preparedBy"),
      welcomeNote: str(formData, "welcomeNote"),
    });
  } catch (err) {
    return fail(err);
  }
  revalidatePath(`/portals/${portalId}`);
  return { ok: "Saved" };
}

export async function publishAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workspace } = await requireUser();
  const portalId = str(formData, "portalId");
  const next = str(formData, "status");
  if (next !== "draft" && next !== "active" && next !== "archived") {
    return { error: "Unknown status" };
  }
  try {
    await setPortalStatus(workspace.id, portalId, next);
  } catch (err) {
    return fail(err);
  }
  revalidatePath(`/portals/${portalId}`);
  revalidatePath("/dashboard");
  return { ok: next === "active" ? "Portal is live" : next === "draft" ? "Back to draft" : "Archived" };
}

export async function saveTemplateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { workspace } = await requireUser();
  const portalId = str(formData, "portalId");
  try {
    const template = await saveAsTemplate(workspace.id, portalId, str(formData, "templateName"));
    revalidatePath("/dashboard");
    return { ok: `Saved as "${template.templateName}" — pick it when you create the next portal` };
  } catch (err) {
    return fail(err);
  }
}

/* -------------------------------------------------------------- the client --- */

export async function addContactAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workspace } = await requireUser();
  const portalId = str(formData, "portalId");
  try {
    const portal = await requireOwnedPortal(workspace.id, portalId);
    if (!portal.clientId) return { error: "This portal has no client attached" };
    await addContact({
      workspaceId: workspace.id,
      clientId: portal.clientId,
      name: str(formData, "name"),
      email: str(formData, "email"),
    });
  } catch (err) {
    return fail(err);
  }
  revalidatePath(`/portals/${portalId}`);
  return { ok: "Contact added — send them a link when you're ready" };
}

/**
 * Mint a magic link and email it. The link is returned to the agency too: with no
 * Resend key configured nothing is actually delivered, and an agency that can see
 * the link can still hand it over — better than a silent no-op.
 */
export async function inviteContactAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { workspace } = await requireUser();
  const portalId = str(formData, "portalId");
  const contactId = str(formData, "contactId");
  try {
    const portal = await requireOwnedPortal(workspace.id, portalId);
    const db = getDb();
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, contactId));
    // Scoped: the contact has to belong to this workspace and this portal's client.
    if (!contact || contact.workspaceId !== workspace.id || contact.clientId !== portal.clientId) {
      return { error: "That contact isn't on this portal" };
    }

    const { token, tokenId } = await createMagicToken({
      portalId: portal.id,
      contactId: contact.id,
    });
    await sendInvitation({ workspace, portal, contact, token, tokenId });

    // A portal being invited to should be live, not a draft.
    if (portal.status === "draft") await setPortalStatus(workspace.id, portal.id, "active");
    revalidatePath(`/portals/${portalId}`);
    return {
      ok: `Link sent to ${contact.email}`,
      link: magicLinkUrl(portalBaseUrl(workspace), token),
    };
  } catch (err) {
    return fail(err);
  }
}

export async function revokeAccessAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { workspace } = await requireUser();
  const portalId = str(formData, "portalId");
  const contactId = str(formData, "contactId");
  try {
    await requireOwnedPortal(workspace.id, portalId);
    const revoked = await revokeTokensForContact(portalId, contactId);
    revalidatePath(`/portals/${portalId}`);
    return {
      ok: revoked
        ? `${revoked} unused link${revoked === 1 ? "" : "s"} revoked`
        : "No unused links to revoke",
    };
  } catch (err) {
    return fail(err);
  }
}

/* -------------------------------------------------------------- timeline --- */

export async function addPhaseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workspace } = await requireUser();
  const portalId = str(formData, "portalId");
  try {
    await requireOwnedPortal(workspace.id, portalId);
    await addPhase({
      portalId,
      name: str(formData, "name"),
      progressPct: Number(str(formData, "progressPct") || 0),
      note: str(formData, "note") || null,
    });
  } catch (err) {
    return fail(err);
  }
  revalidatePath(`/portals/${portalId}`);
  return { ok: "Phase added" };
}

export async function setPhaseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workspace } = await requireUser();
  const portalId = str(formData, "portalId");
  try {
    await requireOwnedPortal(workspace.id, portalId);
    const updated = await setPhaseProgress(
      portalId,
      str(formData, "phaseId"),
      Number(str(formData, "progressPct") || 0),
      formData.has("note") ? str(formData, "note") : undefined,
    );
    if (!updated) return { error: "That phase isn't on this portal" };
  } catch (err) {
    return fail(err);
  }
  revalidatePath(`/portals/${portalId}`);
  return { ok: "Progress updated — the client sees it now" };
}

export async function deletePhaseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { workspace } = await requireUser();
  const portalId = str(formData, "portalId");
  try {
    await requireOwnedPortal(workspace.id, portalId);
    await deletePhase(portalId, str(formData, "phaseId"));
  } catch (err) {
    return fail(err);
  }
  revalidatePath(`/portals/${portalId}`);
  return { ok: "Phase removed" };
}

/* ----------------------------------------------------------------- links --- */

export async function addLinkAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workspace } = await requireUser();
  const portalId = str(formData, "portalId");
  try {
    await requireOwnedPortal(workspace.id, portalId);
    await addLink({ portalId, label: str(formData, "label"), url: str(formData, "url") });
  } catch (err) {
    return fail(err);
  }
  revalidatePath(`/portals/${portalId}`);
  return { ok: "Link added" };
}

export async function deleteLinkAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workspace } = await requireUser();
  const portalId = str(formData, "portalId");
  try {
    await requireOwnedPortal(workspace.id, portalId);
    await deleteLink(portalId, str(formData, "linkId"));
  } catch (err) {
    return fail(err);
  }
  revalidatePath(`/portals/${portalId}`);
  return { ok: "Link removed" };
}

/* ----------------------------------------------------------------- files --- */

export async function uploadFileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user, workspace } = await requireUser();
  const portalId = str(formData, "portalId");
  try {
    await requireOwnedPortal(workspace.id, portalId);
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload" };

    const stored = await uploadFile({
      portalId,
      name: str(formData, "name") || file.name,
      folder: str(formData, "folder") || undefined,
      data: Buffer.from(await file.arrayBuffer()),
      contentType: file.type || "application/octet-stream",
      uploadedBy: "agency",
      uploadedByName: user.name ?? workspace.name,
    });

    // Uploading a new version of a file already under review reopens that review,
    // rather than leaving the client staring at an approved v2.
    const approvalId = str(formData, "reviseApprovalId");
    if (approvalId) {
      await reviseApproval({
        portalId,
        approvalId,
        fileId: stored.id,
        revisedBy: user.name ?? workspace.name,
      });
    }
    revalidatePath(`/portals/${portalId}`);
    return {
      ok: `${stored.name} uploaded as v${stored.version}${approvalId ? " — approval reopened" : ""}`,
    };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteFileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { workspace } = await requireUser();
  const portalId = str(formData, "portalId");
  try {
    await requireOwnedPortal(workspace.id, portalId);
    const removed = await deleteFileScoped(portalId, str(formData, "fileId"));
    if (!removed) return { error: "That file isn't in this portal" };
  } catch (err) {
    return fail(err);
  }
  revalidatePath(`/portals/${portalId}`);
  return { ok: "Version deleted" };
}

/* ------------------------------------------------------------- approvals --- */

export async function requestApprovalAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, workspace } = await requireUser();
  const portalId = str(formData, "portalId");
  try {
    const portal = await requireOwnedPortal(workspace.id, portalId);
    if (!plan(workspace.plan).eApprovals) {
      return { error: moduleUpsell(workspace.plan, "approvals") ?? "Approvals aren't on your plan" };
    }
    const approval = await requestApproval({
      portalId,
      title: str(formData, "title"),
      body: str(formData, "body") || null,
      fileId: str(formData, "fileId") || null,
      requestedBy: user.name ?? workspace.name,
    });
    await notifyApprovalRequested({ workspace, portal, approval });
    revalidatePath(`/portals/${portalId}`);
    return { ok: "Approval requested — they've been emailed" };
  } catch (err) {
    return fail(err);
  }
}

/* -------------------------------------------------------------- messages --- */

export async function startThreadAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, workspace } = await requireUser();
  const portalId = str(formData, "portalId");
  try {
    const portal = await requireOwnedPortal(workspace.id, portalId);
    const { thread, messages } = await startThread({
      portalId,
      subject: str(formData, "subject"),
      body: str(formData, "body"),
      authorKind: "agency",
      authorName: user.name ?? workspace.name,
    });
    await notifyMessageToClient({
      workspace,
      portal,
      thread,
      messageId: messages[0].id,
      authorName: user.name ?? workspace.name,
      body: messages[0].body,
    });
    revalidatePath(`/portals/${portalId}`);
    return { ok: "Sent — they can reply straight from the email" };
  } catch (err) {
    return fail(err);
  }
}

export async function replyThreadAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, workspace } = await requireUser();
  const portalId = str(formData, "portalId");
  try {
    const portal = await requireOwnedPortal(workspace.id, portalId);
    const message = await appendMessage({
      portalId,
      threadId: str(formData, "threadId"),
      body: str(formData, "body"),
      authorKind: "agency",
      authorName: user.name ?? workspace.name,
    });
    const db = getDb();
    const { threads } = await import("@/db/schema");
    const [thread] = await db.select().from(threads).where(eq(threads.id, message.threadId));
    if (thread) {
      await notifyMessageToClient({
        workspace,
        portal,
        thread,
        messageId: message.id,
        authorName: user.name ?? workspace.name,
        body: message.body,
      });
    }
    revalidatePath(`/portals/${portalId}`);
    return { ok: "Replied" };
  } catch (err) {
    return fail(err);
  }
}

/* -------------------------------------------------------------- invoices --- */

export async function recordInvoiceAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { workspace } = await requireUser();
  const portalId = str(formData, "portalId");
  try {
    const portal = await requireOwnedPortal(workspace.id, portalId);
    if (!plan(workspace.plan).stripeInvoices) {
      return { error: moduleUpsell(workspace.plan, "invoices") ?? "Invoices aren't on your plan" };
    }
    const dollars = Number(str(formData, "amount"));
    if (!Number.isFinite(dollars) || dollars <= 0) return { error: "Enter an amount like 4800" };
    const dueRaw = str(formData, "dueAt");

    const invoice = await recordInvoice({
      portalId,
      number: str(formData, "number"),
      amountCents: Math.round(dollars * 100),
      dueAt: dueRaw ? new Date(`${dueRaw}T12:00:00Z`) : null,
      hostedInvoiceUrl: str(formData, "hostedInvoiceUrl") || null,
    });
    await notifyInvoice({ workspace, portal, invoice });
    revalidatePath(`/portals/${portalId}`);
    return { ok: `Invoice ${invoice.number} is on the portal` };
  } catch (err) {
    return fail(err);
  }
}
