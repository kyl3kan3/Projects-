/**
 * src/lib/activity.ts
 *
 * The file's memory. Every state change a coordinator or a party makes writes a
 * row here, phrased as a past-tense sentence, so the deal file can answer "who
 * moved the closing date" six weeks later without anyone guessing.
 *
 * Deal notes live here too, as `action = "note"` rows — a note is a thing that
 * happened at a time, by a person, which is exactly what this table is.
 */

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { activityLog, auditLog, type ActivityRow } from "@/db/schema";

export type ActivityAction =
  | "deal_opened"
  | "deal_status"
  | "anchors_applied"
  | "task_status"
  | "date_status"
  | "document_uploaded"
  | "portal_link_created"
  | "portal_link_revoked"
  | "reminder_sent"
  | "note"
  | "commission_updated"
  | "parties_updated"
  | "packet_exported";

export async function logActivity(input: {
  dealId: string;
  actor: string;
  action: ActivityAction;
  target: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await getDb().insert(activityLog).values({
    dealId: input.dealId,
    actor: input.actor,
    action: input.action,
    target: input.target,
    metadata: input.metadata ?? {},
  });
}

export async function logAudit(input: {
  accountId: string;
  actor: string;
  action: string;
  target: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await getDb().insert(auditLog).values({
    accountId: input.accountId,
    actor: input.actor,
    action: input.action,
    target: input.target,
    metadata: input.metadata ?? {},
  });
}

export async function dealActivity(dealId: string, limit = 60): Promise<ActivityRow[]> {
  return getDb()
    .select()
    .from(activityLog)
    .where(eq(activityLog.dealId, dealId))
    .orderBy(desc(activityLog.occurredAt))
    .limit(limit);
}

/** The verb shown in the log, and the body when there is one. */
export function activitySentence(row: ActivityRow): { verb: string; body: string } {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const detail = typeof meta.detail === "string" ? meta.detail : "";
  switch (row.action) {
    case "deal_opened":
      return { verb: "Opened the file", body: row.target };
    case "deal_status":
      return { verb: "Set status", body: detail || row.target };
    case "anchors_applied":
      return { verb: "Applied a recompute", body: detail || row.target };
    case "task_status":
      return { verb: "Updated a task", body: detail || row.target };
    case "date_status":
      return { verb: "Updated a date", body: detail || row.target };
    case "document_uploaded":
      return { verb: "Uploaded a document", body: detail || row.target };
    case "portal_link_created":
      return { verb: "Created a portal link", body: row.target };
    case "portal_link_revoked":
      return { verb: "Revoked a portal link", body: row.target };
    case "reminder_sent":
      return { verb: "Sent a reminder", body: detail || row.target };
    case "commission_updated":
      return { verb: "Updated the commission", body: detail || row.target };
    case "parties_updated":
      return { verb: "Updated the parties", body: detail || row.target };
    case "packet_exported":
      return { verb: "Exported the closing packet", body: detail || row.target };
    case "note":
      return { verb: "Note", body: typeof meta.body === "string" ? meta.body : row.target };
    default:
      return { verb: row.action, body: row.target };
  }
}
