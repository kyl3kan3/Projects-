/**
 * The audit log. Bid shopping accusations are radioactive in this industry
 * (README risk 6), so every access to a bid — by an estimator or through a portal
 * token — leaves a row that says who, what, when.
 *
 * Writes here never throw into the caller: a failed audit insert must not stop a
 * sub from submitting a bid. It is logged loudly instead.
 */

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditLog, type ActorKind } from "@/db/schema";

export interface AuditInput {
  companyId: string;
  actorKind: ActorKind;
  actorId?: string | null;
  /** Human-readable actor: "kyle@fultonbuild.com" or "Meridian Electric (portal)". */
  actorLabel: string;
  action: string;
  target: string;
  metadata?: Record<string, unknown>;
}

export async function audit(input: AuditInput): Promise<void> {
  try {
    const db = getDb();
    await db.insert(auditLog).values({
      companyId: input.companyId,
      actorKind: input.actorKind,
      actorId: input.actorId ?? null,
      actorLabel: input.actorLabel,
      action: input.action,
      target: input.target,
      metadata: input.metadata ?? null,
    });
  } catch (err) {
    console.error("[audit] failed to record", input.action, err);
  }
}

export async function recentAudit(companyId: string, limit = 40) {
  const db = getDb();
  return db
    .select()
    .from(auditLog)
    .where(eq(auditLog.companyId, companyId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);
}
