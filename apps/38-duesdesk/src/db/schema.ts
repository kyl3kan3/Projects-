/**
 * src/db/schema.ts
 *
 * Drizzle ORM schema for all DuesDesk tables. Single source of truth for
 * the data model described in ARCHITECTURE.md ("Data Model" section).
 * Migrations are generated from this file via `npm run db:generate`.
 *
 * TODO:
 * - [ ] Define pgTable for: associations, users, households, members,
 *       assessment_schedules, invoices, payments, autopay_enrollments,
 *       issues, issue_events, announcements, deliveries, documents,
 *       audit_log (plus Auth.js tables).
 * - [ ] pgEnum for plan, association kind, invoice status, payment method,
 *       autopay status, issue kind/status, event visibility, delivery
 *       status, document category.
 * - [ ] Unique constraints: invoices (household_id, assessment_schedule_id,
 *       period_label); issues yearly number sequence per association;
 *       one active autopay enrollment per household.
 * - [ ] Append-only issue_events (API-enforced + DB trigger -- the
 *       fair-process timeline must be tamper-evident).
 * - [ ] Composite indexes: invoices (association via household, status,
 *       due_on), payments (household, received_on), deliveries
 *       (announcement, status).
 * - [ ] relations() definitions for the delinquency and thread queries.
 */

export type Plan = "block" | "neighborhood" | "community";

export type AssociationKind = "hoa" | "condo" | "club" | "league";

export type InvoiceStatus =
  | "draft"
  | "sent"
  | "paid"
  | "partial"
  | "overdue"
  | "written_off";

export type PaymentMethod = "card" | "ach" | "check" | "cash" | "other";

export type AutopayStatus = "active" | "paused" | "failed";

export type IssueKind = "violation" | "maintenance" | "architectural";

export type IssueStatus = "open" | "in_progress" | "resolved" | "closed";

export type EventVisibility = "member_visible" | "board_only";

export type DeliveryStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "bounced"
  | "failed"
  | "opted_out";

// TODO: replace these placeholders with actual drizzle pgTable definitions.
export const associations: unknown = undefined;
export const households: unknown = undefined;
export const members: unknown = undefined;
export const assessmentSchedules: unknown = undefined;
export const invoices: unknown = undefined;
export const payments: unknown = undefined;
export const autopayEnrollments: unknown = undefined;
export const issues: unknown = undefined;
export const issueEvents: unknown = undefined;
export const announcements: unknown = undefined;
export const deliveries: unknown = undefined;
export const documents: unknown = undefined;
export const auditLog: unknown = undefined;
