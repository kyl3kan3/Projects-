/**
 * src/db/schema.ts
 *
 * Drizzle ORM schema for all QuoteFox tables. Single source of truth for
 * the data model described in ARCHITECTURE.md ("Data Model" section).
 * Migrations are generated from this file via `npm run db:generate`.
 *
 * TODO:
 * - [ ] Define pgTable for: organizations, users, price_book_items, jobs,
 *       walkthroughs, walkthrough_media, estimates, estimate_line_items,
 *       proposals, proposal_events, deposits, webhook_events, audit_log
 *       (plus Auth.js accounts/sessions tables).
 * - [ ] pgEnum for plan, trade, walkthrough status, estimate status,
 *       proposal status, deposit status, line-item source, media kind.
 * - [ ] pgvector column on price_book_items.embedding with an HNSW index.
 * - [ ] Unique constraints: webhook_events.external_event_id (idempotency),
 *       proposals.token_id.
 * - [ ] Composite indexes: jobs (org, status), estimate_line_items
 *       (estimate_id, position), proposal_events (proposal_id, occurred_at).
 * - [ ] relations() definitions for query-builder joins.
 * - [ ] Row-level tenancy convention: every domain table carries
 *       organization_id or reaches it through jobs.
 */

export type Plan = "solo" | "crew" | "fleet";

export type Trade = "hvac" | "roofing" | "electrical" | "plumbing" | "other";

export type WalkthroughStatus =
  | "capturing"
  | "uploaded"
  | "transcribing"
  | "drafting"
  | "drafted"
  | "failed";

export type EstimateStatus = "drafting" | "draft" | "ready" | "sent";

export type ProposalStatus =
  | "sent"
  | "viewed"
  | "accepted"
  | "deposit_paid"
  | "expired"
  | "withdrawn";

export type DepositStatus = "pending" | "paid" | "refunded" | "failed";

export type LineItemSource = "ai" | "manual";

export type PriceBookItemKind = "labor" | "material" | "flat_rate";

export interface DraftedLineItem {
  priceBookItemId: string | null; // null = needs_pricing, never an invented price
  name: string;
  quantity: number;
  transcriptExcerpt: string;
}

// TODO: replace these placeholders with actual drizzle pgTable definitions.
export const organizations: unknown = undefined;
export const users: unknown = undefined;
export const priceBookItems: unknown = undefined;
export const jobs: unknown = undefined;
export const walkthroughs: unknown = undefined;
export const walkthroughMedia: unknown = undefined;
export const estimates: unknown = undefined;
export const estimateLineItems: unknown = undefined;
export const proposals: unknown = undefined;
export const proposalEvents: unknown = undefined;
export const deposits: unknown = undefined;
export const webhookEvents: unknown = undefined;
export const auditLog: unknown = undefined;
