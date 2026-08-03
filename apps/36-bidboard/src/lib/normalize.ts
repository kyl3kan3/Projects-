/**
 * Line-item and scope-item normalisation. Pure functions, no database.
 *
 * v1 is deterministic on purpose (README risk 2): the portal presents the GC's
 * own bid form, so most lines arrive already mapped. This module handles the
 * remainder — the rows a sub typed themselves — and it never applies a guess
 * silently. `suggestMappings` returns suggestions with a confidence and a reason;
 * only a *remembered* mapping (one this estimator already confirmed for this sub)
 * is applied automatically, and even then it is listed in the tray so it can be
 * undone.
 */

/* ------------------------------------------------------- key normalisation --- */

/**
 * Words that carry no scope meaning. Dropped before comparison so
 * "Furnish and install panelboards" and "Panelboards" match.
 */
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "the",
  "of",
  "for",
  "to",
  "per",
  "all",
  "with",
  "incl",
  "including",
  "included",
  "furnish",
  "install",
  "installation",
  "provide",
  "supply",
  "labor",
  "labour",
  "material",
  "materials",
  "complete",
  "work",
  // "Debris removal" and "Dumpsters" are one scope item on a bid form; so are
  // "Debris haul-off" and "Debris disposal". The noun carries the meaning.
  "removal",
  "removals",
  "disposal",
  "haul",
  "hauling",
  "off",
  "allowance",
  "alt",
  "alternate",
]);

/**
 * Trade shorthand seen on real bid forms, folded to one spelling. Deliberately
 * short: every entry here is a claim that two phrasings mean the same scope, and
 * a wrong claim silently merges two different line items.
 */
const SYNONYMS: Record<string, string> = {
  temp: "temporary",
  temps: "temporary",
  elec: "electrical",
  mech: "mechanical",
  hvac: "mechanical",
  demo: "demolition",
  dumpsters: "dumpster",
  debris: "dumpster",
  gwb: "drywall",
  gypsum: "drywall",
  sheetrock: "drywall",
  panelboards: "panelboard",
  panels: "panelboard",
  fixtures: "fixture",
  poles: "pole",
  devices: "device",
  gutters: "gutter",
  bonds: "bond",
  permits: "permit",
  fees: "fee",
  cleanups: "cleanup",
  cleaning: "cleanup",
  hoists: "hoist",
  lifts: "lift",
  sf: "squarefoot",
  ls: "lumpsum",
};

function tokens(input: string): string[] {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((t) => SYNONYMS[t] ?? t)
    .filter((t) => !STOPWORDS.has(t));
}

/**
 * The comparison key for a bid-form line or a sub's typed row.
 *
 * Tokens are sorted so word order never decides a match ("power temporary" ==
 * "temporary power"), and duplicates collapse. Returns "" for input that is all
 * stopwords, which never matches anything — better than matching everything.
 */
export function normalizeDescription(input: string): string {
  return [...new Set(tokens(input))].sort().join(" ");
}

/**
 * The key an inclusion/exclusion chip is grouped by in the matrix. Same
 * normalisation as a line description: subs write "dumpsters" on one bid and
 * "debris removal" on the next, and the matrix is worthless if those land on two
 * rows.
 */
export function scopeKey(input: string): string {
  const key = normalizeDescription(input);
  return key || input.trim().toLowerCase();
}

/* ------------------------------------------------------------- similarity --- */

/** Dice coefficient over token sets: 2|A∩B| / (|A|+|B|). 0…1. */
export function tokenSimilarity(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return (2 * shared) / (ta.size + tb.size);
}

/* --------------------------------------------------------------- mapping --- */

export interface MappableLine {
  id: string;
  rawDescription: string;
}

export interface MappableFormLine {
  id: string;
  description: string;
}

/** A remembered correction: this sub's wording → the GC's form line. */
export interface RememberedAlias {
  rawKey: string;
  formKey: string;
  formLabel: string;
}

export type MatchReason = "remembered" | "exact" | "contains" | "overlap";

export interface MappingSuggestion {
  bidLineId: string;
  bidFormLineId: string;
  formLineDescription: string;
  confidence: number;
  reason: MatchReason;
  /** True only for `remembered`: safe to apply without asking. */
  autoApply: boolean;
}

/** Below this, a token-overlap match is noise and is not even suggested. */
export const OVERLAP_FLOOR = 0.5;

/**
 * Suggest a form line for each free-form row.
 *
 * Order of evidence, strongest first:
 *  1. **remembered** — this estimator already mapped this exact wording for this
 *     sub. Auto-applied; the tray still shows it, labelled, so it can be undone.
 *  2. **exact** — normalised keys are identical. Suggested, not applied: the sub
 *     typed a row instead of using the form line, and the estimator should see
 *     that they did.
 *  3. **contains** — one key's tokens are a subset of the other's.
 *  4. **overlap** — Dice ≥ OVERLAP_FLOOR.
 *
 * A form line that already carries a priced cell from this bid is still a legal
 * target: subs really do split one line into two rows, and the grid sums them.
 */
export function suggestMappings(
  lines: MappableLine[],
  formLines: MappableFormLine[],
  aliases: RememberedAlias[] = [],
): MappingSuggestion[] {
  const aliasByRaw = new Map(aliases.map((a) => [a.rawKey, a]));
  const formKeys = formLines.map((f) => ({ ...f, key: normalizeDescription(f.description) }));
  const out: MappingSuggestion[] = [];

  for (const line of lines) {
    const rawKey = normalizeDescription(line.rawDescription);
    if (!rawKey) continue;

    const alias = aliasByRaw.get(rawKey);
    if (alias) {
      const target = formKeys.find((f) => f.key === alias.formKey);
      if (target) {
        out.push({
          bidLineId: line.id,
          bidFormLineId: target.id,
          formLineDescription: target.description,
          confidence: 1,
          reason: "remembered",
          autoApply: true,
        });
        continue;
      }
    }

    const exact = formKeys.find((f) => f.key && f.key === rawKey);
    if (exact) {
      out.push({
        bidLineId: line.id,
        bidFormLineId: exact.id,
        formLineDescription: exact.description,
        confidence: 0.95,
        reason: "exact",
        autoApply: false,
      });
      continue;
    }

    const rawTokens = new Set(rawKey.split(" "));
    const contained = formKeys.find((f) => {
      if (!f.key) return false;
      const ft = new Set(f.key.split(" "));
      return isSubset(ft, rawTokens) || isSubset(rawTokens, ft);
    });
    if (contained) {
      out.push({
        bidLineId: line.id,
        bidFormLineId: contained.id,
        formLineDescription: contained.description,
        confidence: 0.8,
        reason: "contains",
        autoApply: false,
      });
      continue;
    }

    let best: { form: (typeof formKeys)[number]; score: number } | null = null;
    for (const form of formKeys) {
      const score = tokenSimilarity(line.rawDescription, form.description);
      if (score >= OVERLAP_FLOOR && (!best || score > best.score)) best = { form, score };
    }
    if (best) {
      out.push({
        bidLineId: line.id,
        bidFormLineId: best.form.id,
        formLineDescription: best.form.description,
        confidence: Math.round(best.score * 100) / 100,
        reason: "overlap",
        autoApply: false,
      });
    }
  }

  return out;
}

function isSubset(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || a.size > b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}
