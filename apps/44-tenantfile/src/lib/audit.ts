/**
 * The audit log: who did what, in the landlord's account.
 *
 * Distinct from the File. The File is the tenancy's story and is shown to
 * tenants and courts; the audit log is operational — who declined an applicant,
 * who waived a charge, which webhook changed a plan. Nothing reads it in the UI
 * yet beyond Settings, and it never gates anything, so a failure to write must
 * never fail the action it was recording.
 */

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog } from "@/db/schema";

export async function audit(
  landlordId: string,
  actor: string,
  action: string,
  target = "",
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await getDb().insert(auditLog).values({ landlordId, actor, action, target, metadata });
  } catch (err) {
    console.error("[audit] could not write entry", { action, target, err });
  }
}

export async function recentAudit(landlordId: string, limit = 40) {
  return getDb()
    .select()
    .from(auditLog)
    .where(eq(auditLog.landlordId, landlordId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}
