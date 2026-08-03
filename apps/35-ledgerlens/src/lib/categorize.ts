/**
 * Vendor normalisation, the Schedule-C category set, and the learned-rules layer
 * that makes the product quieter every month.
 *
 * The precedence is the whole feature: **a learned vendor rule beats the model.**
 * Once an operator has said "this Shell station is Fuel, not Meals", that answer is
 * applied silently and forever, and the document never enters the review queue
 * again. A model suggestion is only consulted when there is no rule, and only when
 * it clears the confidence gate.
 *
 * Nothing here is tax advice: the categories are named the way Schedule C names
 * them, the mapping is printed next to every total, and the disclaimer lives in the
 * UI copy where a human can read it.
 */

/** One entry of the global seed set. */
export interface CategorySeed {
  slug: string;
  name: string;
  scheduleCLine: string;
  sort: number;
  /** Substrings that, found in a normalized vendor name, suggest this category. */
  vendorHints: string[];
}

/**
 * The seed set, aligned to IRS Schedule C (Form 1040) Part II line numbers. Fuel is
 * a separate category from "Car & truck" even though both land on line 9, because
 * an operator who buys diesel weekly wants to see the diesel.
 */
export const CATEGORY_SEEDS: CategorySeed[] = [
  { slug: "advertising", name: "Advertising", scheduleCLine: "8", sort: 10, vendorHints: ["google ads", "meta platforms", "yelp", "vistaprint", "angi"] },
  { slug: "car-truck", name: "Car & truck", scheduleCLine: "9", sort: 20, vendorHints: ["jiffy lube", "discount tire", "les schwab", "autozone", "napa auto", "oreilly auto", "midas"] },
  { slug: "fuel", name: "Fuel", scheduleCLine: "9", sort: 30, vendorHints: ["shell", "chevron", "exxon", "mobil", "bp", "circle k", "loves travel", "pilot travel", "sinclair", "conoco", "sunoco", "speedway", "76 station"] },
  { slug: "commissions-fees", name: "Commissions & fees", scheduleCLine: "10", sort: 40, vendorHints: ["stripe", "square", "paypal", "thumbtack", "houzz"] },
  { slug: "contract-labor", name: "Contract labor", scheduleCLine: "11", sort: 50, vendorHints: ["labor ready", "upwork", "fiverr", "instawork"] },
  { slug: "depreciation", name: "Depreciation", scheduleCLine: "13", sort: 60, vendorHints: [] },
  { slug: "insurance", name: "Insurance", scheduleCLine: "15", sort: 70, vendorHints: ["state farm", "progressive", "geico", "hiscox", "next insurance", "the hartford", "erie insurance", "nationwide"] },
  { slug: "interest", name: "Interest", scheduleCLine: "16b", sort: 80, vendorHints: [] },
  { slug: "legal-professional", name: "Legal & professional", scheduleCLine: "17", sort: 90, vendorHints: ["legalzoom", "h&r block", "cpa", "bookkeeping", "attorney", "law office"] },
  { slug: "office", name: "Office expense", scheduleCLine: "18", sort: 100, vendorHints: ["staples", "office depot", "usps", "ups store", "fedex office"] },
  { slug: "rent-equipment", name: "Rent — vehicles & equipment", scheduleCLine: "20a", sort: 110, vendorHints: ["united rentals", "sunbelt rentals", "home depot rental", "herc rentals", "u-haul"] },
  { slug: "rent-property", name: "Rent — business property", scheduleCLine: "20b", sort: 120, vendorHints: ["storage", "extra space", "public storage", "wework"] },
  { slug: "repairs", name: "Repairs & maintenance", scheduleCLine: "21", sort: 130, vendorHints: ["small engine repair", "mower service", "welding"] },
  { slug: "supplies", name: "Supplies", scheduleCLine: "22", sort: 140, vendorHints: ["home depot", "lowes", "ace hardware", "menards", "harbor freight", "grainger", "fastenal", "ferguson", "sherwin williams", "sherwin-williams", "tractor supply", "costco", "sams club", "amazon"] },
  { slug: "taxes-licenses", name: "Taxes & licenses", scheduleCLine: "23", sort: 150, vendorHints: ["dmv", "secretary of state", "city of", "county of", "licensing"] },
  { slug: "travel", name: "Travel", scheduleCLine: "24a", sort: 160, vendorHints: ["marriott", "hampton inn", "holiday inn", "delta air", "southwest air", "united airlines", "hertz", "enterprise rent"] },
  { slug: "meals", name: "Meals", scheduleCLine: "24b", sort: 170, vendorHints: ["mcdonalds", "chipotle", "subway", "starbucks", "panera", "dunkin", "taco bell", "jimmy johns", "diner", "cafe", "pizzeria"] },
  { slug: "utilities", name: "Utilities", scheduleCLine: "25", sort: 180, vendorHints: ["verizon", "at&t", "t-mobile", "comcast", "xcel energy", "dominion energy", "waste management", "republic services", "city utilities", "spectrum"] },
  { slug: "wages", name: "Wages", scheduleCLine: "26", sort: 190, vendorHints: ["gusto", "adp", "paychex"] },
  { slug: "software", name: "Software & subscriptions", scheduleCLine: "27a", sort: 200, vendorHints: ["quickbooks", "intuit", "adobe", "microsoft", "google workspace", "dropbox", "zoom", "jobber", "servicetitan", "housecall pro"] },
  { slug: "other", name: "Other expenses", scheduleCLine: "27a", sort: 210, vendorHints: [] },
];

