/**
 * Audit log writes.
 *
 * ROADMAP's acceptance bar: "every publish, moderation decision, and billing
 * change appears in the audit log". One helper, called from the places that
 * change corpus or money, so nothing has to remember the column names.
 */

import { getDb } from "@/db";
import { auditLog } from "@/db/schema";

export interface AuditInput {
  action: string;
  target: string;
  organizationId?: string | null;
  actorUserId?: string | null;
  actor?: string;
  metadata?: Record<string, unknown>;
}

export async function recordAudit(input: AuditInput): Promise<void> {
  const db = getDb();
  await db.insert(auditLog).values({
    action: input.action,
    target: input.target,
    organizationId: input.organizationId ?? null,
    actorUserId: input.actorUserId ?? null,
    actor: input.actor ?? input.actorUserId ?? "system",
    metadata: input.metadata ?? {},
  });
}
