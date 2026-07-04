/**
 * src/db/schema.ts
 *
 * Drizzle ORM schema for all CrewClock tables. Single source of truth for
 * the data model described in ARCHITECTURE.md ("Data Model" section).
 * Migrations are generated from this file via `npm run db:generate`.
 *
 * TODO:
 * - [ ] Define pgTable for: organizations, users, job_sites, jobs,
 *       crew_assignments, time_entries, time_entry_edits, overtime_alerts,
 *       payroll_exports, export_line_items, webhook_events, audit_log
 *       (plus Auth.js accounts/sessions tables for owner/office).
 * - [ ] pgEnum for plan, role, locale, geofence status, entry source,
 *       job status, export format/status, overtime rule.
 * - [ ] Unique constraints: time_entries (organization_id, client_event_id)
 *       for offline dedupe; webhook_events.stripe_event_id;
 *       overtime_alerts (user_id, week_start).
 * - [ ] Composite indexes: time_entries (job_id, clock_in_at),
 *       time_entries (user_id, clock_in_at), jobs (organization_id, status).
 * - [ ] relations() definitions for query-builder joins.
 * - [ ] Phone-first crew accounts: email nullable, invite via signed
 *       code/QR (optionally delivered by SMS), pin_hash for crew auth.
 * - [ ] Row-level tenancy convention: every domain table carries
 *       organization_id or reaches it through jobs/users.
 * - [ ] Sibling src/db/index.ts: postgres.js client from DATABASE_URL
 *       (pooled) exporting db + schema, serializable-tx helper.
 */

export type Plan = "crew" | "company";

export type Role = "owner" | "office" | "crew";

export type Locale = "en" | "es";

export type GeofenceStatus = "inside" | "outside" | "unavailable";

export type TimeEntrySource = "live" | "offline_sync" | "manual";

export type JobStatus = "bidding" | "active" | "complete" | "archived";

export type OvertimeRule = "weekly_40" | "daily_8_weekly_40" | "none";

export type ExportFormat = "adp" | "gusto";

export type ExportStatus = "pending" | "generated" | "failed";

export interface PunchLocation {
  lat: number | null;
  lng: number | null;
  accuracyM: number | null;
}

// TODO: replace these placeholders with actual drizzle pgTable definitions.
export const organizations: unknown = undefined;
export const users: unknown = undefined;
export const jobSites: unknown = undefined;
export const jobs: unknown = undefined;
export const crewAssignments: unknown = undefined;
export const timeEntries: unknown = undefined;
export const timeEntryEdits: unknown = undefined;
export const overtimeAlerts: unknown = undefined;
export const payrollExports: unknown = undefined;
export const exportLineItems: unknown = undefined;
export const webhookEvents: unknown = undefined;
export const auditLog: unknown = undefined;