export const CATEGORY_SLUGS = new Set(CATEGORY_SEEDS.map((c) => c.slug));

export function categorySeed(slug: string): CategorySeed | null {
  return CATEGORY_SEEDS.find((c) => c.slug === slug) ?? null;
}

/**
 * Collapse a printed vendor name to a stable key.
 *
 * Receipts print the same merchant a dozen ways — `HOME DEPOT #1234`,
 * `THE HOME DEPOT 1234 DENVER CO`, `Home Depot U.S.A., Inc.` — and a rule keyed on
 * the printed string learns nothing. Store numbers, register numbers, trailing
 * city/state, legal suffixes and punctuation all come off; what is left is what an
 * operator would call the place.
 */
export function normalizeVendor(raw: string): string {
  let s = (raw ?? "").toLowerCase();
  s = s.replace(/&amp;/g, "&");
  // Store / register / terminal numbers.
  s = s.replace(/#\s*\d+/g, " ");
  s = s.replace(/\b(?:store|str|reg|register|term|terminal|unit|no\.?)\s*\d+\b/g, " ");
  // Legal suffixes.
  s = s.replace(
    /\b(?:inc|llc|l\.l\.c|ltd|corp|corporation|co|company|incorporated|plc|pllc|lp|llp|usa|u\.s\.a)\b\.?/g,
    " ",
  );
  s = s.replace(/^the\s+/, "");
  // Punctuation to spaces, then collapse. Keep & and - inside words (sherwin-williams).
  s = s.replace(/[^a-z0-9&\- ]+/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  // Bare trailing digits left over from "home depot 1234".
  s = s.replace(/\s+\d{2,}$/, "");
  // A trailing US state abbreviation is location, not identity.
  s = s.replace(
    /\s+(?:al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy)$/,
    "",
  );
  return s.trim();
}

/** Title-case a normalized name for display when the raw name is unusable. */
export function displayNameFor(raw: string, normalized: string): string {
  const cleaned = (raw ?? "").trim().replace(/\s+/g, " ");
  if (cleaned && cleaned.length <= 48 && !/^[\d\W]+$/.test(cleaned)) return cleaned;
  return normalized.replace(/\b[a-z]/g, (c) => c.toUpperCase()) || "Unknown vendor";
}

/**
 * A category guess from the vendor name alone. Used by the deterministic extractor
 * and as a floor under a model that returns a slug we do not recognise. Deliberately
 * returns *low* confidence: a hint is not a reading.
 */
export function categoryHintFor(normalizedVendor: string): string | null {
  if (!normalizedVendor) return null;
  let best: { slug: string; length: number } | null = null;
  for (const seed of CATEGORY_SEEDS) {
    for (const hint of seed.vendorHints) {
      if (!normalizedVendor.includes(hint)) continue;
      if (!best || hint.length > best.length) best = { slug: seed.slug, length: hint.length };
    }
  }
  return best?.slug ?? null;
}

export type CategoryDecision =
  | { source: "rule"; slug: string }
  | { source: "model"; slug: string }
  | { source: "hint"; slug: string }
  | { source: "review"; slug: string | null };

export interface ResolveCategoryInput {
  /** The learned rule for this vendor, if any. */
  ruleSlug: string | null;
  modelSlug: string | null;
  /** 0–1, as reported by the extractor. */
  modelConfidence: number;
  /** The vendor-name hint, if any. */
  hintSlug: string | null;
  /** Confidence at or above which a model suggestion is applied without review. */
  autoThreshold: number;
}

/**
 * Precedence: learned rule → model above the gate → review.
 *
 * A hint never auto-applies. It rides along as the *suggested* value on the review
 * item, so the operator's one tap is "yes, Supplies" rather than a search through
 * twenty categories — but the tap still happens, because guessing silently is the
 * failure this product exists to avoid.
 */
export function resolveCategory(input: ResolveCategoryInput): CategoryDecision {
  if (input.ruleSlug && CATEGORY_SLUGS.has(input.ruleSlug)) {
    return { source: "rule", slug: input.ruleSlug };
  }
  const model = input.modelSlug && CATEGORY_SLUGS.has(input.modelSlug) ? input.modelSlug : null;
  if (model && input.modelConfidence >= input.autoThreshold) {
    return { source: "model", slug: model };
  }
  const suggested = model ?? (input.hintSlug && CATEGORY_SLUGS.has(input.hintSlug) ? input.hintSlug : null);
  return { source: "review", slug: suggested };
}
