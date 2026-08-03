/**
 * AI estimate drafting: transcript + photo captions + the org's price book in,
 * line items out.
 *
 * The rule this file exists to enforce: **the model may only reference item ids
 * that were handed to it.** Prices never come from the model — they come from the
 * price-book row the id points at, with the org's markup applied. Anything the
 * model could not match is a flagged `needs pricing` row carrying the narration
 * that produced it. A returned id that was not in the candidate set is treated as
 * a hallucination and converted to a flag, not looked up.
 *
 * Everything else here is about what happens when the model misbehaves:
 *
 *  - no API key → the deterministic lexical drafter (src/lib/matching.ts) runs
 *    instead, and the draft is labelled as keyword-matched everywhere it appears;
 *  - unreadable JSON, a refusal, a timeout → same fallback, but marked
 *    `degraded`, with a message the estimate screen shows above the rows. A parse
 *    failure must never surface as a confident wrong answer.
 */

import { z } from "zod";
import { env, has } from "@/lib/env";
import { applyMarkup } from "@/lib/money";
import {
  draftFromSegments,
  findCandidates,
  needsPricingFrom,
  segmentTranscript,
  type MatchableItem,
  type Segment,
} from "@/lib/matching";
import { TRADE_LABELS } from "@/lib/trades";
import type { DraftedLineItem, Trade } from "@/db/schema";

export const PROMPT_VERSION = "2026-08-a";
export const LEXICAL_DRAFTER = "quotefox-lexical-v1";

export interface DraftRequest {
  trade: Trade;
  /** Transcript segments with their timings, in order. */
  segments: Segment[];
  photoCaptions: string[];
  items: MatchableItem[];
  defaultMarkupPct: number;
  jobTitle: string;
  address: string;
}

export interface DraftMeta {
  model: string;
  promptVersion: string;
  /** True when the model was configured but its answer could not be used. */
  degraded: boolean;
  /** Shown to the contractor above the rows when set. */
  notice: string | null;
  candidateCount: number;
  durationMs: number;
}

export interface DraftResult {
  rows: DraftedLineItem[];
  needsPricingCount: number;
  meta: DraftMeta;
}

/* ------------------------------------------------------------- the prompt --- */

/**
 * The drafting prompt. Pure and exported so a test can assert the two things
 * that actually matter: every candidate id the model is allowed to use is in it,
 * and nothing that looks like a price the model could copy is.
 */
export function buildPrompt(request: DraftRequest, candidates: MatchableItem[]): string {
  const lines = candidates.map(
    (item) =>
      `- id: ${item.id} | ${item.name} | unit: ${item.unit} | kind: ${item.kind} | category: ${item.category}`,
  );
  const captions = request.photoCaptions.length
    ? request.photoCaptions.map((caption, i) => `Photo ${i + 1}: ${caption}`).join("\n")
    : "(no photo captions)";

  return [
    `You are drafting a line-item estimate for a ${TRADE_LABELS[request.trade]} contractor from their own walkthrough narration.`,
    "",
    `Job: ${request.jobTitle} — ${request.address}`,
    "",
    "TRANSCRIPT (each line is timestamped in seconds):",
    ...request.segments.map((segment) => `[${segment.startSeconds}] ${segment.text}`),
    "",
    "PHOTO CAPTIONS:",
    captions,
    "",
    "PRICE BOOK CANDIDATES — the only items you may reference:",
    ...lines,
    "",
    "Rules:",
    "1. Every line item must either reference one of the candidate ids above, or set price_book_item_id to null.",
    "2. Never invent an item id, a price, or a total. Prices are applied by the system from the price book.",
    "3. When the contractor describes work that no candidate covers, return a row with price_book_item_id null, a short name for the work, and the transcript sentence that describes it. Do not guess a price.",
    "4. quantity is in the item's own unit (hours for labour, linear feet, square feet, or a count). Use 1 when the narration does not state one.",
    "5. transcript_excerpt must be a sentence copied from the transcript, and offset_seconds its timestamp.",
    "6. Do not include rows for work the contractor said is already fine, or for equipment they are only describing as existing.",
  ].join("\n");
}

