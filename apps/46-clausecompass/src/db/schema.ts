/**
 * src/db/schema.ts
 *
 * Drizzle ORM schema for all ClauseCompass tables. Single source of truth
 * for the data model in ARCHITECTURE.md ("Data Model" section).
 * Migrations are generated via `npm run db:generate`.
 *
 * TODO:
 * - [ ] Define pgTable for: accounts, users, playbooks, playbook_rules,
 *       contracts, contract_texts, clauses, flags, redlines, reports,
 *       purchases, eval_cases, audit_log (plus Auth.js tables).
 * - [ ] pgEnum for plan, contract status, contract type, clause type,
 *       severity, purchase kind.
 * - [ ] clauses.source_spans jsonb NOT NULL with a CHECK (non-empty array)
 *       — the anchoring invariant lives in the schema too.
 * - [ ] clauses.raw_model_output + model_version kept verbatim (audit).
 * - [ ] reports carry playbook_version + model_version (provenance).
 * - [ ] Composite indexes: contracts (account_id, status), flags
 *       (contract_id, severity), purchases (account_id, expires_at).
 * - [ ] accounts.disclaimer_ack_at NOT NULL by the time a review runs.
 */

export type Plan = "per_contract" | "freelancer" | "studio";

export type ContractStatus =
  | "uploaded"
  | "parsing"
  | "extracting"
  | "scoring"
  | "explaining"
  | "ready"
  | "failed";

export type ContractType = "msa" | "sow" | "nda" | "vendor" | "lease" | "other";

export type ClauseType =
  | "payment_terms"
  | "ip_assignment"
  | "indemnity"
  | "non_compete"
  | "auto_renewal"
  | "termination"
  | "liability_cap"
  | "confidentiality"
  | "warranties"
  | "governing_law"
  | "late_fees"
  | "scope_revisions"
  | "boilerplate"
  | "other";

export type Severity = "ok" | "caution" | "high";

export interface SourceSpan {
  page: number;
  startOffset: number;
  endOffset: number;
  quote: string; // must string-match the parsed text — validated at ingest
}

// TODO: replace these placeholders with actual drizzle pgTable definitions.
export const accounts: unknown = undefined;
export const users: unknown = undefined;
export const playbooks: unknown = undefined;
export const playbookRules: unknown = undefined;
export const contracts: unknown = undefined;
export const contractTexts: unknown = undefined;
export const clauses: unknown = undefined;
export const flags: unknown = undefined;
export const redlines: unknown = undefined;
export const reports: unknown = undefined;
export const purchases: unknown = undefined;
export const evalCases: unknown = undefined;
export const auditLog: unknown = undefined;
