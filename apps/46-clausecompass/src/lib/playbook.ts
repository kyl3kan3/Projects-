/**
 * src/lib/playbook.ts
 *
 * Playbook scoring (pipeline pass 2) — deterministic, pure TypeScript,
 * NO LLM. Same contract + same playbook version = same flags, always.
 * This determinism is the product's trust story; keep it boring.
 *
 * TODO:
 * - [ ] Default freelancer/SMB playbook v1 as seed data: payment terms
 *       > net-30 -> CAUTION, > net-60 -> HIGH; IP assignment before
 *       payment -> HIGH; indemnity not mutual or uncapped -> HIGH;
 *       non-compete present -> HIGH (freelancer default: never);
 *       auto-renewal notice < 30 days -> CAUTION; no liability cap ->
 *       HIGH; no termination for convenience -> CAUTION; unlimited
 *       revisions -> CAUTION.
 * - [ ] score(contractId, playbookId): run rules against clauses'
 *       extracted_fields; one flags row per fired rule with fired_because
 *       rendered from the rule ("Payment terms are net-60; your playbook
 *       allows net-30").
 * - [ ] Missing-clause detection: contract-type checklist vs found clause
 *       types -> flags with clause_id null.
 * - [ ] Custom playbooks (Studio): rule overrides + house rules, versioned
 *       (reports pin the version they were scored with).
 * - [ ] Rule engine stays data-driven (playbook_rules rows), not code
 *       branches, so custom rules need no deploy.
 */

import type { Severity } from "../db/schema";

export interface FiredRule {
  ruleKey: string;
  clauseId: string | null; // null = missing-clause flag
  severity: Severity;
  firedBecause: string;
}

export function score(
  _contractId: string,
  _playbookId: string,
): Promise<FiredRule[]> {
  throw new Error("Not implemented");
}
