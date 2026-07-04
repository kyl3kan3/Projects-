/**
 * src/lib/extraction.ts
 *
 * AI extraction of receipt/invoice fields via the Anthropic API. This module
 * owns the prompt, the structured-output schema, confidence handling, and
 * model escalation. Called only from the worker (never inline in a request).
 *
 * TODO:
 * - [ ] Anthropic client from ANTHROPIC_API_KEY.
 * - [ ] extractDocument(imageOrPdf): call EXTRACTION_MODEL with the document
 *       as vision/PDF input and a structured-output JSON schema:
 *       { vendor, docType, docDate, totalCents, taxCents, currency,
 *         lineSummary, suggestedCategory, confidence: per-field 0..1 }.
 * - [ ] Confidence policy: fields >= CONFIDENCE_AUTO (default 0.92) are
 *       auto-applied; below CONFIDENCE_FLOOR (default 0.5) the document is
 *       marked failed/retake; in between -> review_items. Thresholds are
 *       constants here so tuning is one edit.
 * - [ ] escalate(document): re-run on EXTRACTION_ESCALATION_MODEL when
 *       overall confidence is low but above the floor; keep both
 *       extraction rows for audit.
 * - [ ] Pre-pass classifier (post-MVP hook): cheap "is this a financial
 *       document at all" check to reject newsletters before paid extraction.
 * - [ ] Track duration_ms and cost_microcents per run for the margin
 *       dashboard.
 * - [ ] Never throw raw model text into the DB unvalidated -- zod-parse the
 *       structured output; a parse failure is a retryable job error.
 */

export interface ExtractionResult {
  vendor: string;
  docType: "receipt" | "invoice" | "statement" | "other";
  docDate: string;
  totalCents: number;
  taxCents: number | null;
  currency: string;
  lineSummary: string;
  suggestedCategory: string;
  confidence: Record<string, number>;
}

export const CONFIDENCE_AUTO = 0.92;
export const CONFIDENCE_FLOOR = 0.5;

export function extractDocument(): Promise<ExtractionResult> {
  throw new Error("Not implemented");
}
