/**
 * Turning narration into candidate line items.
 *
 * This module is the part of QuoteFox that has to be right, and it is pure: text
 * and price-book rows in, drafted rows out, no database, no network. It does two
 * jobs:
 *
 *  1. **Retrieval.** Which of the org's price-book items could this sentence be
 *     about? ARCHITECTURE.md calls for pgvector embedding similarity. There is no
 *     embeddings credential in this environment and no pgvector in the local
 *     Postgres, so retrieval here is lexical: token overlap weighted by inverse
 *     document frequency across the org's own book, with plural folding, spoken
 *     numbers converted to digits, and a small additive synonym table for the
 *     things contractors say that suppliers do not print ("hot water heater",
 *     "outdoor unit", "breaker panel"). It is deterministic and testable, and it
 *     is good enough to hand a model a candidate set — which is all retrieval has
 *     to do. Swapping in embeddings later changes this one function.
 *
 *  2. **Drafting without a model.** The same scoring produces a complete draft on
 *     its own, which is what runs when no OPENAI_API_KEY is present. It is
 *     labelled as such everywhere it surfaces.
 *
 * The inviolable rule, in both paths: a drafted row either references a real
 * price-book item id, or it is flagged `needsPricing` and carries no price. There
 * is no third case. A guessed number on a contractor's letterhead is the one
 * failure this product cannot come back from.
 */

import type { DraftedLineItem, PriceBookItemKind, Unit } from "@/db/schema";
import { applyMarkup } from "@/lib/money";

/* ---------------------------------------------------------- tokenizing --- */

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "for", "with", "to", "in", "on", "at", "is", "it", "its",
  "we", "i", "im", "ill", "were", "was", "be", "been", "that", "this", "there", "theres", "here",
  "so", "but", "also", "just", "about", "got", "get", "going", "gonna", "want", "need", "needs",
  "new", "old", "one", "some", "all", "out", "up", "off", "from", "by", "as", "if", "then",
  "okay", "alright", "now", "like", "call", "since", "while", "over", "under", "into", "per",
  "my", "me", "you", "your", "they", "them", "their", "he", "she", "his", "her", "do", "does",
  "did", "have", "has", "had", "will", "would", "can", "cant", "not", "no", "yes", "very",
]);

/** Words that mark the number before them as a spec, not a quantity. */
const SPEC_UNITS = new Set([
  "amp", "amps", "volt", "volts", "ton", "tons", "inch", "inches", "gauge", "psi", "seer",
  "seer2", "btu", "afue", "year", "yr", "port", "gal", "gallon", "gallons", "degree", "degrees",
  "story", "stories", "layer", "layers", "yard",
]);

/** Words that mark the number before them as a measured quantity. */
const MEASURE_WORDS: Record<string, "feet" | "sqft" | "hours" | "days" | "count"> = {
  foot: "feet",
  feet: "feet",
  ft: "feet",
  lf: "feet",
  hour: "hours",
  hours: "hours",
  hr: "hours",
  hrs: "hours",
  day: "days",
  days: "days",
  sqft: "sqft",
  square: "sqft",
  each: "count",
  ea: "count",
  piece: "count",
  pieces: "count",
};

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/** Contractor speech → supply-house wording. Additive: nothing is removed. */
const SYNONYMS: Array<[RegExp, string]> = [
  [/\bhot water heater\b/g, "water heater"],
  [/\b(a\/c|ac unit|air conditioner|outdoor unit|outside unit|compressor unit)\b/g, "condenser"],
  [/\b(breaker panel|electrical panel|main panel|service panel)\b/g, "load center panel"],
  [/\bstab[- ]?lok\b/g, "load center panel"],
  [/\bfederal pacific\b/g, "load center panel"],
  [/\bservice upgrade\b/g, "panel upgrade service"],
  [/\bromex\b/g, "nm-b"],
  [/\bstat\b/g, "thermostat"],
  [/\bfurnace\b/g, "gas furnace"],
  [/\bmini split\b/g, "mini-split"],
  [/\bcoil\b/g, "evaporator coil"],
  [/\bpad\b/g, "condenser pad"],
  [/\blineset\b/g, "line set"],
  [/\bshingle\b/g, "shingles"],
  [/\bosb\b/g, "decking sheathing"],
  [/\bplywood\b/g, "decking sheathing"],
  [/\bre-?flash\b/g, "re-flash flashing"],
  [/\bjetting\b/g, "hydro-jetting"],
  [/\bprv\b/g, "pressure-reducing valve"],
  [/\bcamera\b/g, "drain camera inspection"],
  [/\bpermit\b/g, "permit filing"],
  [/\bdumpster\b/g, "dumpster"],
  [/\blead tech\b/g, "lead technician labor"],
  [/\bjourneyman\b/g, "journeyman labor"],
  [/\bapprentice\b/g, "apprentice labor"],
  [/\bhelper\b/g, "helper labor"],
];

