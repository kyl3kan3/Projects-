/**
 * src/lib/price-book.ts
 *
 * Price book domain logic: CRUD, CSV import, per-trade starter templates,
 * and the embedding-based retrieval that feeds candidate items to the
 * drafting model. The price book is the moat -- import must be painless.
 *
 * TODO:
 * - [ ] CRUD with plan-gated size limits (300 / 2,000 / unlimited items).
 * - [ ] importCsv(orgId, file): column mapping UI contract, row validation
 *       (zod), dedupe by name+category, report of skipped rows.
 * - [ ] Starter templates per trade (hvac/roofing/electrical/plumbing)
 *       seeded on onboarding, marked source = "template".
 * - [ ] generateEmbedding(item): name + description + category via OpenAI
 *       embeddings; enqueue on create/update, batch on import.
 * - [ ] findCandidates(orgId, transcriptSegments): pgvector similarity
 *       search + category filter, top ~50 items for the drafting prompt.
 * - [ ] applyMarkup(item, orgSettings): unit_cost -> unit_price using
 *       default_markup_pct with per-item override.
 */

import type { PriceBookItemKind, Trade } from "../db/schema";

export interface PriceBookCandidate {
  itemId: string;
  name: string;
  kind: PriceBookItemKind;
  unitPriceCents: number;
  similarity: number;
}

export function importCsv(_orgId: string, _csv: string): Promise<never> {
  throw new Error("Not implemented");
}

export function seedStarterTemplate(_orgId: string, _trade: Trade): Promise<void> {
  throw new Error("Not implemented");
}

export function findCandidates(
  _orgId: string,
  _transcriptSegments: string[],
): Promise<PriceBookCandidate[]> {
  throw new Error("Not implemented");
}
