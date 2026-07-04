/**
 * src/db/schema.ts
 *
 * Drizzle ORM schema for all TenantFile tables. Single source of truth for
 * the data model in ARCHITECTURE.md ("Data Model" section). Migrations are
 * generated from this file via `npm run db:generate`.
 *
 * TODO:
 * - [ ] Define pgTable for: landlords, users, properties, units, listings,
 *       applications, screening_reports, tenancies, leases, charges,
 *       payments, late_fee_rules, maintenance_requests, request_messages,
 *       file_events, reminders, audit_log (plus Auth.js tables).
 * - [ ] pgEnum for plan, unit status, application status, screening status,
 *       lease status, charge kind/status, payment method, request status,
 *       file-event kind, reminder template.
 * - [ ] Unique constraints: listings.slug; (tenancy_id, period, kind=rent)
 *       on charges (no double rent).
 * - [ ] Composite indexes: charges (status, due_on), reminders (status,
 *       send_at), file_events (tenancy_id, occurred_at).
 * - [ ] relations() definitions; file_events is append-only by convention.
 */

export type Plan = "keys" | "building" | "portfolio";

export type UnitStatus = "vacant" | "listed" | "occupied";

export type ApplicationStatus =
  | "new"
  | "invited_to_screen"
  | "screened"
  | "approved"
  | "declined";

export type ChargeKind = "rent" | "late_fee" | "deposit" | "other";

export type ChargeStatus = "upcoming" | "due" | "partial" | "paid" | "waived";

export type PaymentMethod =
  | "ach"
  | "card"
  | "manual_zelle"
  | "manual_cash"
  | "manual_check";

export type FileEventKind =
  | "application"
  | "screening"
  | "lease"
  | "charge"
  | "payment"
  | "reminder"
  | "request"
  | "note";

// TODO: replace these placeholders with actual drizzle pgTable definitions.
export const landlords: unknown = undefined;
export const users: unknown = undefined;
export const properties: unknown = undefined;
export const units: unknown = undefined;
export const listings: unknown = undefined;
export const applications: unknown = undefined;
export const screeningReports: unknown = undefined;
export const tenancies: unknown = undefined;
export const leases: unknown = undefined;
export const charges: unknown = undefined;
export const payments: unknown = undefined;
export const lateFeeRules: unknown = undefined;
export const maintenanceRequests: unknown = undefined;
export const requestMessages: unknown = undefined;
export const fileEvents: unknown = undefined;
export const reminders: unknown = undefined;
export const auditLog: unknown = undefined;
