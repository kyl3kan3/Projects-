/**
 * src/lib/suggestions.ts
 *
 * Repricing suggestions -- advice, never action (ARCHITECTURE.md flow 4).
 * THERE IS NO STORE WRITE PATH IN THIS PRODUCT. Suggestions are rows a
 * human reads; accepting one only marks it handled.
 *
 * TODO:
 * - [ ] computeSuggestion(product, ladder, rule): suggested_price_cents +
 *       a verbatim reasoning string ("Rival lowest is $79.99 (TrailShop).
 *       Matching keeps 22% margin over your $62.40 floor.") + the basis
 *       (rival prices used). Pure.
 * - [ ] Rules: match_lowest (never below cost floor -- floor wins and the
 *       reasoning says so), median_band (stay within N% of in-stock
 *       median), floor_guard (alert-shaped: your price is below floor).
 * - [ ] lifecycle helpers: openSuggestion (supersede older open ones ->
 *       stale), accept (status + resolved_at + audit log), dismiss.
 * - [ ] No suggestion without reasons: reasoning is required, rendered
 *       verbatim, and generated from the same basis the math used.
 */

import type { PositionLadder } from "./position";

export type SuggestionRule = "match_lowest" | "median_band" | "floor_guard";

export interface SuggestionDraft {
  rule: SuggestionRule;
  suggestedPriceCents: number;
  reasoning: string;
  basis: {
    rivals: Array<{ label: string; priceCents: number }>;
    medianCents: number | null;
    lowestCents: number | null;
  };
}

/** Derive a suggestion (or null when nothing to say). Pure -- no I/O. */
export function computeSuggestion(
  _product: {
    yourPriceCents: number;
    costFloorCents: number | null;
  },
  _ladder: PositionLadder,
  _rule: SuggestionRule,
): SuggestionDraft | null {
  throw new Error("Not implemented");
}
