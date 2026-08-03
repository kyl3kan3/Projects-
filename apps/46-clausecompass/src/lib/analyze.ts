/**
 * src/lib/analyze.ts
 *
 * The deterministic clause analyser: segmentation, clause classification, quote
 * selection and typed field extraction — pure TypeScript, no model.
 *
 * It has two jobs.
 *
 *  1. It is the local implementation of the extraction interface, used whenever no
 *     `ANTHROPIC_API_KEY` is configured (see `src/lib/extract.ts`). Reports produced
 *     this way are stamped `local-rules-v1` rather than a model id, because a report
 *     implying a model read the document when none did would be a lie in exactly the
 *     place this product cannot afford one.
 *  2. It defines the typed fields the playbook scores against, in both modes. The
 *     model is asked for the same fields under a forced tool schema, and anything it
 *     returns that cannot be anchored to the document is dropped.
 *
 * Classification works at *block* level, not section level. A section headed "TERM
 * AND TERMINATION" carries an auto-renewal clause and a termination clause, and
 * scoring the whole section only ever finds the louder of the two — which silently
 * lost the termination clause and then reported it as missing.
 *
 * Fields are extracted from the union of every block that matched a clause type, so
 * a rule reads "the notice period in the auto-renewal paragraph" rather than "the
 * first number anywhere in section 7" — the cure period in 7.4 was being read as the
 * renewal notice in 7.2 before that changed.
 */

import type { ClauseType, ContractType } from "@/db/schema";
import { CLAUSE_KEYWORDS, detectContractType } from "@/lib/taxonomy";
import { MIN_QUOTE_CHARS, type ParseResult } from "@/lib/parse";

export const LOCAL_ANALYZER_VERSION = "local-rules-v1";

export interface AnalyzedClause {
  clauseType: ClauseType;
  heading: string | null;
  sectionRef: string | null;
  /** Verbatim substrings of the parsed text. Anchoring is re-checked downstream. */
  quotes: string[];
  fields: Record<string, unknown>;
  confidence: number;
}

export interface AnalyzedSection {
  ref: string;
  heading: string;
  page: number;
  startOffset: number;
  endOffset: number;
  /** The section's own best-scoring type, used for coverage disposition. */
  clauseType: ClauseType | null;
  score: number;
}

/* ------------------------------------------------------------- numbers */

const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  twelve: 12,
  fourteen: 14,
  fifteen: 15,
  eighteen: 18,
  twenty: 20,
  "twenty-four": 24,
  thirty: 30,
  "thirty-six": 36,
  forty: 40,
  "forty-five": 45,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  "seventy-five": 75,
  eighty: 80,
  ninety: 90,
  "one hundred": 100,
  "one hundred twenty": 120,
  "one hundred eighty": 180,
};

/** "sixty (60)" → 60, "thirty" → 30, "45" → 45, "of" → null. */
export function numberFrom(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const digits = /(\d[\d,]*)/.exec(raw);
  if (digits) {
    const n = Number(digits[1].replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  const word = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (word in WORD_NUMBERS) return WORD_NUMBERS[word];
  return null;
}

/**
 * Walk every match of a pattern and return the first that yields a real number.
 * Contracts write numbers twice ("thirty (30)"), so the parenthesised group is
 * preferred when present, and a match like "2.1 Revisions" yields nothing rather
 * than the section number.
 */
function scanNumber(text: string, re: RegExp): number | null {
  const rx = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text))) {
    const n = numberFrom(m[2] ?? m[1]);
    if (n !== null) return n;
  }
  return null;
}

