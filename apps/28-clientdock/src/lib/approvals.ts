/**
 * The approval engine: request, decide, and an append-only audit trail.
 *
 * ARCHITECTURE.md flow 2. Two properties are load-bearing:
 *
 *  - **Decisions are attributable.** A decision records the contact id, the name
 *    as it stood at the time, the timestamp and any comment. The audit array is
 *    only ever appended to, never rewritten, so "who approved this?" has one
 *    answer forever — that is the artefact an agency shows when a client says
 *    they never signed off.
 *  - **A decision is final until the agency revises.** Deciding twice is refused,
 *    not silently overwritten; uploading a new version reopens the request with a
 *    `revised` audit entry instead of erasing the old decision.
 *
 * Every function is scoped by `portalId`, which callers take from an authorised
 * session — never from the request.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  approvals,
  files,
  type Approval,
  type AuditEntry,
  type ApprovalStatus,
  type PortalFile,
} from "@/db/schema";
import { isUuid, touchPortal } from "@/lib/files";

export class ApprovalError extends Error {}

export interface ApprovalWithFile {
  approval: Approval;
  file: PortalFile | null;
  /** Every version of the file under review, highest first. */
  versions: PortalFile[];
}

function entry(
  event: AuditEntry["event"],
  actor: string,
  actorKind: AuditEntry["actorKind"],
  detail?: string,
): AuditEntry {
  return { at: new Date().toISOString(), event, actor, actorKind, ...(detail ? { detail } : {}) };
}

/* --------------------------------------------------------------- create --- */

export async function requestApproval(input: {
  portalId: string;
  title: string;
  body?: string | null;
  fileId?: string | null;
  dueAt?: Date | null;
  requestedBy: string;
}): Promise<Approval> {
  const title = input.title.trim();
  if (!title) throw new ApprovalError("Give the approval a title the client will recognise");

  const db = getDb();

  // A file attached to an approval must live in the same portal. Without this
  // check an agency could attach another portal's deliverable by id.
  let fileId: string | null = null;
  if (input.fileId) {
    if (!isUuid(input.fileId)) throw new ApprovalError("That file no longer exists");
    const [file] = await db
      .select()
      .from(files)
      .where(and(eq(files.id, input.fileId), eq(files.portalId, input.portalId)));
    if (!file) throw new ApprovalError("That file isn't in this portal");
    fileId = file.id;
  }

  const [row] = await db
    .insert(approvals)
    .values({
      portalId: input.portalId,
      fileId,
      title,
      body: input.body?.trim() || null,
      dueAt: input.dueAt ?? null,
      status: "pending",
      audit: [entry("requested", input.requestedBy, "agency", title)],
    })
    .returning();

  await touchPortal(input.portalId);
  return row;
}

/* ----------------------------------------------------------------- read --- */

export async function listApprovals(portalId: string): Promise<ApprovalWithFile[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(approvals)
    .where(eq(approvals.portalId, portalId))
    .orderBy(desc(approvals.createdAt));
  return Promise.all(rows.map((approval) => withFile(portalId, approval)));
}

export async function getApprovalScoped(
  portalId: string,
  approvalId: string,
): Promise<ApprovalWithFile | null> {
  if (!isUuid(approvalId)) return null;
  const db = getDb();
  const [approval] = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.id, approvalId), eq(approvals.portalId, portalId)));
  if (!approval) return null;
  return withFile(portalId, approval);
}

async function withFile(portalId: string, approval: Approval): Promise<ApprovalWithFile> {
  if (!approval.fileId) return { approval, file: null, versions: [] };
  const db = getDb();
  const [file] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, approval.fileId), eq(files.portalId, portalId)));
  if (!file) return { approval, file: null, versions: [] };
  const versions = await db
    .select()
    .from(files)
    .where(and(eq(files.portalId, portalId), eq(files.stackKey, file.stackKey)))
    .orderBy(desc(files.version));
  return { approval, file, versions };
}

export async function countPendingApprovals(portalId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(approvals)
    .where(and(eq(approvals.portalId, portalId), eq(approvals.status, "pending")));
  return Number(row?.n ?? 0);
}

/* --------------------------------------------------------------- decide --- */

