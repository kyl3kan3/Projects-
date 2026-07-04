/**
 * src/db/schema.ts
 *
 * Drizzle ORM schema for all GrantGrid tables. Single source of truth for
 * the data model described in ARCHITECTURE.md ("Data Model" section) --
 * both the tenant family (organizations...) and the shared curated funder
 * database (funders, funder_awards, funder_change_reports).
 *
 * TODO:
 * - [ ] Define pgTable for: organizations, users, memberships, grants,
 *       deadlines, answers, workspace_items, reminders, activity_log,
 *       funders, funder_awards, funder_change_reports (plus Auth.js
 *       tables).
 * - [ ] pgEnum for plan, grant stage, deadline kind, answer kind,
 *       workspace status, curation status, funder kind.
 * - [ ] Unique constraints: funders.ein, reminders (deadline_id,
 *       offset_days) -- the exactly-once ledger.
 * - [ ] Composite indexes: grants (organization_id, stage),
 *       deadlines (due_on, completed_at), funders (curation_status,
 *       states_funded GIN, cause_codes GIN).
 * - [ ] Postgres full-text index on funders (name, giving profile) for
 *       discovery search.
 * - [ ] relations() definitions; tenancy convention: tenant tables carry
 *       organization_id; funder tables never do.
 */

export type Plan = "seed" | "grow" | "field";

export type GrantStage =
  | "researching"
  | "loi"
  | "applying"
  | "submitted"
  | "awarded"
  | "declined"
  | "reporting"
  | "closed";

export type DeadlineKind = "loi" | "application" | "report" | "renewal" | "custom";

export type AnswerKind =
  | "mission_short"
  | "mission_long"
  | "program"
  | "budget"
  | "board_list"
  | "attachment"
  | "custom";

export type CurationStatus = "proposed" | "approved" | "retired";
