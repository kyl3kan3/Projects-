/**
 * Append-only audit log.
 *
 * Every backup, restore, drill, and settings change lands here with an actor
 * (or null for system events). It feeds the activity feed, the compliance PDF,
 * and — the reason it is append-only — the question "who restored production
 * last Thursday?".
 */

import { and, desc, eq, gte, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, type AuditEntry } from "@/db/schema";

export type AuditAction =
  | "org.created"
  | "connection.created"
  | "connection.checked"
  | "connection.deleted"
  | "connection.disabled"
  | "policy.updated"
  | "storage.created"
  | "storage.verified"
  | "storage.deleted"
  | "storage.default_changed"
  | "backup.started"
  | "backup.succeeded"
  | "backup.failed"
  | "backup.missed"
  | "restore.executed"
  | "restore.failed"
  | "drill.passed"
  | "drill.failed"
  | "snapshot.pruned"
  | "plan.changed"
  | "report.generated";

export interface AuditInput {
  orgId: string;
  actorUserId?: string | null;
  action: AuditAction;
  subjectType: "organization" | "connection" | "policy" | "snapshot" | "drill" | "restore" | "storage" | "plan" | "report";
  subjectId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Write an audit entry. Never throws: an audit failure must not take down the
 * operation it was describing, but it must be loud in the logs.
 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    const db = getDb();
    await db.insert(auditLog).values({
      orgId: input.orgId,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      subjectType: input.subjectType,
      subjectId: input.subjectId ?? null,
      metadata: input.metadata ?? null,
    });
  } catch (err) {
    console.error("[audit] could not write entry", input.action, err);
  }
}

export async function recentAudit(orgId: string, limit = 50): Promise<AuditEntry[]> {
  const db = getDb();
  return db
    .select()
    .from(auditLog)
    .where(eq(auditLog.orgId, orgId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

export async function auditBetween(
  orgId: string,
  from: Date,
  to: Date,
): Promise<AuditEntry[]> {
  const db = getDb();
  return db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.orgId, orgId), gte(auditLog.createdAt, from), lt(auditLog.createdAt, to)))
    .orderBy(desc(auditLog.createdAt));
}

/** Plain-language rendering of an entry, used in the feed and the PDF. */
export function describeAudit(entry: AuditEntry): string {
  const meta = entry.metadata ?? {};
  const name = typeof meta.name === "string" ? meta.name : null;
  switch (entry.action) {
    case "org.created":
      return "Organization created";
    case "connection.created":
      return `Connected ${name ?? "a database"}`;
    case "connection.checked":
      return `Checked ${name ?? "a database"}`;
    case "connection.deleted":
      return `Removed ${name ?? "a database"}`;
    case "connection.disabled":
      return `Disabled ${name ?? "a database"}`;
    case "policy.updated":
      return `Updated the backup policy for ${name ?? "a database"}`;
    case "storage.created":
      return `Added storage target ${name ?? ""}`.trim();
    case "storage.verified":
      return `Verified storage target ${name ?? ""}`.trim();
    case "storage.deleted":
      return `Removed storage target ${name ?? ""}`.trim();
    case "storage.default_changed":
      return `Made ${name ?? "a target"} the default storage`;
    case "backup.started":
      return `Backup started for ${name ?? "a database"}`;
    case "backup.succeeded":
      return `Backup succeeded for ${name ?? "a database"}`;
    case "backup.failed":
      return `Backup failed for ${name ?? "a database"}`;
    case "backup.missed":
      return `Missed schedule for ${name ?? "a database"}`;
    case "restore.executed":
      return `Restored a snapshot into ${meta.target ?? "a target database"}`;
    case "restore.failed":
      return `Restore into ${meta.target ?? "a target database"} failed`;
    case "drill.passed":
      return `Restore drill passed for ${name ?? "a database"}`;
    case "drill.failed":
      return `Restore drill FAILED for ${name ?? "a database"}`;
    case "snapshot.pruned":
      return `Pruned ${meta.count ?? "expired"} snapshots past retention`;
    case "plan.changed":
      return `Plan changed to ${meta.plan ?? "a new tier"}`;
    case "report.generated":
      return `Compliance report generated for ${meta.period ?? "the month"}`;
    default:
      return entry.action;
  }
}
