/**
 * src/lib/audit.ts
 *
 * Append-only audit trail. Every access, edit, sign, export, purge, and
 * login writes here — and the log is surfaced to the clinician in-product
 * (Trust screen), not hidden in ops tooling.
 *
 * TODO:
 * - [ ] recordAudit(): insert audit_events with actor, action, target,
 *       ip, user_agent, metadata. No update/delete path is ever written
 *       for this table.
 * - [ ] withAudit(): wrapper used by requirePractice() so page/API access
 *       to PHI-bearing targets logs automatically.
 * - [ ] listAuditEvents(): practice-scoped, filterable (views/edits/signs/
 *       exports/purges), cursor-paginated for the Trust screen.
 * - [ ] Scrub rule: metadata must never contain note text or transcript
 *       content — IDs and counts only (enforced by type + review).
 */

export type AuditAction =
  | "viewed"
  | "created"
  | "edited"
  | "signed"
  | "cosigned"
  | "amended"
  | "exported"
  | "purged"
  | "login";

export async function recordAudit(_input: {
  practiceId: string;
  actorId?: string;
  action: AuditAction;
  targetKind: string;
  targetId?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  // TODO: implement — append-only, no exceptions
  throw new Error("Not implemented");
}