const DAY_PATTERNS: RegExp[] = [
  /net[\s-]*(\d+)/i,
  /(?:at least|no less than|no fewer than|not less than)\s+([a-z-]+|\d+)\s*(?:\(\s*(\d+)\s*\)\s*)?(?:calendar\s+|business\s+)?days/i,
  /within\s+([a-z-]+(?:\s+[a-z-]+)?|\d+)\s*(?:\(\s*(\d+)\s*\)\s*)?(?:calendar\s+|business\s+)?days/i,
  /(?:upon|on)\s+([a-z-]+|\d+)\s*(?:\(\s*(\d+)\s*\)\s*)?(?:calendar\s+|business\s+)?days['’]?\s*(?:prior\s+)?(?:written\s+)?notice/i,
  /([a-z-]+|\d+)\s*(?:\(\s*(\d+)\s*\)\s*)?(?:calendar\s+|business\s+)?days['’]?\s*(?:prior\s+)?(?:written\s+)?notice/i,
];

/** Days, from the phrasings contracts actually use. */
export function daysFrom(text: string): number | null {
  for (const re of DAY_PATTERNS) {
    const n = scanNumber(text, re);
    if (n !== null) return n;
  }
  return null;
}

function monthsFrom(text: string): number | null {
  const months = scanNumber(
    text,
    /(?<![.\d])([a-z-]+|\d+)\s*(?:\(\s*(\d+)\s*\)\s*)?[- ]?months?/i,
  );
  if (months !== null) return months;
  const years = scanNumber(text, /(?<![.\d])([a-z-]+|\d+)\s*(?:\(\s*(\d+)\s*\)\s*)?[- ]?years?/i);
  return years === null ? null : years * 12;
}

/* --------------------------------------------------- classification */

/** Score a chunk of text against one clause type's keyword set. */
export function scoreClauseType(text: string, type: ClauseType): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const [needle, weight] of CLAUSE_KEYWORDS[type]) {
    if (lower.includes(needle)) score += weight;
  }
  return score;
}

/** The strongest keyword hit, used to choose which sentence to quote. */
function bestKeyword(text: string, type: ClauseType): string | null {
  const lower = text.toLowerCase();
  let best: string | null = null;
  let bestWeight = 0;
  for (const [needle, weight] of CLAUSE_KEYWORDS[type]) {
    if (lower.includes(needle) && weight > bestWeight) {
      best = needle;
      bestWeight = weight;
    }
  }
  return best;
}

export const MIN_CLASSIFY_SCORE = 6;

export function classify(text: string): { clauseType: ClauseType | null; score: number } {
  let bestType: ClauseType | null = null;
  let best = 0;
  for (const type of Object.keys(CLAUSE_KEYWORDS) as ClauseType[]) {
    if (type === "other") continue;
    const s = scoreClauseType(text, type);
    if (s > best) {
      best = s;
      bestType = type;
    }
  }
  if (best < MIN_CLASSIFY_SCORE) return { clauseType: null, score: best };
  return { clauseType: bestType, score: best };
}

/* -------------------------------------------------- field extraction */

const PARTY_SIDE = "(?:either party|both parties|each party|contractor|studio|consultant|provider|supplier|vendor|recipient|tenant)";

