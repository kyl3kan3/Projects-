/**
 * src/lib/audit.ts
 *
 * Who did what in the yard's account.
 *
 * BUILD.md names the four things that always get logged, because they are the
 * four a customer's lawyer asks about: deposit captures, waives, contract
 * signatures, and inventory count edits. Nothing in the app gates on the audit
 * log, so a failure to write one must never fail the action it was recording —
 * hence the swallowed error and the console line.
 */

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog } from "@/db/schema";

export async function audit(
  accountId: string,
  actor: string,
  action: string,
  target = "",
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    await getDb().insert(auditLog).values({ accountId, actor, action, target, metadata });
  } catch (err) {
    console.error("[audit] could not write entry", { action, target, err });
  }
}

export async function recentAudit(accountId: string, limit = 40) {
  return getDb()
    .select()
    .from(auditLog)
    .where(eq(auditLog.accountId, accountId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}

export async function auditForTarget(accountId: string, target: string, limit = 20) {
  return getDb()
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.accountId, accountId), eq(auditLog.target, target)))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}
