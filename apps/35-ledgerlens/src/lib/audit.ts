/**
 * The audit trail.
 *
 * These are financial records, so every export, every share-link access and every
 * correction to a figure gets a row. It is append-only by convention — nothing in
 * the app updates or deletes from it — and it is what lets an operator answer "did
 * my accountant actually download February?" without asking them.
 */

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, type AuditEntry } from "@/db/schema";

export const SYSTEM = "system";

export async function audit(
  organizationId: string,
  actor: string,
  action: string,
  target?: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await getDb()
    .insert(auditLog)
    .values({ organizationId, actor, action, target: target ?? null, metadata });
}

export async function recentAudit(organizationId: string, limit = 20): Promise<AuditEntry[]> {
  return getDb()
    .select()
    .from(auditLog)
    .where(eq(auditLog.organizationId, organizationId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

/** Plain-English rendering of an audit action, for the settings activity list. */
export function describeAudit(entry: AuditEntry): string {
  const meta = entry.metadata as Record<string, unknown>;
  switch (entry.action) {
    case "document.ingested":
      return `Document received (${String(meta.source ?? "upload")})`;
    case "document.duplicate":
      return "Duplicate forward recorded, no second entry created";
    case "document.confirmed":
      return `Entry confirmed${meta.corrected ? " with corrections" : ""}`;
    case "document.rejected":
      return "Document rejected — retake requested";
    case "document.merged":
      return "Duplicate merged";
    case "vendor.rule_learned":
      return `Vendor rule learned: ${String(meta.vendor ?? "")} → ${String(meta.category ?? "")}`;
    case "close.created":
      return `Close package built for ${String(meta.period ?? "")}`;
    case "close.blocked":
      return `Close held for ${String(meta.period ?? "")} — items need review`;
    case "export.downloaded":
      return `Export downloaded (${String(meta.kind ?? "")})`;
    case "share.created":
      return "Accountant share link created";
    case "share.revoked":
      return "Accountant share link revoked";
    case "share.accessed":
      return "Accountant opened the share link";
    case "plan.changed":
      return `Plan changed to ${String(meta.plan ?? "")}`;
    default:
      return entry.action;
  }
}
