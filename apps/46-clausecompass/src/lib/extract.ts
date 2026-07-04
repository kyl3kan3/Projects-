/**
 * src/lib/extract.ts
 *
 * Clause extraction (pipeline pass 1): the full parsed contract goes to
 * Claude with the `record_clauses` tool; every clause comes back typed
 * with source spans, then gets verified against the actual text. Nothing
 * unanchored survives.
 *
 * TODO:
 * - [ ] record_clauses tool schema: array of {clause_type (taxonomy enum),
 *       heading?, source_spans: [{page, quote}] REQUIRED non-empty,
 *       extracted_fields (typed per clause_type: payment_days,
 *       renewal_notice_days, cap_amount, mutual: boolean, ...)}.
 * - [ ] Anchor validation: every quote string-matched (whitespace-
 *       normalized) against parse.ts blocks -> resolve offsets; failed
 *       quotes -> one re-request naming the failures; still failing ->
 *       discard + log (the invariant: no unanchored output renders).
 * - [ ] Coverage check: every numbered section assigned (clause |
 *       boilerplate | not_analyzed); gaps surface in the report.
 * - [ ] Contract-type detection (msa|sow|nda|vendor|lease|other) with
 *       user confirmation in the UI.
 * - [ ] Persist clauses + raw_model_output + model_version.
 */

import type { ClauseType, SourceSpan } from "../db/schema";

export interface ExtractedClause {
  clauseType: ClauseType;
  heading?: string;
  sourceSpans: SourceSpan[];
  extractedFields: Record<string, unknown>;
}

export function extractClauses(_contractId: string): Promise<ExtractedClause[]> {
  throw new Error("Not implemented");
}
