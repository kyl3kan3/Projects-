/**
 * src/lib/extract.ts
 *
 * Clause extraction (pipeline pass 1) and the anchoring invariant.
 *
 * Two implementations sit behind one interface:
 *
 *  - `extractWithModel` sends the parsed contract to Claude with the `record_clauses`
 *    tool forced, so the model must answer in typed JSON with verbatim quotes.
 *  - `extractLocally` runs the deterministic analyser, and is selected automatically
 *    whenever no API key is configured.
 *
 * Both outputs go through the same gate, and the gate is the point of this file:
 * **every quote is re-matched against the parsed text**. Quotes that do not match
 * are dropped; a clause that loses all of its quotes is re-requested once by name and
 * then discarded and logged. Nothing unanchored is ever stored, so nothing unanchored
 * can render.
 */

import { z } from "zod";
import type {
  ClauseType,
  ContractType,
  CoverageEntry,
  SourceSpan,
} from "@/db/schema";
import { clauseTypeEnum } from "@/db/schema";
import {
  buildNormalizedIndex,
  locateQuote,
  pageForOffset,
  sectionForOffset,
  type ParseResult,
} from "@/lib/parse";
import { LOCAL_ANALYZER_VERSION, analyzeContract, segment } from "@/lib/analyze";
import { CLAUSE_LABELS } from "@/lib/taxonomy";
import { configured, costMicros, forcedToolCall, type Usage } from "@/lib/claude";

export interface ExtractedClause {
  clauseType: ClauseType;
  heading: string | null;
  sectionRef: string | null;
  sourceSpans: SourceSpan[];
  fields: Record<string, unknown>;
  confidence: number;
  raw?: unknown;
}

export interface ExtractionResult {
  contractType: ContractType;
  clauses: ExtractedClause[];
  coverage: CoverageEntry[];
  modelVersion: string;
  usage: Usage;
  costMicros: number;
  /** Quotes the document did not contain. Surfaced, not swallowed. */
  droppedQuotes: string[];
  /** Clause types the model claimed but could not anchor at all. */
  droppedClauses: ClauseType[];
}

/* ---------------------------------------------------------- the tool schema */

const CLAUSE_TYPES = clauseTypeEnum.enumValues;