/* ---------------------------------------------------------------- parsing --- */

const modelRowSchema = z.object({
  price_book_item_id: z.string().nullable(),
  name: z.string().min(1).max(160).optional(),
  quantity: z.number().finite().positive().max(100_000),
  unit: z.string().optional(),
  transcript_excerpt: z.string().max(600).optional(),
  offset_seconds: z.number().finite().nonnegative().max(86_400).optional(),
  note: z.string().max(400).optional(),
});

const modelReplySchema = z.object({ line_items: z.array(modelRowSchema).max(60) });

export interface ParseIssue {
  kind: "unknown_item_id" | "no_name" | "bad_quantity";
  detail: string;
}

export interface ParsedDraft {
  rows: DraftedLineItem[];
  issues: ParseIssue[];
}

/**
 * Turn a model reply into rows, with every id checked against the candidate set.
 *
 * An id the model made up does not become a lookup — it becomes a flagged row, so
 * the worst case of a hallucinating model is a contractor being asked to price
 * one line by hand, never a wrong number on a proposal.
 */
export function parseModelDraft(
  raw: unknown,
  candidates: readonly MatchableItem[],
  defaultMarkupPct: number,
): ParsedDraft | null {
  const parsed = modelReplySchema.safeParse(raw);
  if (!parsed.success) return null;

  const byId = new Map(candidates.map((item) => [item.id, item]));
  const rows: DraftedLineItem[] = [];
  const issues: ParseIssue[] = [];
  const seen = new Set<string>();

  for (const row of parsed.data.line_items) {
    const excerpt = (row.transcript_excerpt ?? "").trim();
    const offset = row.offset_seconds ?? null;
    const item = row.price_book_item_id ? byId.get(row.price_book_item_id) : undefined;

    if (row.price_book_item_id && !item) {
      issues.push({
        kind: "unknown_item_id",
        detail: `${row.price_book_item_id} was not in the candidate set`,
      });
      rows.push({
        priceBookItemId: null,
        name: row.name?.trim() || "Unmatched item from the walkthrough",
        description: row.note ?? null,
        quantityMilli: Math.max(1, Math.round(row.quantity * 1000)),
        unit: "each",
        unitPriceCents: 0,
        needsPricing: true,
        transcriptExcerpt: excerpt,
        transcriptOffsetSeconds: offset,
      });
      continue;
    }

    if (!item) {
      const name = row.name?.trim();
      if (!name) {
        issues.push({ kind: "no_name", detail: "unpriced row with no name" });
        continue;
      }
      rows.push({
        priceBookItemId: null,
        name,
        description: row.note ?? null,
        quantityMilli: Math.max(1, Math.round(row.quantity * 1000)),
        unit: "each",
        unitPriceCents: 0,
        needsPricing: true,
        transcriptExcerpt: excerpt,
        transcriptOffsetSeconds: offset,
      });
      continue;
    }

    // One row per item: a model that lists the same breaker twice is merged, not
    // billed twice.
    if (seen.has(item.id)) continue;
    seen.add(item.id);

    rows.push({
      priceBookItemId: item.id,
      name: item.name,
      description: item.description ?? null,
      quantityMilli: Math.max(1, Math.round(row.quantity * 1000)),
      unit: item.unit,
      unitPriceCents: applyMarkup(item.unitCostCents, item.markupPct ?? defaultMarkupPct),
      needsPricing: false,
      transcriptExcerpt: excerpt,
      transcriptOffsetSeconds: offset,
    });
  }

  return { rows, issues };
}

/* ----------------------------------------------------------------- entry --- */

export function draftingProvider(): "openai" | "lexical" {
  return has("OPENAI_API_KEY") ? "openai" : "lexical";
}

