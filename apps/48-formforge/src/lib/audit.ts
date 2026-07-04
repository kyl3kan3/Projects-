/**
 * src/lib/audit.ts
 *
 * Append-only audit log -- the product feature, not a debug artifact
 * (README differentiation 4). Every view, edit, export, send, and sign
 * flows through here; the audit screen and audit exports read from here.
 *
 * TODO:
 * - [ ] append(event): insert-only writer; metadata jsonb must be
 *       PHI-free (enforce with a key allowlist, not convention).
 * - [ ] Query helpers: byPatient(practiceId, patientId), byIntake,
 *       byActor, byAction -- filterable, paginated, newest-first.
 * - [ ] exportAudit(practiceId, filters): CSV export that itself appends
 *       an `exported` event (the export appears as the newest row --
 *       DESIGN.md audit screen).
 * - [ ] Retention: audit events outlive their targets; deletions log
 *       what was deleted (ids + counts, never content).
 * - [ ] Clock discipline: server UTC timestamps only; render local at
 *       the edge.
 */

import type { AuditAction } from "../db/schema";

export interface AuditEventInput {
  practiceId: string;
  actorType: "user" | "patient" | "system";
  actorId: string;
  action: AuditAction;
  targetType: string;
  targetId: string;
  ip?: string;
  metadata?: Record<string, string | number>;
}

export function appendAuditEvent(_event: AuditEventInput): Promise<void> {
  throw new Error("Not implemented");
}