const clauseSchema = z.object({
  clause_type: z.enum(CLAUSE_TYPES as [ClauseType, ...ClauseType[]]),
  heading: z.string().max(200).optional().nullable(),
  section_ref: z.string().max(40).optional().nullable(),
  quotes: z.array(z.string().min(12).max(1200)).min(1).max(4),
  // No zod defaults anywhere in this schema: with a default, the input and output
  // types diverge and the generic on `forcedToolCall` binds to the wrong one. The
  // fallbacks live at the point of use instead.
  fields: z.record(z.unknown()).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export const recordClausesSchema = z.object({
  contract_type: z.enum(["msa", "sow", "nda", "vendor", "lease", "other"]),
  clauses: z.array(clauseSchema).max(40),
  /** Sections the model could not assign to a clause type. */
  unassigned_sections: z.array(z.string().max(40)).optional(),
});

export type RecordClausesInput = z.infer<typeof recordClausesSchema>;

/**
 * JSON Schema handed to the model as the tool's `input_schema`. Written out rather
 * than generated so that the field names, the enum and the "quote verbatim"
 * instruction live in one readable place — this schema is the product's IP.
 */
export const RECORD_CLAUSES_INPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    contract_type: {
      type: "string",
      enum: ["msa", "sow", "nda", "vendor", "lease", "other"],
      description: "The kind of agreement this document is.",
    },
    clauses: {
      type: "array",
      maxItems: 40,
      description: "One entry per clause found. Do not invent clauses that are not present.",
      items: {
        type: "object",
        properties: {
          clause_type: { type: "string", enum: CLAUSE_TYPES },
          heading: { type: "string", description: "The section heading as printed." },
          section_ref: { type: "string", description: "The section number as printed, e.g. 4.2." },
          quotes: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            description:
              "Verbatim quotes copied character-for-character from the document text supplied. Never paraphrase. A quote that does not appear in the document will be discarded.",
            items: { type: "string", minLength: 12 },
          },
          fields: {
            type: "object",
            description:
              "Typed values read from the clause. Use these names where they apply: payment_days, deposit_pct, assigns_on (payment|creation|delivery|execution|unclear), mutual, capped, present, months, notice_days, renewal_term_months, for_convenience, client_only, cap_basis (fees|amount|multiple|none), cap_amount_cents, unlimited, rounds, rate_pct_monthly, years, jurisdiction. Omit a field rather than guessing it.",
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["clause_type", "quotes"],
      },
    },
    unassigned_sections: {
      type: "array",
      items: { type: "string" },
      description:
        "Section references you could not assign to any clause type. These are reported to the reader as not analyzed.",
    },
  },
  required: ["contract_type", "clauses"],
};

const SYSTEM_PROMPT = `You are the extraction stage of a contract-reading tool used by freelancers and small businesses. You do not give advice and you do not judge the contract; a separate deterministic rule engine does the scoring.

Your only job is to find the clauses in the document and record them with verbatim quotes and typed values.

Rules:
- Quote the document exactly. Copy the characters as they appear. Never paraphrase, tidy, or join separated passages into one quote.
- Record only what the document says. If a value is not stated, omit the field.
- One entry per clause type per clause. Prefer the passage that states the operative term.
- Mark general provisions (entire agreement, severability, notices, counterparts) as boilerplate.
- List every section reference you could not classify in unassigned_sections.`;

function buildUserContent(parsed: ParseResult): string {
  const lines = parsed.blocks.map((b) => `[p${b.page}] ${b.text}`);
  return `Here is the parsed contract text. Quote from it exactly.\n\n---\n${lines.join(
    "\n\n",
  )}\n---`;
}

/* ------------------------------------------------------------- anchoring */

export interface AnchorOutcome {
  spans: SourceSpan[];
  dropped: string[];
}

/**
 * Turn candidate quotes into anchored spans, dropping anything the document does not
 * actually contain.
 */
export function anchorQuotes(parsed: ParseResult, quotes: string[]): AnchorOutcome {
  const index = buildNormalizedIndex(parsed.fullText);
  const spans: SourceSpan[] = [];
  const dropped: string[] = [];
  for (const quote of quotes) {
    const located = locateQuote(parsed.fullText, index, quote);
    if (!located) {
      dropped.push(quote);
      continue;
    }
    spans.push({
      page: pageForOffset(parsed.blocks, located.startOffset),
      startOffset: located.startOffset,
      endOffset: located.endOffset,
      // The stored quote is the document's own substring, not the model's copy of
      // it: that is what makes the report's quotes provably the contract's words.
      quote: located.exact,
    });
  }
  return { spans, dropped };
}

/** The `§4.2 · P.7` citation for an anchored span. */
export function citationFor(parsed: ParseResult, span: SourceSpan): string {
  const section = sectionForOffset(parsed.blocks, parsed.sectionMap, span.startOffset);
  const ref = section?.ref && /^\d/.test(section.ref) ? `§${section.ref}` : null;
  return [ref, `P.${span.page}`].filter(Boolean).join(" · ");
}

/* ------------------------------------------------------------- coverage */

/**
 * Account for every section: matched to a clause, marked boilerplate, or reported as
 * not analyzed. A gap that disappears is the failure mode this exists to prevent.
 */
export function computeCoverage(
  parsed: ParseResult,
  clauses: ExtractedClause[],
): CoverageEntry[] {
  const sections = segment(parsed);
  const foundTypes = new Set(clauses.map((c) => c.clauseType));
  return sections.map((section) => {
    const hit = clauses.find((c) =>
      c.sourceSpans.some(
        (s) => s.startOffset >= section.startOffset && s.startOffset < Math.max(section.endOffset, section.startOffset + 1),
      ),
    );
    if (hit) {
      return {
        ref: section.ref,
        heading: section.heading,
        page: section.page,
        disposition: "clause" as const,
        clauseType: hit.clauseType,
      };
    }
    // A section that reads as a clause type already in the report was read as part of
    // that clause. Calling it "not analyzed" because the quote was taken from a
    // neighbouring subsection would report a gap that does not exist — an NDA's four
    // confidentiality sections did exactly that.
    if (section.clauseType && foundTypes.has(section.clauseType)) {
      return {
        ref: section.ref,
        heading: section.heading,
        page: section.page,
        disposition: "clause" as const,
        clauseType: section.clauseType,
      };
    }
    if (section.clauseType === "boilerplate") {
      return {
        ref: section.ref,
        heading: section.heading,
        page: section.page,
        disposition: "boilerplate" as const,
      };
    }
    return {
      ref: section.ref,
      heading: section.heading,
      page: section.page,
      disposition: "not_analyzed" as const,
    };
  });
}

/* ------------------------------------------------------------ the passes */

export function extractLocally(parsed: ParseResult): ExtractionResult {
  const analysis = analyzeContract(parsed);
  const clauses: ExtractedClause[] = [];
  const droppedQuotes: string[] = [];
  const droppedClauses: ClauseType[] = [];

  for (const c of analysis.clauses) {
    const { spans, dropped } = anchorQuotes(parsed, c.quotes);
    droppedQuotes.push(...dropped);
    if (spans.length === 0) {
      droppedClauses.push(c.clauseType);
      continue;
    }
    clauses.push({
      clauseType: c.clauseType,
      heading: c.heading,
      sectionRef: c.sectionRef,
      sourceSpans: spans,
      fields: c.fields,
      confidence: c.confidence,
      raw: { analyzer: LOCAL_ANALYZER_VERSION, quotes: c.quotes, fields: c.fields },
    });
  }

  return {
    contractType: analysis.contractType,
    clauses,
    coverage: computeCoverage(parsed, clauses),
    modelVersion: LOCAL_ANALYZER_VERSION,
    usage: { inputTokens: 0, outputTokens: 0 },
    costMicros: 0,
    droppedQuotes,
    droppedClauses,
  };
}

/**
 * Model extraction with one re-request for unanchored clauses.
 *
 * The re-request names the clause types that failed and repeats the quoting rule.
 * Anything still unanchored after that is discarded — the report says so through the
 * coverage strip rather than pretending the clause was not there.
 */
export async function extractWithModel(parsed: ParseResult): Promise<ExtractionResult> {
  const first = await forcedToolCall({
    system: SYSTEM_PROMPT,
    userContent: buildUserContent(parsed),
    toolName: "record_clauses",
    toolDescription:
      "Record every clause found in the contract, with verbatim quotes and typed values.",
    inputSchema: RECORD_CLAUSES_INPUT_SCHEMA,
    schema: recordClausesSchema,
    maxTokens: 8000,
    cacheSystem: true,
  });

  let usage = first.usage;
  const anchored = anchorModelOutput(parsed, first.value);

  if (anchored.unanchored.length > 0) {
    const names = anchored.unanchored.map((t) => CLAUSE_LABELS[t]).join(", ");
    const retry = await forcedToolCall({
      system: SYSTEM_PROMPT,
      userContent:
        `${buildUserContent(parsed)}\n\nThe quotes you gave for these clauses were not found in the document text: ${names}. ` +
        "Record those clauses again, copying the quotes character-for-character from the text above. Omit a clause entirely if it is not in the document.",
      toolName: "record_clauses",
      toolDescription:
        "Record every clause found in the contract, with verbatim quotes and typed values.",
      inputSchema: RECORD_CLAUSES_INPUT_SCHEMA,
      schema: recordClausesSchema,
      maxTokens: 8000,
      cacheSystem: true,
    });
    usage = {
      inputTokens: usage.inputTokens + retry.usage.inputTokens,
      outputTokens: usage.outputTokens + retry.usage.outputTokens,
    };
    const second = anchorModelOutput(parsed, retry.value);
    // Keep whatever the retry rescued; drop the rest for good.
    const have = new Set(anchored.clauses.map((c) => c.clauseType));
    for (const c of second.clauses) {
      if (!have.has(c.clauseType)) anchored.clauses.push(c);
    }
    anchored.droppedQuotes.push(...second.droppedQuotes);
    anchored.unanchored = second.unanchored.filter((t) => !have.has(t));
  }

  return {
    contractType: first.value.contract_type,
    clauses: anchored.clauses,
    coverage: computeCoverage(parsed, anchored.clauses),
    modelVersion: first.modelVersion,
    usage,
    costMicros: costMicros(usage),
    droppedQuotes: anchored.droppedQuotes,
    droppedClauses: anchored.unanchored,
  };
}

interface AnchoredModelOutput {
  clauses: ExtractedClause[];
  droppedQuotes: string[];
  unanchored: ClauseType[];
}

export function anchorModelOutput(
  parsed: ParseResult,
  output: RecordClausesInput,
): AnchoredModelOutput {
  const clauses: ExtractedClause[] = [];
  const droppedQuotes: string[] = [];
  const unanchored: ClauseType[] = [];

  for (const c of output.clauses) {
    const { spans, dropped } = anchorQuotes(parsed, c.quotes);
    droppedQuotes.push(...dropped);
    if (spans.length === 0) {
      unanchored.push(c.clause_type);
      continue;
    }
    clauses.push({
      clauseType: c.clause_type,
      heading: c.heading ?? null,
      sectionRef: c.section_ref ?? null,
      sourceSpans: spans,
      fields: c.fields ?? {},
      confidence: c.confidence ?? 0.8,
      raw: c,
    });
  }
  return { clauses, droppedQuotes, unanchored };
}

/**
 * The extraction interface the pipeline calls. The model is used when a key is
 * configured; otherwise the deterministic analyser runs and the report is stamped
 * with the analyser's version, never a model id.
 */
export async function extractClauses(parsed: ParseResult): Promise<ExtractionResult> {
  if (!configured()) return extractLocally(parsed);
  return extractWithModel(parsed);
}