export function extractFields(type: ClauseType, text: string): Record<string, unknown> {
  const t = text.replace(/\s+/g, " ");

  switch (type) {
    case "payment_terms": {
      const deposit = /(\d{1,3})\s*%[^.]{0,60}(?:deposit|upon (?:signing|execution)|in advance)/i.exec(t);
      return {
        payment_days: daysFrom(t),
        deposit_pct: deposit ? Number(deposit[1]) : null,
        milestone_based: /milestone|invoiced as follows/i.test(t),
      };
    }
    case "ip_assignment": {
      let assignsOn: "payment" | "creation" | "delivery" | "execution" | "unclear" = "unclear";
      if (/(?:upon|on|after)[^.]{0,60}(?:payment in full|receipt of payment|full payment|paid in full|payment of all amounts)/i.test(t)) {
        assignsOn = "payment";
      } else if (/upon creation|as (?:they are )?created|when created/i.test(t)) {
        assignsOn = "creation";
      } else if (/upon (?:delivery|acceptance)|work made for hire/i.test(t)) {
        assignsOn = "delivery";
      } else if (/upon execution|as of the effective date/i.test(t)) {
        assignsOn = "execution";
      }
      return {
        assigns_on: assignsOn,
        work_for_hire: /work made for hire/i.test(t),
        portfolio_rights: /portfolio|self-promotion|showcase/i.test(t),
        moral_rights_waived: /moral rights/i.test(t),
      };
    }
    case "indemnity": {
      const mutual =
        /each party (?:shall|will|agrees to)[^.]{0,40}indemnif/i.test(t) ||
        /mutual(?:ly)? indemnif/i.test(t) ||
        /(?:the )?parties (?:shall|will) each indemnif/i.test(t);
      const capped =
        /subject to (?:the )?(?:limitation|limitations) of liability/i.test(t) ||
        /shall not exceed/i.test(t);
      return { mutual, capped, covers_third_party_claims: /third[- ]party claim/i.test(t) };
    }
    case "non_compete": {
      const geo = /within (?:the )?[^.]{0,50}?(?:state|county|region|miles|sector|market)[^.]{0,20}/i.exec(t);
      return {
        present: true,
        months: monthsFrom(t),
        geography: /worldwide|globally/i.test(t) ? "worldwide" : (geo?.[0]?.trim() ?? null),
        non_solicit_only: /non-?solicit/i.test(t) && !/compet/i.test(t),
      };
    }
    case "auto_renewal": {
      return {
        renews: true,
        notice_days: daysFrom(t),
        renewal_term_months: monthsFrom(t),
      };
    }
    case "termination": {
      // "For convenience" means someone other than only the client can walk away
      // without alleging fault. A termination right hedged with "material breach" is
      // termination for cause, which every contract already has.
      const sentences = splitSentences(t);
      const isConvenience = (s: string) => {
        if (!new RegExp(`${PARTY_SIDE}[^.]{0,80}\\bmay terminate\\b`, "i").test(s)) return false;
        if (/for (?:any reason|convenience|no reason)|with or without cause|without cause/i.test(s)) {
          return true;
        }
        return !/breach|cause|default|failure to/i.test(s);
      };
      const convenienceSentence = sentences.find(isConvenience) ?? null;
      const clientOnly =
        /client may terminate/i.test(t) &&
        !new RegExp(
          "(?:either party|contractor|studio|consultant|provider)[^.]{0,60}may terminate[^.]{0,80}(?:for any reason|convenience|without cause|at any time)",
          "i",
        ).test(t);
      // The notice period is read from the sentence that granted the right, not from
      // the section: the 30-day cure period in a termination-for-cause paragraph was
      // being reported as the notice a freelancer gets before the work stops.
      const noticeSource =
        convenienceSentence ??
        sentences.find((s) => /client may terminate/i.test(s)) ??
        sentences.find((s) => /may terminate/i.test(s)) ??
        t;
      return {
        for_convenience: convenienceSentence !== null,
        client_only: clientOnly,
        notice_days: daysFrom(noticeSource),
      };
    }
    case "liability_cap": {
      const amount = /\$\s?([\d][\d,]*)/.exec(t);
      const multiple = /(one|two|three|\d+)\s*(?:\(\d+\))?\s*(?:x|times)\s+the/i.exec(t);
      let basis: "fees" | "amount" | "multiple" | "none" = "none";
      if (multiple) basis = "multiple";
      else if (/(?:not|never) exceed[^.]{0,80}(?:fees|amounts) (?:paid|payable)/i.test(t)) basis = "fees";
      else if (amount && /not exceed/i.test(t)) basis = "amount";
      return {
        cap_basis: basis,
        cap_amount_cents:
          basis === "amount" && amount ? Number(amount[1].replace(/,/g, "")) * 100 : null,
        cap_multiple: multiple ? numberFrom(multiple[1]) : null,
        excludes_consequential: /consequential|incidental|indirect/i.test(t),
        mutual: /each party|neither party|either party/i.test(t),
      };
    }
    case "confidentiality": {
      const months = monthsFrom(t);
      return {
        mutual: /each party|both parties|receiving party|either party/i.test(t),
        years: months === null ? null : Math.round(months / 12),
        perpetual: /in perpetuity|perpetual/i.test(t),
      };
    }
    case "warranties":
      return {
        disclaimed: /\bas is\b|no warranties|disclaims all warranties/i.test(t),
        performance_warranty: /warrants that (?:the )?services/i.test(t),
      };
    case "governing_law": {
      const juris =
        /laws of (?:the )?(?:State of |Commonwealth of |State )?([A-Z][A-Za-z ]{2,30}?)(?:,|\.|\s+without)/.exec(
          text,
        );
      return {
        jurisdiction: juris ? juris[1].trim() : null,
        arbitration: /arbitrat/i.test(t),
        jury_waiver: /waive[^.]{0,40}jury/i.test(t),
      };
    }
    case "late_fees": {
      const monthly = /(\d+(?:\.\d+)?)\s*%\s*per month/i.exec(t);
      const annual = /(\d+(?:\.\d+)?)\s*%\s*(?:per annum|annually|per year)/i.exec(t);
      return {
        rate_pct_monthly: monthly
          ? Number(monthly[1])
          : annual
            ? Math.round((Number(annual[1]) / 12) * 100) / 100
            : null,
        grace_days: daysFrom(t),
      };
    }
    case "scope_revisions": {
      return {
        unlimited:
          /unlimited (?:revisions|rounds)|as many revisions|until (?:the )?client is (?:fully )?satisfied|as necessary to satisfy/i.test(
            t,
          ),
        rounds: scanNumber(
          t,
          /(?<![.\d])([a-z-]+|\d+)\s*(?:\(\s*(\d+)\s*\)\s*)?\s*(?:rounds?|revisions?)\b/i,
        ),
        change_order_required: /change order/i.test(t),
      };
    }
    default:
      return {};
  }
}

