/**
 * src/db/schema.ts
 *
 * Drizzle ORM schema for all BidBoard tables. Single source of truth for
 * the data model described in ARCHITECTURE.md ("Data Model" section).
 * Migrations are generated from this file via `npm run db:generate`.
 *
 * TODO:
 * - [ ] Define pgTable for: companies, users, sub_companies, sub_contacts,
 *       projects, trade_packages, bid_form_lines, plan_files, invitations,
 *       bids, bid_lines, leveling_adjustments, questions, awards,
 *       email_events, audit_log (plus Auth.js tables).
 * - [ ] pgEnum for plan, project status, package status, invitation status,
 *       bid kind, mapping status, adjustment kind, email event kind/status.
 * - [ ] Unique constraints: invitations (trade_package_id, sub_contact_id);
 *       one active (non-superseded) bid revision per invitation.
 * - [ ] Composite indexes: invitations (package, status), bid_lines
 *       (bid, bid_form_line), email_events (invitation, occurred_at).
 * - [ ] relations() definitions for query-builder joins (the leveling
 *       pivot leans on these).
 */

export type Plan = "crew" | "builder" | "precon";

export type ProjectStatus =
  | "draft"
  | "bidding"
  | "leveling"
  | "awarded"
  | "archived";

export type PackageStatus = "draft" | "open" | "closed" | "awarded";

export type InvitationStatus =
  | "sent"
  | "opened"
  | "will_bid"
  | "declined"
  | "submitted"
  | "no_response";

export type BidKind = "itemized" | "lump_sum";

export type MappingStatus = "matched" | "manual" | "unmapped";

export type AdjustmentKind = "plug" | "normalize" | "scope_add";

// TODO: replace these placeholders with actual drizzle pgTable definitions.
export const companies: unknown = undefined;
export const subCompanies: unknown = undefined;
export const subContacts: unknown = undefined;
export const projects: unknown = undefined;
export const tradePackages: unknown = undefined;
export const bidFormLines: unknown = undefined;
export const planFiles: unknown = undefined;
export const invitations: unknown = undefined;
export const bids: unknown = undefined;
export const bidLines: unknown = undefined;
export const levelingAdjustments: unknown = undefined;
export const questions: unknown = undefined;
export const awards: unknown = undefined;
export const emailEvents: unknown = undefined;
export const auditLog: unknown = undefined;
