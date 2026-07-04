/**
 * src/db/schema.ts
 *
 * Drizzle ORM schema for all PermitPath tables. Single source of truth for
 * the data model described in ARCHITECTURE.md ("Data Model" section).
 * Migrations are generated from this file via `npm run db:generate`.
 *
 * TODO:
 * - [ ] Define pgTable for: organizations, users, jurisdictions,
 *       jurisdiction_sources, requirement_records, requirement_changes,
 *       jobs, permit_checklists, checklist_items, permit_applications,
 *       inspections, licenses_and_credentials, expiry_alerts,
 *       contributions, webhook_events, audit_log (plus Auth.js tables).
 * - [ ] pgEnum for plan, application status, verification state, review
 *       state, alert tier, source kind, coverage status.
 * - [ ] Version chaining on requirement_records via `superseded_by`
 *       self-reference; partial index on "current" records (superseded_by
 *       IS NULL) per (jurisdiction_id, job_type).
 * - [ ] Unique constraint on webhook_events (provider, provider_event_id)
 *       for idempotency.
 * - [ ] Composite indexes: expiry-scan path (subject expires_at),
 *       requirement_changes (review_state), checklist_items (checklist_id).
 * - [ ] relations() definitions for query-builder joins.
 * - [ ] Tenancy convention: org tables carry organization_id; the
 *       jurisdiction/requirement corpus is global and shared.
 */

export type Plan = "crew" | "company" | "regional";

export type ApplicationStatus =
  | "not_submitted"
  | "in_review"
  | "issued"
  | "expired"
  | "stop_work";

export type VerificationState = "open" | "verified" | "na";

export type ReviewState = "pending" | "approved" | "rejected";

export type ContributionReviewState = "pending" | "accepted" | "rejected";

export type SourceKind = "official_page" | "phone_confirmation" | "contribution";

export type ChangeOrigin = "crawl_diff" | "contribution" | "curator";

export type CoverageStatus = "curated" | "partial" | "requested";

export type ExpiryAlertTier = "t60" | "t30" | "t7" | "t1";

export type CredentialKind =
  | "contractor_license"
  | "trade_registration"
  | "business_license"
  | "insurance_cert";

export interface FeeLine {
  label: string;
  amountCents: number;
  notes?: string;
}

export interface SubmittalRequirement {
  title: string;
  detail: string;
  required: boolean;
}

// TODO: replace these placeholders with actual drizzle pgTable definitions.
export const organizations: unknown = undefined;
export const users: unknown = undefined;
export const jurisdictions: unknown = undefined;
export const jurisdictionSources: unknown = undefined;
export const requirementRecords: unknown = undefined;
export const requirementChanges: unknown = undefined;
export const jobs: unknown = undefined;
export const permitChecklists: unknown = undefined;
export const checklistItems: unknown = undefined;
export const permitApplications: unknown = undefined;
export const inspections: unknown = undefined;
export const licensesAndCredentials: unknown = undefined;
export const expiryAlerts: unknown = undefined;
export const contributions: unknown = undefined;
export const webhookEvents: unknown = undefined;
export const auditLog: unknown = undefined;
