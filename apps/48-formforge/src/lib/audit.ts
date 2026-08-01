/**
 * src/lib/audit.ts
 *
 * The audit trail — a product feature, not a debug artifact (README
 * differentiation 4). Every view, edit, export, send and signature lands here,
 * and the ledger screen and the audit CSV read from nowhere else.
 *
 * Two guarantees this module is responsible for:
 *
 *  - **Append-only.** There is no update or delete helper, and the database
 *    refuses both anyway (migration 0001 installs triggers that raise). An
 *    audit row outlives the thing it describes: deletions record ids and
 *    counts, never content.
 *
 *  - **No PHI in metadata.** Every row passes through `sanitizeMetadata` from
 *    lib/audit-policy.ts, which keeps only allowlisted keys. See that file for
 *    why it is an allowlist rather than a convention.
 *
 * Timestamps are the database's `now()` in UTC. Rendering to practice-local
 * happens at the edge, in lib/format.ts.
 */

import { and, desc, eq, gte, inArray, lte, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents, type ActorType, type AuditAction, type AuditEvent } from "@/db/schema";
import { filterActions, sanitizeMetadata, type AuditFilter, type AuditMetadata } from "@/lib/audit-policy";

export {
  ALLOWED_METADATA_KEYS,
  auditCsv,
  auditVerb,
  filterActions,
  sanitizeMetadata,
  type AuditFilter,
  type AuditMetadata,
} from "@/lib/audit-policy";

export interface AuditEventInput {
  practiceId: string;
  actorType: ActorType;
  /** User id, intake id (patient actor), or "cron"/"stripe" for system actors. */
  actorId?: string | null;
  /** Denormalised label so the ledger reads after the actor row is gone. */
  actorLabel: string;
  action: AuditAction;
  targetType: string;
  targetId?: string | null;
  /** PHI-free human label: a form title, "packet", "audit log". */
  targetLabel?: string;
  ip?: string | null;
  metadata?: AuditMetadata | null;
}

/**
 * Write one audit row. Never throws: losing the operation because the ledger
 * write failed would be worse than a gap, but the gap is loud in the logs.
 */
export async function appendAuditEvent(input: AuditEventInput): Promise<void> {
  const { metadata, dropped } = sanitizeMetadata(input.metadata);
  if (dropped.length) {
    console.warn(
      `[audit] dropped non-allowlisted metadata keys on ${input.action}: ${dropped.join(", ")}`,
    );
  }
  try {
    const db = getDb();
    await db.insert(auditEvents).values({
      practiceId: input.practiceId,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      actorLabel: input.actorLabel,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      targetLabel: input.targetLabel ?? "",
      ip: input.ip ?? null,
      metadata,
    });
  } catch (err) {
    console.error(`[audit] could not write ${input.action} event`, err);
  }
}

/* ------------------------------------------------------------------ queries */

export interface AuditQuery {
  practiceId: string;
  filter?: AuditFilter;
  /** Restrict to one target (a patient, an intake, a form). */
  targetType?: string;
  targetId?: string;
  /** Or to a set of targets — "everyone who touched this patient's packets". */
  targetIds?: string[];
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

function conditions(q: AuditQuery): SQL[] {
  const where: SQL[] = [eq(auditEvents.practiceId, q.practiceId)];
  const actions = filterActions(q.filter ?? "all");
  if (actions) where.push(inArray(auditEvents.action, actions));
  if (q.targetType) where.push(eq(auditEvents.targetType, q.targetType));
  if (q.targetId) where.push(eq(auditEvents.targetId, q.targetId));
  if (q.targetIds?.length) where.push(inArray(auditEvents.targetId, q.targetIds));
  // Typed operators, never a Date interpolated into a raw sql fragment.
  if (q.from) where.push(gte(auditEvents.createdAt, q.from));
  if (q.to) where.push(lte(auditEvents.createdAt, q.to));
  return where;
}

export async function queryAuditEvents(q: AuditQuery): Promise<AuditEvent[]> {
  const db = getDb();
  return db
    .select()
    .from(auditEvents)
    .where(and(...conditions(q)))
    .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
    .limit(q.limit ?? 100)
    .offset(q.offset ?? 0);
}

/** Everything that touched one intake, oldest first — the packet's own history. */
export async function auditForIntake(practiceId: string, intakeId: string): Promise<AuditEvent[]> {
  const db = getDb();
  return db
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.practiceId, practiceId),
        eq(auditEvents.targetType, "intake"),
        eq(auditEvents.targetId, intakeId),
      ),
    )
    .orderBy(desc(auditEvents.createdAt));
}

