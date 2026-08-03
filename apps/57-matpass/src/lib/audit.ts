/**
 * The audit log. Promotions, billing changes, kiosk revocations and flag
 * outcomes always write a row — a promotion nobody can account for is the exact
 * failure this product sells against.
 */

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, users } from "@/db/schema";

export async function audit(input: {
  schoolId: string;
  actorId?: string | null;
  action: string;
  target: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const db = getDb();
  await db.insert(auditLog).values({
    schoolId: input.schoolId,
    actorId: input.actorId ?? null,
    action: input.action,
    target: input.target,
    metadata: input.metadata ?? {},
  });
}

export async function recentAudit(schoolId: string, limit = 20) {
  const db = getDb();
  return db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      target: auditLog.target,
      occurredAt: auditLog.occurredAt,
      metadata: auditLog.metadata,
      actorName: users.name,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .where(eq(auditLog.schoolId, schoolId))
    .orderBy(desc(auditLog.occurredAt))
    .limit(limit);
}