/* ----------------------------------------------------- quote picking */

/** A quote shorter than this is a heading, not evidence. */
const QUOTE_TARGET_CHARS = 100;
const QUOTE_MAX_CHARS = 700;

/**
 * The sentence pattern that makes a paragraph worth quoting for each clause type.
 *
 * Without this, the termination clause of a contract whose only real termination
 * right belongs to the client was quoted from its termination-for-cause paragraph —
 * technically the highest-scoring block, and exactly the wrong evidence for the flag
 * that fired.
 */
const PREFERRED_QUOTE: Partial<Record<ClauseType, RegExp>> = {
  payment_terms: /(?:within|net)[^.]{0,40}(?:days|30|60)/i,
  ip_assignment: /assign|work made for hire/i,
  indemnity: /indemnif|hold harmless/i,
  non_compete: /shall not[^.]{0,140}(?:compet|similar)/i,
  auto_renewal: /automatically renew|auto-renew/i,
  termination: /may terminate[^.]{0,120}(?:for any reason|convenience|at any time|without cause)/i,
  liability_cap: /not exceed|in no event/i,
  confidentiality: /confidential information/i,
  late_fees: /late (?:fee|payment)|past due|interest at/i,
  scope_revisions: /revision/i,
  governing_law: /governed by the laws|governing law/i,
};

/**
 * Choose the sentence that most deserves to be the quote: the one carrying the
 * clause's strongest keyword, extended until it is long enough to stand alone.
 */
