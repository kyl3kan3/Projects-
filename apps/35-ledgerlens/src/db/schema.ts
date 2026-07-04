/**
 * src/db/schema.ts
 *
 * Drizzle ORM schema for all LedgerLens tables. Single source of truth for
 * the data model described in ARCHITECTURE.md ("Data Model" section).
 * Migrations are generated from this file via `npm run db:generate`.
 *
 * TODO:
 * - [ ] Define pgTable for: organizations, users, documents, extractions,
 *       line_items, vendors, categories, review_items, close_periods,
 *       share_links, usage_counters, audit_log (plus Auth.js tables).
 * - [ ] pgEnum for plan, document source/status, doc_type, review field,
 *       review resolution, close status.
 * - [ ] Unique constraints: documents (organization_id, content_hash);
 *       organizations.forwarding_slug; close_periods (org, period).
 * - [ ] Composite indexes: documents (org, status), review_items
 *       (org via document, resolved_at), line_items (org, doc_date).
 * - [ ] relations() definitions for query-builder joins.
 * - [ ] Seed data plan for the global Schedule-C category set.
 */

export type Plan = "solo" | "operator" | "pro";

export type DocumentSource = "email" | "photo" | "upload";

export type DocumentStatus =
  | "queued"
  | "extracting"
  | "extracted"
  | "needs_review"
  | "confirmed"
  | "rejected"
  | "duplicate_of";

export type DocType = "receipt" | "invoice" | "statement" | "other";

export type ReviewField = "vendor" | "date" | "total" | "tax" | "category";

export type ReviewResolution = "accepted" | "corrected" | "skipped";

export type ClosePeriodStatus = "open" | "closing" | "closed";

export interface FieldConfidence {
  vendor: number;
  date: number;
  total: number;
  tax: number;
  category: number;
}

// TODO: replace these placeholders with actual drizzle pgTable definitions.
export const organizations: unknown = undefined;
export const documents: unknown = undefined;
export const extractions: unknown = undefined;
export const lineItems: unknown = undefined;
export const vendors: unknown = undefined;
export const categories: unknown = undefined;
export const reviewItems: unknown = undefined;
export const closePeriods: unknown = undefined;
export const shareLinks: unknown = undefined;
export const usageCounters: unknown = undefined;
export const auditLog: unknown = undefined;
