/**
 * The application workspace: a per-grant checklist of what the funder wants,
 * each item either linked to a library block or holding a one-off draft.
 *
 * The link is a **snapshot**, not a reference. `linkAnswer` copies the block's
 * text into `draft_body` and records where it came from. Editing the library
 * afterwards must never change what a submitted application said — the workspace
 * is a record of what was actually sent, and a live reference would quietly
 * rewrite history every time someone polished the mission statement.
 */

import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  activityLog,
  answers,
  workspaceItems,
  type Answer,
  type WorkspaceItem,
  type WorkspaceStatus,
} from "@/db/schema";
import { sourceBreadcrumb } from "@/lib/answers";

/**
 * The checklist most US foundation applications actually ask for. Seeded when a
 * workspace is opened for the first time so the screen is useful immediately
 * rather than being an empty list with an "add item" button.
 */
export const DEFAULT_REQUIREMENTS = [
  "Organization background (300-500 words)",
  "Statement of need",
  "Program description and activities",
  "Outcomes and how you measure them",
  "Project budget and budget narrative",
  "Board of directors list",
  "IRS 501(c)(3) determination letter",
  "Most recent audit or Form 990",
] as const;

export interface WorkspaceRow {
  item: WorkspaceItem;
  answer: Answer | null;
}

export async function listWorkspace(
  organizationId: string,
  grantId: string,
): Promise<WorkspaceRow[]> {
  const db = getDb();
  const rows = await db
    .select({ item: workspaceItems, answer: answers })
    .from(workspaceItems)
    .leftJoin(answers, eq(answers.id, workspaceItems.answerId))
    .where(
      and(
        eq(workspaceItems.organizationId, organizationId),
        eq(workspaceItems.grantId, grantId),
      ),
    )
    .orderBy(asc(workspaceItems.position), asc(workspaceItems.createdAt));
  return rows.map((r) => ({ item: r.item, answer: r.answer ?? null }));
}

/** Idempotent: calling it twice does not double the checklist. */
export async function ensureChecklist(
  organizationId: string,
  grantId: string,
): Promise<void> {
  const db = getDb();
  const [existing] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(workspaceItems)
    .where(eq(workspaceItems.grantId, grantId));
  if ((existing?.count ?? 0) > 0) return;

  await db.insert(workspaceItems).values(
    DEFAULT_REQUIREMENTS.map((requirement, position) => ({
      organizationId,
      grantId,
      requirement,
      position,
    })),
  );
}

export async function addRequirement(
  organizationId: string,
  grantId: string,
  requirement: string,
): Promise<WorkspaceItem> {
  const db = getDb();
  const [max] = await db
    .select({ max: sql<number>`coalesce(max(${workspaceItems.position}), -1)::int` })
    .from(workspaceItems)
    .where(eq(workspaceItems.grantId, grantId));
  const [row] = await db
    .insert(workspaceItems)
    .values({
      organizationId,
      grantId,
      requirement: requirement.trim(),
      position: (max?.max ?? -1) + 1,
    })
    .returning();
  return row;
}

/**
 * Snapshot a library block into this requirement. The text is copied; the
 * `answerId` is kept only so the UI can say what the source was and offer to
 * re-pull it if the library has since moved on.
 */
export async function linkAnswer(
  organizationId: string,
  itemId: string,
  answerId: string,
  actor: string,
): Promise<void> {
  const db = getDb();
  const [item] = await db
    .select()
    .from(workspaceItems)
    .where(
      and(eq(workspaceItems.id, itemId), eq(workspaceItems.organizationId, organizationId)),
    );
  if (!item) throw new Error("Not found");

  const [answer] = await db
    .select()
    .from(answers)
    .where(and(eq(answers.id, answerId), eq(answers.organizationId, organizationId)));
  if (!answer) throw new Error("Not found");

  await db
    .update(workspaceItems)
    .set({
      answerId: answer.id,
      answerSource: sourceBreadcrumb(answer),
      // The snapshot. Never a join at render time.
      draftBody: answer.body,
      status: item.status === "final" ? "final" : "drafted",
      updatedAt: new Date(),
    })
    .where(eq(workspaceItems.id, itemId));

  await db.insert(activityLog).values({
    organizationId,
    grantId: item.grantId,
    actor,
    event: "answer_linked",
    summary: `Used ${sourceBreadcrumb(answer)} for "${item.requirement}"`,
    metadata: { answerId: answer.id, version: answer.version },
  });
}

export async function unlinkAnswer(
  organizationId: string,
  itemId: string,
): Promise<void> {
  const db = getDb();
  // The snapshotted text stays: it is the draft now, and deleting someone's
  // words because they detached a source would be indefensible.
  await db
    .update(workspaceItems)
    .set({ answerId: null, answerSource: null, updatedAt: new Date() })
    .where(
      and(eq(workspaceItems.id, itemId), eq(workspaceItems.organizationId, organizationId)),
    );
}

export async function saveDraft(
  organizationId: string,
  itemId: string,
  draftBody: string,
  status: WorkspaceStatus,
): Promise<void> {
  const db = getDb();
  await db
    .update(workspaceItems)
    .set({ draftBody, status, updatedAt: new Date() })
    .where(
      and(eq(workspaceItems.id, itemId), eq(workspaceItems.organizationId, organizationId)),
    );
}

export async function setItemStatus(
  organizationId: string,
  itemId: string,
  status: WorkspaceStatus,
): Promise<void> {
  const db = getDb();
  await db
    .update(workspaceItems)
    .set({ status, updatedAt: new Date() })
    .where(
      and(eq(workspaceItems.id, itemId), eq(workspaceItems.organizationId, organizationId)),
    );
}

export async function deleteItem(organizationId: string, itemId: string): Promise<void> {
  const db = getDb();
  await db
    .delete(workspaceItems)
    .where(
      and(eq(workspaceItems.id, itemId), eq(workspaceItems.organizationId, organizationId)),
    );
}

export interface WorkspaceProgress {
  total: number;
  final: number;
  drafted: number;
  todo: number;
  readyToSubmit: boolean;
}

export function progress(rows: WorkspaceRow[]): WorkspaceProgress {
  const total = rows.length;
  const final = rows.filter((r) => r.item.status === "final").length;
  const drafted = rows.filter((r) => r.item.status === "drafted").length;
  return {
    total,
    final,
    drafted,
    todo: total - final - drafted,
    readyToSubmit: total > 0 && final === total,
  };
}

/**
 * Has the library moved on since this item was snapshotted? Shown as a quiet
 * note, never applied automatically — re-pulling a block into a draft someone has
 * since edited by hand would destroy their edit.
 */
export function snapshotIsStale(row: WorkspaceRow): boolean {
  if (!row.answer || !row.item.answerSource) return false;
  return row.item.answerSource !== sourceBreadcrumb(row.answer);
}
