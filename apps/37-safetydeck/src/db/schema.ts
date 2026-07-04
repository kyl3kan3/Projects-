/**
 * src/db/schema.ts
 *
 * Drizzle ORM schema for all SafetyDeck tables. Single source of truth for
 * the data model described in ARCHITECTURE.md ("Data Model" section).
 * Migrations are generated from this file via `npm run db:generate`.
 *
 * TODO:
 * - [ ] Define pgTable for: companies, users, crews, employees, talks,
 *       talk_instances, sign_offs, incidents, osha_forms, certs,
 *       reminders, binder_exports, audit_log (plus Auth.js tables).
 * - [ ] pgEnum for plan, talk instance status, treatment, cert kind/status,
 *       reminder rung/channel, form kind.
 * - [ ] Unique constraints: sign_offs (talk_instance_id, employee_id);
 *       incidents yearly case_number sequence per company.
 * - [ ] Immutability: sign_offs and completed talk_instances are
 *       append-only -- enforce at the API layer AND with a DB trigger
 *       (defense in depth; these records are legal artifacts).
 * - [ ] Composite indexes: talk_instances (crew, scheduled_for), certs
 *       (company via employee, expires_on), incidents (company, occurred_at).
 * - [ ] relations() definitions for the attendance-matrix pivot.
 */

export type Plan = "crew" | "company" | "fleet";

export type TalkInstanceStatus =
  | "scheduled"
  | "delivered"
  | "in_progress"
  | "completed"
  | "missed";

export type Treatment =
  | "first_aid"
  | "medical"
  | "er"
  | "hospitalized"
  | "fatality";

export type CertKind =
  | "osha_10"
  | "osha_30"
  | "first_aid_cpr"
  | "fit_test"
  | "license"
  | "custom";

export type CertStatus = "valid" | "expiring" | "expired";

export type ReminderRung = "60d" | "30d" | "7d" | "overdue";

export type OshaFormKind = "form_300" | "form_301" | "form_300a";

// TODO: replace these placeholders with actual drizzle pgTable definitions.
export const companies: unknown = undefined;
export const crews: unknown = undefined;
export const employees: unknown = undefined;
export const talks: unknown = undefined;
export const talkInstances: unknown = undefined;
export const signOffs: unknown = undefined;
export const incidents: unknown = undefined;
export const oshaForms: unknown = undefined;
export const certs: unknown = undefined;
export const reminders: unknown = undefined;
export const binderExports: unknown = undefined;
export const auditLog: unknown = undefined;
