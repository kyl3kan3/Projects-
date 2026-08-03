/**
 * src/lib/audit.ts
 *
 * The audit ledger. Append-only, and read on the vendor page and the settings
 * screen. Anything that changes what a certificate or a verdict means gets a row:
 * a review confirmation, a template edit, a manual field correction, an issued
 * upload link, a binder export.
 */

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog } from "@/db/schema";

export type AuditAction =
  | "certificate.uploaded"
  | "certificate.parsed"
  | "certificate.parse_failed"
  | "certificate.reviewed"
  | "certificate.corrected"
  | "evaluation.recorded"
  | "chase.sent"
  | "template.created"
  | "template.updated"
  | "vendor.created"
  | "vendor.updated"
  | "vendor.imported"
  | "vendor.link_issued"
  | "engagement.created"
  | "engagement.ended"
  | "property.created"
  | "binder.exported"
  | "plan.changed"
  | "hook.key_rotated";

export interface AuditEntry {
  orgId: string;
  /** A person's name and email, or "system (nightly tick)". */
  actor: string;
  action: AuditAction;
  /** What it happened to, in words: "Kestrel Roofing LLC — Bayview Terrace". */
  target: string;
  metadata?: Record<string, unknown>;
}

export async function appendAudit(entry: AuditEntry): Promise<void> {
  const db = getDb();
  await db.insert(auditLog).values({
    orgId: entry.orgId,
    actor: entry.actor,
    action: entry.action,
    target: entry.target,
    metadata: entry.metadata ?? {},
  });
}

export async function recentAudit(orgId: string, limit = 50) {
  const db = getDb();
  return db
    .select()
    .from(auditLog)
    .where(eq(auditLog.orgId, orgId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

export const AUDIT_VERB: Record<AuditAction, string> = {
  "certificate.uploaded": "uploaded",
  "certificate.parsed": "parsed",
  "certificate.parse_failed": "parse failed",
  "certificate.reviewed": "reviewed",
  "certificate.corrected": "corrected",
  "evaluation.recorded": "evaluated",
  "chase.sent": "chased",
  "template.created": "template created",
  "template.updated": "template updated",
  "vendor.created": "vendor added",
  "vendor.updated": "vendor updated",
  "vendor.imported": "vendors imported",
  "vendor.link_issued": "upload link issued",
  "engagement.created": "engagement added",
  "engagement.ended": "engagement ended",
  "property.created": "property added",
  "binder.exported": "binder exported",
  "plan.changed": "plan changed",
  "hook.key_rotated": "hook key rotated",
};
