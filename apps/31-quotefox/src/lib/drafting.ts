/**
 * src/lib/drafting.ts
 *
 * AI estimate drafting: transcript + photo captions + candidate price-book
 * items in, line items out. The one inviolable rule lives here: the model
 * may only reference real price_book_item_ids -- anything it can't match is
 * flagged needs_pricing with the transcript excerpt, never priced by guess.
 *
 * TODO:
 * - [ ] draftEstimate(walkthroughId): orchestrate captionPhotos ->
 *       findCandidates -> GPT-4o structured-output call -> line-item rows.
 * - [ ] Structured output schema (zod -> JSON schema): array of
 *       { price_book_item_id | null, quantity, transcript_excerpt, note }.
 * - [ ] Validate every returned id against the candidate set; reject and
 *       re-flag any id not in it (hallucination guard).
 * - [ ] captionPhotos(mediaIds): GPT-4o vision captions used as drafting
 *       context ("rusted condenser pad, approx 36x36").
 * - [ ] Totals: quantity x unit_price with org markup/tax via price-book
 *       helpers; server-side only.
 * - [ ] Prompt versioning: record model + prompt_version on the estimate
 *       and in audit_log for every draft.
 * - [ ] Per-org rate limit + plan quota check before any OpenAI call.
 */

import type { DraftedLineItem } from "../db/schema";

export interface DraftResult {
  estimateId: string;
  lineItems: DraftedLineItem[];
  needsPricingCount: number;
  draftDurationMs: number;
}

export function draftEstimate(_walkthroughId: string): Promise<DraftResult> {
  throw new Error("Not implemented");
}

export function captionPhotos(_mediaIds: string[]): Promise<string[]> {
  throw new Error("Not implemented");
}
