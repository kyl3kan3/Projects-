/**
 * src/db/schema.ts
 *
 * Drizzle ORM schema for all SchemaSentry tables — single source of truth
 * for the data model in ARCHITECTURE.md ("Data Model" section).
 *
 * TODO:
 * - [ ] pgTable for: organizations, users, api_tokens, apis, deploys,
 *       diffs, findings, consumers, consumer_impacts, contract_suites,
 *       changelog_entries, subscriptions, check_runs, audit_log.
 * - [ ] pgEnum for plan, finding level, verdict, environment, changelog
 *       status, check conclusion.
 * - [ ] Unique constraints: deploys (api, version_label, environment);
 *       apis (organization, slug).
 * - [ ] Composite indexes: findings (diff_id, level), deploys (api_id,
 *       pushed_at), changelog_entries (api_id, status).
 * - [ ] relations() definitions for query-builder joins.
 */

export type Plan = "solo" | "team" | "platform";

export type Verdict = "breaking" | "risky" | "compatible";

export type FindingLevel = "breaking" | "risky" | "compatible" | "info";

export type Environment = "prod" | "staging" | "pr";

// TODO: replace these placeholders with actual drizzle pgTable definitions.
export const organizations: unknown = undefined;
export const apiTokens: unknown = undefined;
export const apis: unknown = undefined;
export const deploys: unknown = undefined;
export const diffs: unknown = undefined;
export const findings: unknown = undefined;
export const consumers: unknown = undefined;
export const consumerImpacts: unknown = undefined;
export const contractSuites: unknown = undefined;
export const changelogEntries: unknown = undefined;
export const subscriptions: unknown = undefined;
export const checkRuns: unknown = undefined;
export const auditLog: unknown = undefined;