/** Fold a trailing plural. Crude on purpose: "boots" → "boot", "feet" stays. */
function singular(token: string): string {
  if (token.length <= 3) return token;
  if (token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.endsWith("ses") || token.endsWith("xes") || token.endsWith("ches")) {
    return token.slice(0, -2);
  }
  if (token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

/**
 * Tokenize for matching: lowercase, split on anything that is not a letter,
 * digit, decimal point or slash, fold plurals, and turn "20a" into "20 amp" so a
 * spoken "twenty-amp" and a printed "20A" meet in the middle.
 */
export function tokenize(text: string): string[] {
  let expanded = text.toLowerCase();
  for (const [pattern, addition] of SYNONYMS) {
    if (pattern.test(expanded)) expanded = `${expanded} ${addition}`;
    pattern.lastIndex = 0;
  }
  const raw = expanded
    .replace(/[^a-z0-9./-]+/g, " ")
    .replace(/-/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const out: string[] = [];
  for (const candidate of raw) {
    // Keep the decimal point in "15.2" and the slash in "3/4", but drop the
    // sentence's own punctuation — "feet." must still read as feet.
    const token = candidate.replace(/^[./]+/, "").replace(/[./]+$/, "");
    if (!token) continue;
    const ampSpec = /^(\d+)a$/.exec(token);
    if (ampSpec) {
      out.push(ampSpec[1], "amp");
      continue;
    }
    out.push(singular(token));
  }
  return numbersToDigits(out);
}

/**
 * Rewrite spoken numbers as digit tokens in place: ["twenty","two","hundred"]
 * becomes ["2200"]. Everything downstream then only has to read digits.
 */
function numbersToDigits(tokens: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const parsed = parseNumberAt(tokens, i);
    if (parsed && parsed.spelled) {
      out.push(String(parsed.value));
      i = parsed.end;
      continue;
    }
    out.push(tokens[i]);
    i += 1;
  }
  return out;
}

export interface ParsedNumber {
  value: number;
  /** Exclusive end index. */
  end: number;
  spelled: boolean;
}

/**
 * Parse a number starting at `i`: digits ("2200", "2.5") or words
 * ("twenty-two hundred", "a hundred and forty", "fifty"). Returns null when the
 * token is not a number.
 */
export function parseNumberAt(tokens: string[], i: number): ParsedNumber | null {
  const first = tokens[i];
  if (first === undefined) return null;
  if (/^\d+(\.\d+)?$/.test(first)) {
    return { value: Number(first), end: i + 1, spelled: false };
  }

  let total = 0;
  let current = 0;
  let consumed = 0;
  let index = i;
  let sawWord = false;

  while (index < tokens.length) {
    const token = tokens[index];
    if (token === "and" && sawWord) {
      // "a hundred and forty" — only bridge when a number follows.
      const next = tokens[index + 1];
      if (next && (NUMBER_WORDS[next] !== undefined || next === "hundred" || next === "a")) {
        index += 1;
        continue;
      }
      break;
    }
    if (token === "a" && (tokens[index + 1] === "hundred" || tokens[index + 1] === "thousand")) {
      current = 1;
      sawWord = true;
      index += 1;
      consumed += 1;
      continue;
    }
    if (NUMBER_WORDS[token] !== undefined) {
      const value = NUMBER_WORDS[token];
      // "twenty two" → 22 and "a hundred and forty" → 140, but "six six" is
      // two separate numbers, not 66.
      if (current === 0) current = value;
      else if (current % 100 === 0 && current > 0 && value < 100) current += value;
      else if (current % 10 === 0 && current < 100 && value < 10) current += value;
      else break;
      sawWord = true;
      index += 1;
      consumed += 1;
      continue;
    }
    if (token === "hundred" && sawWord) {
      current = (current || 1) * 100;
      index += 1;
      consumed += 1;
      continue;
    }
    if (token === "thousand" && sawWord) {
      total += (current || 1) * 1000;
      current = 0;
      index += 1;
      consumed += 1;
      continue;
    }
    break;
  }

  if (!consumed) return null;
  return { value: total + current, end: index, spelled: true };
}

/* ---------------------------------------------------------- quantities --- */

export type QuantityKind = "count" | "feet" | "sqft" | "hours" | "days";

export interface QuantityMention {
  value: number;
  kind: QuantityKind;
  /** Token index the number started at. */
  position: number;
}

/**
 * Every quantity in a sentence, with what it measures.
 *
 * The rule that matters: a number followed by a spec word is a spec, not a
 * quantity. "Twelve twenty-amp AFCI breakers" is twelve breakers, and reading it
 * as twenty is how a draft quietly triples a bill.
 */
export function extractQuantities(tokens: string[]): QuantityMention[] {
  const out: QuantityMention[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const parsed = parseNumberAt(tokens, i);
    if (!parsed) continue;
    const next = tokens[parsed.end];
    if (next && SPEC_UNITS.has(next)) {
      i = parsed.end;
      continue;
    }
    let kind: QuantityKind = "count";
    for (let look = parsed.end; look < Math.min(parsed.end + 3, tokens.length); look++) {
      const word = tokens[look];
      const measured = MEASURE_WORDS[word];
      if (measured) {
        // "square feet" and "linear feet" both land on the following word.
        if (word === "square") kind = "sqft";
        else if (word === "feet" || word === "foot" || word === "ft" || word === "lf") {
          kind = tokens[look - 1] === "square" ? "sqft" : "feet";
        } else kind = measured;
        break;
      }
      if (word === "linear") continue;
      if (SPEC_UNITS.has(word)) break;
    }
    out.push({ value: parsed.value, kind, position: i });
    i = parsed.end - 1;
  }
  return out;
}

const UNIT_TO_QUANTITY: Record<Unit, QuantityKind> = {
  each: "count",
  hour: "hours",
  sqft: "sqft",
  lf: "feet",
  day: "days",
};

/* ------------------------------------------------------------ segments --- */

export interface Segment {
  index: number;
  startSeconds: number;
  text: string;
}

/**
 * Split a transcript into sentence-ish segments and give each an approximate
 * start time, so every drafted row can cite "from 02:14 in the walkthrough".
 * When Whisper returns real segment timings we use those instead; this is the
 * fallback for typed notes and for the demo narration.
 */
export function segmentTranscript(text: string, totalSeconds = 0): Segment[] {
  const pieces = String(text ?? "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 2);
  const totalChars = pieces.reduce((sum, piece) => sum + piece.length, 0) || 1;
  let consumed = 0;
  return pieces.map((piece, index) => {
    const startSeconds = totalSeconds > 0 ? Math.round((consumed / totalChars) * totalSeconds) : 0;
    consumed += piece.length;
    return { index, startSeconds, text: piece };
  });
}

/* ------------------------------------------------------------ retrieval --- */

export interface MatchableItem {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  kind: PriceBookItemKind;
  unit: Unit;
  unitCostCents: number;
  markupPct?: number | null;
}

export interface ScoredCandidate {
  item: MatchableItem;
  score: number;
  /** Token index in the segment where the best evidence sat. */
  position: number;
  matchedTokens: string[];
  /** Every token in the item's own name — used to bind a count to the thing counted. */
  itemTokens: Set<string>;
}

interface ItemIndex {
  item: MatchableItem;
  tokens: string[];
  weights: Map<string, number>;
  /** Denominator: identity words in full, spec words discounted. */
  requiredWeight: number;
  /** Tokens specific enough to anchor a match (rare within this book). */
  anchors: Set<string>;
}

/**
 * How much of the spec half of a name a sentence is expected to contain.
 *
 * A price-book row is written like "Thermostat, programmable Wi-Fi" — an identity
 * before the comma and a spec after it. A contractor says "and a new thermostat".
 * Requiring the spec words to appear would score that at 0.25 and drop the row, so
 * the spec counts fully when it *is* said (it is strong evidence) and only
 * fractionally when it is not.
 */
const SPEC_DISCOUNT = 0.35;

/**
 * Words that are too generic to anchor a match on their own. "Ridge vent
 * replacement, forty-two feet" must not pull in "Decking replacement labor"
 * because both rows happen to contain the word "replacement".
 */
const WEAK_ANCHORS = new Set([
  "labor", "replacement", "install", "installation", "service", "kit", "standard", "allowance",
  "misc", "general", "material", "complete", "unit", "system",
]);

/** Build the per-book statistics matching needs. O(items), cached by callers. */
export function buildIndex(items: readonly MatchableItem[]): ItemIndex[] {
  const docFreq = new Map<string, number>();
  const tokenized = items.map((item) => {
    // The category is deliberately not scored: "Flat rate" and "Materials"
    // appear on a third of the book each, so they only dilute the weights.
    const [identity, ...rest] = item.name.split(",");
    const keep = (token: string) => !STOPWORDS.has(token) && token.length > 1;
    const coreTokens = new Set(tokenize(identity).filter(keep));
    const tokens = Array.from(
      new Set(tokenize(`${item.name} ${item.description ?? ""}`).filter(keep)),
    );
    void rest;
    for (const token of tokens) docFreq.set(token, (docFreq.get(token) ?? 0) + 1);
    return { item, tokens, coreTokens };
  });

  const total = Math.max(1, items.length);
  // A token is an anchor when it names few enough items to be diagnostic.
  const anchorCeiling = Math.max(1, Math.ceil(total * 0.2));

  return tokenized.map(({ item, tokens, coreTokens }) => {
    const weights = new Map<string, number>();
    const anchors = new Set<string>();
    let requiredWeight = 0;
    for (const token of tokens) {
      const df = docFreq.get(token) ?? 1;
      const weight = Math.log(1 + total / df);
      weights.set(token, weight);
      requiredWeight += coreTokens.has(token) ? weight : weight * SPEC_DISCOUNT;
      if (df <= anchorCeiling && !WEAK_ANCHORS.has(token)) anchors.add(token);
    }
    return { item, tokens, weights, requiredWeight: requiredWeight || 1, anchors };
  });
}

const SCORE_FLOOR = 0.34;

/**
 * The candidate items for one sentence, best first. A match needs both a decent
 * share of the item's distinctive words and at least one anchor word, so
 * "install labor" alone cannot pull in every labor line in the book.
 */
export function candidatesForSegment(
  segment: Segment,
  index: readonly ItemIndex[],
  limit = 4,
): ScoredCandidate[] {
  const tokens = tokenize(segment.text);
  const positions = new Map<string, number>();
  tokens.forEach((token, position) => {
    if (!positions.has(token)) positions.set(token, position);
  });

  const scored: ScoredCandidate[] = [];
  for (const entry of index) {
    let matchedWeight = 0;
    let anchored = false;
    let bestPosition = 0;
    let bestAnchorWeight = 0;
    const matchedTokens: string[] = [];
    for (const token of entry.tokens) {
      const position = positions.get(token);
      if (position === undefined) continue;
      const weight = entry.weights.get(token) ?? 0;
      matchedWeight += weight;
      matchedTokens.push(token);
      if (entry.anchors.has(token)) {
        anchored = true;
        if (weight > bestAnchorWeight) {
          bestAnchorWeight = weight;
          bestPosition = position;
        }
      }
    }
    if (!anchored) continue;
    const score = matchedWeight / entry.requiredWeight;
    if (score < SCORE_FLOOR) continue;
    scored.push({
      item: entry.item,
      score,
      position: bestPosition,
      matchedTokens,
      itemTokens: new Set(entry.tokens),
    });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * The candidate set handed to the drafting model: the union of every segment's
 * candidates, capped. ARCHITECTURE.md asks for ~50 items.
 */
export function findCandidates(
  items: readonly MatchableItem[],
  segments: readonly Segment[],
  limit = 50,
): ScoredCandidate[] {
  const index = buildIndex(items);
  const best = new Map<string, ScoredCandidate>();
  for (const segment of segments) {
    for (const candidate of candidatesForSegment(segment, index, 6)) {
      const existing = best.get(candidate.item.id);
      if (!existing || candidate.score > existing.score) best.set(candidate.item.id, candidate);
    }
  }
  return Array.from(best.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/* -------------------------------------------------------- needs pricing --- */

/**
 * Phrases a contractor uses when they are telling themselves "not today".
 * These produce a flagged row instead of a priced one — the whole point being
 * that the draft says "you mentioned this and I could not price it", out loud,
 * rather than inventing a number for a crane.
 */
const NEEDS_PRICING_CUES = [
  /quote (?:that|it|this) separately/i,
  /price(?:d|s)? (?:it |that |this )?(?:out )?separately/i,
  /separate (?:number|quote|price|line)/i,
  /can'?t (?:price|quote|give you)/i,
  /cannot (?:price|quote)/i,
  /not (?:my|our) scope/i,
  /(?:get|need) (?:a |an )?(?:quote|number|bid) (?:back |from|on)/i,
  /(?:once|until) I hear back/i,
  /t\.?b\.?d\.?/i,
];

const LEADING_FILLER =
  /^(?:okay|alright|also|and|but|so|plus|then|there'?s|there is|the|a|an|one more thing|another thing|oh|now|if|when|that'?s)\b[\s,—-]*/i;

/** "I'll also need a…", "we want a…" — the speaker, not the work. */
const LEADING_INTENT =
  /^(?:i|we|they|somebody|someone|he|she)\s*(?:'|’)?(?:ll|ve|d)?\s*(?:also\s+)?(?:will\s+)?(?:need|needs|want|wants|have to|has to|gotta|got to|am going to|is going to|are going to)\s+(?:a|an|the|some)?\s*/i;

/** The clause that names the thing, cleaned up enough to read in a row. */
function nameFromClause(clause: string): string {
  let text = clause.trim();
  for (let i = 0; i < 4; i++) {
    const stripped = text.replace(LEADING_INTENT, "").replace(LEADING_FILLER, "").trim();
    if (stripped === text) break;
    text = stripped;
  }
  // Cut at anything that reads as a follow-up thought rather than the noun.
  text = text
    .split(
      /\b(?:so|because|and I|and we|that somebody|that someone|that I|that we|that'?s|which|until|once)\b/i,
    )[0]
    .replace(/[,.;:—-]+$/, "")
    .trim();
  const words = text.split(/\s+/).filter(Boolean).slice(0, 6);
  while (words.length && STOPWORDS.has(words[words.length - 1].toLowerCase().replace(/\W/g, ""))) {
    words.pop();
  }
  const name = words.join(" ").replace(/[,.;:—-]+$/, "");
  if (!name) return "";
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function significantWordCount(text: string): number {
  return text
    .split(/\s+/)
    .filter((word) => word.replace(/\W/g, "").length > 1 && !STOPWORDS.has(word.toLowerCase()))
    .length;
}

/**
 * Does this sentence describe work the draft must refuse to price? Returns the
 * row name to flag, or null.
 *
 * The name comes from the clause that names the *work*, not the clause that says
 * "later" — every cue phrase is stripped first, and the clause nearest the cue
 * that still has something in it wins. "so quote that separately once I hear back
 * from the crane company" is not a line item; "Crane to set the rooftop unit" is.
 */
export function needsPricingFrom(segment: Segment): string | null {
  const cues = NEEDS_PRICING_CUES.filter((pattern) => pattern.test(segment.text));
  if (!cues.length) return null;

  const clauses = segment.text
    .split(/(?:,|—|--|;)\s*/)
    .map((clause) => clause.trim())
    .filter(Boolean);
  const cueIndex = clauses.findIndex((clause) => cues.some((cue) => cue.test(clause)));

  const stripped = clauses.map((clause) => {
    let text = clause;
    for (const cue of NEEDS_PRICING_CUES) text = text.replace(cue, " ");
    return text.replace(/\s+/g, " ").trim();
  });

  const order =
    cueIndex >= 0
      ? [cueIndex, ...clauses.map((_, i) => i).filter((i) => i !== cueIndex)].sort(
          (a, b) => (a === cueIndex ? -1 : b === cueIndex ? 1 : Math.abs(a - cueIndex) - Math.abs(b - cueIndex)),
        )
      : clauses.map((_, i) => i);

  for (const i of order) {
    if (significantWordCount(stripped[i]) < 2) continue;
    const name = nameFromClause(stripped[i]);
    // A name that starts with a preposition is the tail of the cue, not the
    // work: "from the crane company" is where the price comes from, not the row.
    if (/^(?:from|for|about|on|with|by|until|once|at|to)\b/i.test(name)) continue;
    if (significantWordCount(name) >= 2) return name;
  }
  return "Unpriced scope from the walkthrough";
}

/* -------------------------------------------------------------- drafting --- */

export interface DraftOptions {
  segments: readonly Segment[];
  items: readonly MatchableItem[];
  /** Org default markup, whole percent, used when an item has no override. */
  defaultMarkupPct: number;
  /** Photo captions, appended as extra evidence segments. */
  photoCaptions?: readonly string[];
  maxRows?: number;
}

export interface DraftOutcome {
  rows: DraftedLineItem[];
  needsPricingCount: number;
  /** Ids the drafter was willing to price — the model's allowed vocabulary. */
  candidateIds: string[];
}

/** Tokens that mark a following number as a model or spec: "R-22", "type L". */
const MODEL_MARKERS = new Set(["r", "type", "model", "no", "size", "seer", "seer2", "grade", "sch", "schedule", "class"]);

/**
 * Which quantity in this sentence belongs to this item?
 *
 * Measured quantities (feet, square feet, hours) are matched by unit and then by
 * proximity, which is reliable because the unit itself disambiguates.
 *
 * Bare counts are the dangerous case — a sentence is full of numbers that are not
 * quantities ("2009 unit", "R-22", "fifteen-two SEER2"). A count is only adopted
 * when it sits *in front of* the item's own words and the token right after it is
 * one of those words, i.e. the number grammatically modifies the thing being
 * counted: "three pipe boots", "twelve twenty-amp AFCI breakers". Anything else
 * leaves the quantity at 1, which the contractor can see and fix, rather than
 * silently billing for twenty-two evaporator coils.
 */
function quantityFor(
  item: MatchableItem,
  candidate: ScoredCandidate,
  tokens: readonly string[],
  quantities: readonly QuantityMention[],
): { quantityMilli: number; explicit: boolean } {
  const wanted = UNIT_TO_QUANTITY[item.unit];
  if (wanted !== "count") {
    const matching = quantities.filter((q) => q.kind === wanted);
    if (matching.length) {
      const nearest = matching.reduce((best, q) =>
        Math.abs(q.position - candidate.position) < Math.abs(best.position - candidate.position)
          ? q
          : best,
      );
      return { quantityMilli: Math.max(1, Math.round(nearest.value * 1000)), explicit: true };
    }
    return { quantityMilli: 1000, explicit: false };
  }

  const bound = quantities
    .filter((q) => q.kind === "count")
    .filter((q) => q.position < candidate.position && candidate.position - q.position <= 4)
    .filter((q) => {
      const before = tokens[q.position - 1];
      if (before && (before.length === 1 || MODEL_MARKERS.has(before))) return false;
      const after = tokens[q.position + 1];
      return Boolean(after && candidate.itemTokens.has(after));
    })
    .sort(
      (a, b) =>
        Math.abs(a.position - candidate.position) - Math.abs(b.position - candidate.position),
    )[0];

  if (bound) return { quantityMilli: Math.max(1, Math.round(bound.value * 1000)), explicit: true };
  return { quantityMilli: 1000, explicit: false };
}

/**
 * Draft rows from a transcript with no model in the loop.
 *
 * Used as the deterministic drafter when no API key is configured, and as the
 * reference the model's output is validated against.
 */
export function draftFromSegments(options: DraftOptions): DraftOutcome {
  const index = buildIndex(options.items);
  const maxRows = options.maxRows ?? 24;

  const captionSegments: Segment[] = (options.photoCaptions ?? [])
    .filter((caption) => caption && caption.trim().length > 2)
    .map((caption, i) => ({
      index: 10_000 + i,
      startSeconds: 0,
      text: `Photo ${i + 1}: ${caption}`,
    }));
  const segments = [...options.segments, ...captionSegments];

  const byItem = new Map<string, DraftedLineItem & { explicitQuantity: boolean; score: number }>();
  const flagged: DraftedLineItem[] = [];
  const candidateIds = new Set<string>();

  for (const segment of segments) {
    const tokens = tokenize(segment.text);
    const quantities = extractQuantities(tokens);
    const candidates = candidatesForSegment(segment, index, 3);

    for (const candidate of candidates) {
      candidateIds.add(candidate.item.id);
      const item = candidate.item;
      const { quantityMilli, explicit } = quantityFor(item, candidate, tokens, quantities);
      const unitPriceCents = applyMarkup(
        item.unitCostCents,
        item.markupPct ?? options.defaultMarkupPct,
      );
      const existing = byItem.get(item.id);
      if (existing) {
        /*
         * A second mention can only improve the row, and the *best* sentence
         * wins outright. This is what stops a passing reference from setting the
         * quantity: "it's got double-taps on four breakers" describes the old
         * panel and scores weakly, while "twelve twenty-amp AFCI breakers"
         * scores strongly — so the row ends up as twelve, not four.
         */
        if (candidate.score > existing.score) {
          existing.score = candidate.score;
          existing.transcriptExcerpt = segment.text;
          existing.transcriptOffsetSeconds = segment.startSeconds;
          // A spoken quantity is never thrown away by a better-worded mention:
          // "twenty-two hundred square feet" and "tear off the one layer" are the
          // same row, and the number is in the first sentence.
          if (explicit) {
            existing.quantityMilli = quantityMilli;
            existing.explicitQuantity = true;
          }
        } else if (explicit && !existing.explicitQuantity) {
          existing.quantityMilli = quantityMilli;
          existing.explicitQuantity = true;
          existing.transcriptExcerpt = segment.text;
          existing.transcriptOffsetSeconds = segment.startSeconds;
        }
        continue;
      }
      byItem.set(item.id, {
        priceBookItemId: item.id,
        name: item.name,
        description: item.description ?? null,
        quantityMilli,
        unit: item.unit,
        unitPriceCents,
        needsPricing: false,
        transcriptExcerpt: segment.text,
        transcriptOffsetSeconds: segment.startSeconds,
        explicitQuantity: explicit,
        score: candidate.score,
      });
    }

    const flag = needsPricingFrom(segment);
    if (flag) {
      flagged.push({
        priceBookItemId: null,
        name: flag,
        description: null,
        quantityMilli: 1000,
        unit: "each",
        unitPriceCents: 0,
        needsPricing: true,
        transcriptExcerpt: segment.text,
        transcriptOffsetSeconds: segment.startSeconds,
      });
    }
  }

  const priced = Array.from(byItem.values())
    .sort((a, b) => (a.transcriptOffsetSeconds ?? 0) - (b.transcriptOffsetSeconds ?? 0))
    .slice(0, maxRows)
    .map(({ explicitQuantity: _explicit, score: _score, ...row }) => row);

  return {
    rows: [...priced, ...flagged],
    needsPricingCount: flagged.length,
    candidateIds: Array.from(candidateIds),
  };
}
