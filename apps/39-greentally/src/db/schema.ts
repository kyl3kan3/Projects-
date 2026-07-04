/**
 * src/db/schema.ts
 *
 * Drizzle ORM schema for all GreenTally tables — single source of truth for
 * the data model in ARCHITECTURE.md ("Data Model" section).
 *
 * TODO:
 * - [ ] pgTable for: organizations, users, sites, reporting_periods,
 *       documents, activity_lines, spend_lines, emission_factors,
 *       emission_results, reports, questionnaire_answers, audit_log
 *       (plus Auth.js accounts/sessions tables).
 * - [ ] pgEnum for plan, document kind/status, activity category, scope,
 *       framework, classification source.
 * - [ ] Provenance FKs: emission_results -> factor + activity/spend line.
 * - [ ] Composite indexes: documents (org, status), activity_lines
 *       (period, site), emission_results (period, scope).
 * - [ ] relations() definitions for query-builder joins.
 */

export type Plan = "starter" | "standard" | "supplier_plus";

export type DocumentStatus =
  | "uploaded"
  | "extracting"
  | "needs_review"
  | "accepted"
  | "rejected";

export type Scope = "1" | "2_location" | "2_market" | "3_spend";

export type ActivityCategory =
  | "electricity_kwh"
  | "natural_gas_kwh"
  | "diesel_l"
  | "petrol_l"
  | "heating_oil_l"
  | "propane_l";

export type FactorSet = "epa_2025" | "egrid_2024" | "defra_2025" | "useeio_v2";

// TODO: replace these placeholders with actual drizzle pgTable definitions.
export const organizations: unknown = undefined;
export const sites: unknown = undefined;
export const reportingPeriods: unknown = undefined;
export const documents: unknown = undefined;
export const activityLines: unknown = undefined;
export const spendLines: unknown = undefined;
export const emissionFactors: unknown = undefined;
export const emissionResults: unknown = undefined;
export const reports: unknown = undefined;
export const questionnaireAnswers: unknown = undefined;
export const auditLog: unknown = undefined;
