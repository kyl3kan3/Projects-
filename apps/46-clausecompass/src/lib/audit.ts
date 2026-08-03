/**
 * src/lib/audit.ts
 *
 * The audit trail. Contract review is a trust product: every deletion, share, credit
 * movement and playbook edit is recorded, and the deletion records outlive the thing
 * they deleted.
 */

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog } from "@/db/schema";

export interface AuditEntry {
  accountId: string;
  actor: string;
  action: string;
  target: string;
  metadata?: Record<string, unknown>;
}

export async function appendAudit(entry: AuditEntry): Promise<void> {
  const db = getDb();
  await db.insert(auditLog).values({
    accountId: entry.accountId,
    actor: entry.actor,
    action: entry.action,
    target: entry.target,
    metadata: entry.metadata ?? {},
  });
}

export async function recentAudit(accountId: string, limit = 40) {
  const db = getDb();
  return db
    .select()
    .from(auditLog)
    .where(eq(auditLog.accountId, accountId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}