export interface Decision {
  portalId: string;
  approvalId: string;
  decision: Extract<ApprovalStatus, "approved" | "changes_requested">;
  contactId: string;
  contactName: string;
  comment?: string | null;
}

/**
 * Record a client's decision. Scoped by portal id *and* conditioned on the row
 * still being pending, in one statement, so a double tap on a phone with a bad
 * connection cannot produce two audit entries or overwrite the first decision.
 */
export async function decideApproval(input: Decision): Promise<Approval> {
  if (!isUuid(input.approvalId)) throw new ApprovalError("That approval no longer exists");
  if (input.decision === "changes_requested" && !input.comment?.trim()) {
    throw new ApprovalError("Tell them what needs changing — a blank request stalls the round");
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.id, input.approvalId), eq(approvals.portalId, input.portalId)));
  if (!existing) throw new ApprovalError("That approval isn't in this portal");
  if (existing.status !== "pending") {
    throw new ApprovalError(
      existing.status === "approved"
        ? "This was already approved"
        : "Changes were already requested on this",
    );
  }

  const comment = input.comment?.trim() || null;
  const audit: AuditEntry[] = [
    ...existing.audit,
    entry(
      input.decision === "approved" ? "approved" : "changes_requested",
      input.contactName,
      "client",
      comment ?? undefined,
    ),
  ];

  const updated = await db
    .update(approvals)
    .set({
      status: input.decision,
      decidedByContactId: input.contactId,
      decidedByName: input.contactName,
      decidedAt: new Date(),
      decisionComment: comment,
      audit,
    })
    .where(
      and(
        eq(approvals.id, input.approvalId),
        eq(approvals.portalId, input.portalId),
        eq(approvals.status, "pending"),
      ),
    )
    .returning();

  if (!updated[0]) throw new ApprovalError("Someone already answered this one");
  return updated[0];
}

/** Note that the client opened the request — the first view only, kept quiet. */
export async function noteApprovalViewed(
  portalId: string,
  approvalId: string,
  contactName: string,
): Promise<void> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.id, approvalId), eq(approvals.portalId, portalId)));
  if (!existing) return;
  if (existing.audit.some((a) => a.event === "viewed")) return;
  await db
    .update(approvals)
    .set({ audit: [...existing.audit, entry("viewed", contactName, "client")] })
    .where(and(eq(approvals.id, approvalId), eq(approvals.portalId, portalId)));
}

/**
 * Reopen an approval against a new version of its file. The previous decision
 * stays in the audit trail; the request goes back to pending so the client is
 * answering the thing that actually changed.
 */
export async function reviseApproval(input: {
  portalId: string;
  approvalId: string;
  fileId: string;
  revisedBy: string;
  note?: string | null;
}): Promise<Approval> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(approvals)
    .where(and(eq(approvals.id, input.approvalId), eq(approvals.portalId, input.portalId)));
  if (!existing) throw new ApprovalError("That approval isn't in this portal");

  const [file] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, input.fileId), eq(files.portalId, input.portalId)));
  if (!file) throw new ApprovalError("That file isn't in this portal");

  const [row] = await db
    .update(approvals)
    .set({
      fileId: file.id,
      status: "pending",
      decidedByContactId: null,
      decidedByName: null,
      decidedAt: null,
      decisionComment: null,
      audit: [
        ...existing.audit,
        entry(
          "revised",
          input.revisedBy,
          "agency",
          input.note?.trim() || `${file.name} v${file.version}`,
        ),
      ],
    })
    .where(and(eq(approvals.id, input.approvalId), eq(approvals.portalId, input.portalId)))
    .returning();

  await touchPortal(input.portalId);
  return row;
}

/** The signage label for a status, per DESIGN.md (always uppercase Label type). */
export function approvalLabel(status: ApprovalStatus): string {
  switch (status) {
    case "approved":
      return "APPROVED";
    case "changes_requested":
      return "CHANGES REQUESTED";
    default:
      return "AWAITING YOU";
  }
}

/** Which semantic colour a status carries. Never decorative. */
export function approvalTone(status: ApprovalStatus): "green" | "amber" | "ink" {
  if (status === "approved") return "green";
  if (status === "pending") return "amber";
  return "ink";
}
