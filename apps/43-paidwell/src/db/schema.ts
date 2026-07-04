/**
 * src/db/schema.ts
 *
 * Drizzle ORM schema for all PaidWell tables. Single source of truth for the
 * data model described in ARCHITECTURE.md ("Data Model" section).
 * Migrations are generated from this file via `npm run db:generate`.
 *
 * TODO:
 * - [ ] Define pgTable for: firms, users, accounting_connections, clients,
 *       invoices, sequences, sequence_runs, messages, promises, payments,
 *       forecast_snapshots, audit_log (plus Auth.js accounts/sessions).
 * - [ ] pgEnum for plan, invoice status, sequence-run state, message status,
 *       promise status, tone preset, accounting provider.
 * - [ ] Unique constraints: (firm_id, provider, external_id) on invoices and
 *       clients (sync idempotency).
 * - [ ] Composite indexes: invoices (firm_id, status, due_at),
 *       sequence_runs (state, next_send_at), promises (status, promised_for).
 * - [ ] relations() definitions for query-builder joins.
 * - [ ] Tenancy convention: every domain table carries firm_id directly.
 */

export type Plan = "studio" | "firm" | "practice";

export type InvoiceStatus =
  | "open"
  | "partial"
  | "paid"
  | "written_off"
  | "disputed";

export type SequenceRunState =
  | "scheduled"
  | "running"
  | "paused_promise"
  | "paused_reply"
  | "awaiting_approval"
  | "completed"
  | "stopped";

export type PromiseStatus = "open" | "kept" | "broken";

export type TonePreset = "warm" | "neutral" | "firm";

export type AccountingProvider = "qbo" | "xero" | "csv" | "stripe_invoicing";

export interface SequenceStep {
  offsetDaysFromDue: number;
  templateId: string;
  escalationLevel: 1 | 2 | 3 | 4;
}

// TODO: replace these placeholders with actual drizzle pgTable definitions.
export const firms: unknown = undefined;
export const users: unknown = undefined;
export const accountingConnections: unknown = undefined;
export const clients: unknown = undefined;
export const invoices: unknown = undefined;
export const sequences: unknown = undefined;
export const sequenceRuns: unknown = undefined;
export const messages: unknown = undefined;
export const promises: unknown = undefined;
export const payments: unknown = undefined;
export const forecastSnapshots: unknown = undefined;
export const auditLog: unknown = undefined;
