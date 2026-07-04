/**
 * src/db/schema.ts
 *
 * Drizzle ORM schema for all FormForge tables. Single source of truth for
 * the data model described in ARCHITECTURE.md ("Data Model" section).
 * Columns marked [enc] in ARCHITECTURE.md store AES-GCM ciphertext
 * (bytea) written only through lib/crypto helpers.
 *
 * TODO:
 * - [ ] Define pgTable for: practices, users, forms, form_versions,
 *       patients, intakes, submissions, signature_records, uploads,
 *       audit_events, reminders, exports (plus Auth.js tables).
 * - [ ] pgEnum for plan, user role, form status, intake status,
 *       signature kind, audit action, reminder channel/status.
 * - [ ] Unique constraints: intakes.token_hash; form_versions
 *       (form_id, version).
 * - [ ] Composite indexes: intakes (practice_id, status),
 *       audit_events (practice_id, target_type, target_id, created_at),
 *       reminders (scheduled_for, status).
 * - [ ] relations() definitions for query-builder joins.
 * - [ ] Row-level tenancy convention: every domain table carries
 *       practice_id or reaches it through intakes.
 */

export type Plan = "solo" | "group" | "clinic";

export type UserRole = "owner" | "clinician" | "frontdesk";

export type IntakeStatus =
  | "sent"
  | "started"
  | "completed"
  | "signed"
  | "expired";

export type AuditAction =
  | "viewed"
  | "edited"
  | "exported"
  | "sent"
  | "signed"
  | "deleted"
  | "login";

export type SignatureKind = "typed" | "drawn";

/** Ordered block config persisted on forms/form_versions. */
export interface FormBlock {
  key: string;
  kind:
    | "demographics"
    | "insurance"
    | "history"
    | "consent"
    | "signature"
    | "upload"
    | "screener";
  config: Record<string, unknown>;
}
