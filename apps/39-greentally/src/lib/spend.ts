/**
 * src/lib/spend.ts
 *
 * Spend CSV pipeline: column mapping, EEIO category classification
 * (auto-suggested, user-confirmable), and exclusion rules.
 *
 * TODO:
 * - [ ] parseSpendCsv(file, mapping): csv-parse with saved per-org column
 *       mappings (description, amount, gl_account, date).
 * - [ ] suggestCategories(lines): batched LLM classification into USEEIO
 *       categories; deterministic keyword rules first, LLM for the tail.
 * - [ ] Auto-exclusions with reasons: payroll, taxes, intra-company,
 *       depreciation — never silently dropped.
 * - [ ] Currency normalization to the org's reporting currency.
 */

export interface SpendLineInput {
  description: string;
  amountCents: number;
  glAccount?: string;
}

export async function suggestCategories(_lines: SpendLineInput[]): Promise<unknown> {
  throw new Error("Not implemented");
}