function lexicalDraft(request: DraftRequest): { rows: DraftedLineItem[]; needsPricingCount: number } {
  const outcome = draftFromSegments({
    segments: request.segments,
    items: request.items,
    defaultMarkupPct: request.defaultMarkupPct,
    photoCaptions: request.photoCaptions,
  });
  return { rows: outcome.rows, needsPricingCount: outcome.needsPricingCount };
}

const MODEL_TIMEOUT_MS = 60_000;

/**
 * Draft an estimate. Never throws — a drafting failure is a state the product
 * has an answer for, not an exception.
 */
export async function draftEstimate(request: DraftRequest): Promise<DraftResult> {
  const startedAt = Date.now();
  const candidates = findCandidates(request.items, request.segments, 50).map((c) => c.item);

  if (draftingProvider() === "lexical") {
    const { rows, needsPricingCount } = lexicalDraft(request);
    return {
      rows,
      needsPricingCount,
      meta: {
        model: LEXICAL_DRAFTER,
        promptVersion: PROMPT_VERSION,
        degraded: false,
        notice: null,
        candidateCount: candidates.length,
        durationMs: Date.now() - startedAt,
      },
    };
  }

  const fallback = (notice: string): DraftResult => {
    const { rows, needsPricingCount } = lexicalDraft(request);
    return {
      rows,
      needsPricingCount,
      meta: {
        model: `${env.draftModel} (unused)`,
        promptVersion: PROMPT_VERSION,
        degraded: true,
        notice,
        candidateCount: candidates.length,
        durationMs: Date.now() - startedAt,
      },
    };
  };

  try {
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey: env.openaiApiKey, timeout: MODEL_TIMEOUT_MS, maxRetries: 1 });
    const completion = await client.chat.completions.create({
      model: env.draftModel,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You draft construction estimates strictly from a contractor's own price book. You never invent prices or item ids. Reply with JSON: { \"line_items\": [ { \"price_book_item_id\": string|null, \"name\": string, \"quantity\": number, \"transcript_excerpt\": string, \"offset_seconds\": number, \"note\": string } ] }.",
        },
        { role: "user", content: buildPrompt(request, candidates) },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return fallback("The model returned an empty reply, so this draft came from keyword matching. Check every row.");

    let json: unknown;
    try {
      json = JSON.parse(content);
    } catch {
      return fallback("The model's reply was not valid JSON, so this draft came from keyword matching. Check every row.");
    }

    const parsed = parseModelDraft(json, candidates, request.defaultMarkupPct);
    if (!parsed || !parsed.rows.length) {
      return fallback("The model's reply did not contain usable line items, so this draft came from keyword matching. Check every row.");
    }

    // Sentences the contractor explicitly deferred must be flagged even when the
    // model glossed over them.
    const flaggedExcerpts = new Set(
      parsed.rows.filter((row) => row.needsPricing).map((row) => row.transcriptExcerpt),
    );
    for (const segment of request.segments) {
      const flag = needsPricingFrom(segment);
      if (flag && !flaggedExcerpts.has(segment.text)) {
        parsed.rows.push({
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

    const needsPricingCount = parsed.rows.filter((row) => row.needsPricing).length;
    const hallucinated = parsed.issues.filter((issue) => issue.kind === "unknown_item_id").length;
    return {
      rows: parsed.rows,
      needsPricingCount,
      meta: {
        model: env.draftModel,
        promptVersion: PROMPT_VERSION,
        degraded: false,
        notice: hallucinated
          ? `${hallucinated} row${hallucinated === 1 ? "" : "s"} referenced an item that is not in your price book and ${hallucinated === 1 ? "was" : "were"} flagged for pricing instead.`
          : null,
        candidateCount: candidates.length,
        durationMs: Date.now() - startedAt,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return fallback(`The drafting model could not be reached (${message}), so this draft came from keyword matching. Check every row.`);
  }
}

export { segmentTranscript };
