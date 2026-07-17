/**
 * src/lib/extract.ts
 *
 * Price/stock extraction from fetched HTML (ARCHITECTURE.md flows 1-2).
 * Structured data first -- JSON-LD survives redesigns -- then OpenGraph/
 * microdata, then the domain's selector pack. Pure functions: no I/O.
 *
 * TODO:
 * - [ ] extractFromJsonLd(html): schema.org Product/Offer -> price,
 *       currency, availability. Handle @graph nesting and price-as-string.
 * - [ ] extractFromMeta(html): og:price:amount, itemprop=price fallbacks.
 * - [ ] extractFromSelectors(html, selectorPack): cheerio over the
 *       domain's maintained CSS fallbacks; parse localized price strings
 *       ("1.299,00 €" vs "$1,299.00").
 * - [ ] extract(html, domainPack): the cascade; returns the method used
 *       and the raw matched string for the provenance line.
 * - [ ] sanityCheck(reading, history): quarantine order-of-magnitude
 *       jumps and currency mismatches -- attention state, never an alert.
 */

export type ExtractionMethod = "structured" | "selector" | "manual";

export interface Extraction {
  priceCents: number | null;
  currency: string;
  inStock: boolean | null;
  method: ExtractionMethod;
  rawPriceString: string | null;
}

export interface SelectorPack {
  priceSelectors: string[];
  stockSelectors: string[];
}

/** Run the extraction cascade over fetched HTML. Pure. */
export function extract(
  _html: string,
  _domainPack: SelectorPack,
): Extraction | null {
  throw new Error("Not implemented");
}

/** Quarantine implausible readings (100x jumps, currency flips). Pure. */
export function sanityCheck(
  _reading: Extraction,
  _lastGood: { priceCents: number; currency: string } | null,
): { ok: boolean; reason?: string } {
  throw new Error("Not implemented");
}
