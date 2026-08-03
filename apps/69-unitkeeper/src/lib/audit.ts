/**
 * The audit log: who did what in the owner's account.
 *
 * BUILD.md names three things that always get logged — lien-step completions,
 * gate-code changes, and ledger adjustments — because those are the three a
 * tenant's lawyer will ask about. Nothing gates on the audit log, so a failure to
 * write it must never fail the action it was recording.
 */

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog } from "@/db/schema";

export async function audit(
  ownerId: string,
  actor: string,
  action: string,
  target = "",
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    await getDb().insert(auditLog).values({ ownerId, actor, action, target, metadata });
  } catch (err) {
    console.error("[audit] could not write entry", { action, target, err });
  }
}

export async function recentAudit(ownerId: string, limit = 40) {
  return getDb()
    .select()
    .from(auditLog)
    .where(eq(auditLog.ownerId, ownerId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}