export function pickQuote(segmentText: string, type: ClauseType): string | null {
  const sentences = splitSentences(segmentText);
  if (sentences.length === 0) return null;
  const keyword = bestKeyword(segmentText, type);
  let index = 0;
  if (keyword) {
    const found = sentences.findIndex((s) => s.toLowerCase().includes(keyword));
    if (found >= 0) index = found;
  }
  let quote = sentences[index];
  let next = index + 1;
  while (quote.trim().length < QUOTE_TARGET_CHARS && next < sentences.length) {
    quote = `${quote} ${sentences[next]}`;
    next++;
  }
  quote = quote.trim();
  if (quote.length < MIN_QUOTE_CHARS) return null;
  // A quote longer than this stops being evidence and starts being the contract.
  return quote.length > QUOTE_MAX_CHARS
    ? quote.slice(0, QUOTE_MAX_CHARS).replace(/\s+\S*$/, "")
    : quote;
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.;:])\s+(?=[A-Z("\d])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/* ----------------------------------------------------- segmentation */

/**
 * Split the parsed document into sections: a heading plus the blocks beneath it. A
 * document with no detected headings falls back to one segment per paragraph, which
 * is how a single pasted clause is handled.
 */
export function segment(parsed: ParseResult): AnalyzedSection[] {
  const { blocks, sectionMap, fullText } = parsed;
  const out: AnalyzedSection[] = [];

  if (sectionMap.length === 0) {
    blocks.forEach((b, i) => {
      const end = i + 1 < blocks.length ? blocks[i + 1].offset - 2 : fullText.length;
      const text = fullText.slice(b.offset, end);
      const { clauseType, score } = classify(text);
      out.push({
        ref: `¶${i + 1}`,
        heading: text.slice(0, 60),
        page: b.page,
        startOffset: b.offset,
        endOffset: end,
        clauseType,
        score,
      });
    });
    return out;
  }

  sectionMap.forEach((s, i) => {
    const headingBlock = blocks[s.blockIndex];
    const nextIndex = sectionMap[i + 1]?.blockIndex ?? blocks.length;
    const end = nextIndex < blocks.length ? blocks[nextIndex].offset - 2 : fullText.length;
    const bodyStart = Math.min(blocks[s.blockIndex + 1]?.offset ?? headingBlock.offset, end);
    const text = `${headingBlock.text}\n${fullText.slice(bodyStart, end)}`;
    const { clauseType, score } = classify(text);
    out.push({
      ref: s.ref,
      heading: s.heading,
      page: s.page,
      startOffset: bodyStart,
      endOffset: end,
      clauseType,
      score,
    });
  });
  return out;
}

interface ScoredBlock {
  sectionIndex: number;
  text: string;
  startOffset: number;
  endOffset: number;
  score: number;
}

/* --------------------------------------------------------- the analyser */

export interface AnalysisResult {
  contractType: ContractType;
  clauses: AnalyzedClause[];
  sections: AnalyzedSection[];
}

/**
 * Analyse a parsed contract into typed, quoted clauses — one clause per type, whose
 * quote comes from the single best-matching paragraph and whose fields come from
 * every paragraph that matched.
 */
export function analyzeContract(parsed: ParseResult): AnalysisResult {
  const sections = segment(parsed);
  const { blocks, fullText } = parsed;

  // Every block, with the section heading it sits under (headings carry the
  // strongest signal in a contract and live outside the paragraph text).
  const candidates: Array<{ block: ScoredBlock; type: ClauseType }> = [];
  const perType = new Map<ClauseType, ScoredBlock[]>();

  sections.forEach((section, sectionIndex) => {
    const sectionBlocks = blocks.filter(
      (b) => b.offset >= section.startOffset && b.offset < Math.max(section.endOffset, section.startOffset + 1),
    );
    const units = sectionBlocks.length
      ? sectionBlocks.map((b, i) => {
          const nextOffset =
            sectionBlocks[i + 1]?.offset ?? Math.max(section.endOffset, b.offset + b.text.length);
          return { start: b.offset, end: Math.min(nextOffset - 2, section.endOffset) };
        })
      : [{ start: section.startOffset, end: section.endOffset }];

    for (const unit of units) {
      const raw = fullText.slice(unit.start, Math.max(unit.end, unit.start));
      if (raw.trim().length === 0) continue;
      const scoringText = `${section.heading}. ${raw}`;
      for (const type of Object.keys(CLAUSE_KEYWORDS) as ClauseType[]) {
        if (type === "other" || type === "boilerplate") continue;
        const score = scoreClauseType(scoringText, type);
        if (score < MIN_CLASSIFY_SCORE) continue;
        const block: ScoredBlock = {
          sectionIndex,
          text: raw,
          startOffset: unit.start,
          endOffset: unit.end,
          score,
        };
        candidates.push({ block, type });
        const list = perType.get(type) ?? [];
        list.push(block);
        perType.set(type, list);
      }
    }
  });

  const clauses: AnalyzedClause[] = [];
  for (const [clauseType, matched] of perType) {
    const preferred = PREFERRED_QUOTE[clauseType];
    const pool = preferred ? matched.filter((b) => preferred.test(b.text)) : [];
    const best = (pool.length ? pool : matched).reduce((a, b) => (b.score > a.score ? b : a));
    const section = sections[best.sectionIndex];
    const quote = pickQuote(`${best.text}`, clauseType);
    if (!quote) continue;
    // Fields read the union of every matching paragraph, in document order.
    const unionText = matched
      .slice()
      .sort((a, b) => a.startOffset - b.startOffset)
      .map((b) => b.text)
      .join(" ");
    clauses.push({
      clauseType,
      heading: section?.heading ?? null,
      sectionRef: section?.ref ?? null,
      quotes: [quote],
      fields: extractFields(clauseType, `${section?.heading ?? ""}. ${unionText}`),
      confidence: Math.min(0.95, 0.45 + best.score / 40),
    });
  }

  // Stable output order: the same contract must produce the same report every run.
  clauses.sort((a, b) => a.clauseType.localeCompare(b.clauseType));

  return { contractType: detectContractType(parsed.fullText), clauses, sections };
}
