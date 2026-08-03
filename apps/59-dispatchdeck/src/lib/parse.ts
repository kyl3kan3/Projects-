/**
 * src/lib/parse.ts
 *
 * Rate-con extraction behind one narrow interface with two implementations:
 *
 *  - **Claude** (`claude-sonnet-5`, forced tool call) when `ANTHROPIC_API_KEY`
 *    is set. The PDF goes up as a document block; the tool schema is the shape
 *    the draft is stored in.
 *  - **The heuristic reader** (`rate-con-text.ts`) otherwise, over text pulled
 *    out of the PDF by `pdf-text.ts`.
 *
 * The interface is the point. Everything around the call — prompt assembly,
 * schema validation of what came back, confidence scoring, the repair pass, the
 * timeout, and what the product does when the answer is nonsense — is the same
 * code either way, and all of it is exercised by the tests.
 *
 * Parse honesty is a product law, so this module never returns a confident
 * wrong answer:
 *  - a response that fails schema validation gets one repair attempt, then fails;
 *  - a failure returns `ok: false` with a sentence, and the caller still lands
 *    the document so it can be typed in;
 *  - anything the model returned that does not survive validation is discarded
 *    rather than partially merged.
 */

import { z } from "zod";
import type { ExtractedRateCon } from "@/db/schema";
import { env, features } from "@/lib/env";
import { extractPdfText } from "@/lib/pdf-text";
import { CONFIDENCE_THRESHOLD, extractFromText, scoreOverall } from "@/lib/rate-con-text";
import { isJurisdiction } from "@/lib/jurisdictions";

export { CONFIDENCE_THRESHOLD };

const StopSchema = z.object({
  kind: z.enum(["pickup", "delivery"]),
  facility: z.string().max(120).nullable().optional(),
  city: z.string().min(1).max(60),
  state: z.string().length(2),
  windowStart: z.string().nullable().optional(),
  windowEnd: z.string().nullable().optional(),
});

export const ExtractionSchema = z.object({
  broker: z.string().min(1).max(120).nullable(),
  brokerMc: z.string().max(12).nullable(),
  /** Integer cents. A model that returns 1850 for "$1,850.00" is wrong, so the
   *  tool schema asks for cents explicitly and the description says so. */
  rateCents: z.number().int().min(0).max(100_000_00).nullable(),
  totalMiles: z.number().int().min(0).max(9999).nullable().optional(),
  equipment: z.enum(["van", "reefer", "flatbed", "other"]).nullable().optional(),
  references: z.array(z.string().max(32)).max(10),
  stops: z.array(StopSchema).max(12),
  fieldConfidence: z.record(z.string(), z.number().min(0).max(100)).optional(),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

export interface ExtractorInput {
  pdf: Uint8Array | null;
  /** Text already to hand — an inbound email body, or a plain-text attachment. */
  text: string | null;
  filename: string;
}

export type ExtractionOutcome =
  | { ok: true; extracted: ExtractedRateCon; confidence: number; source: "claude" | "heuristic" }
  | { ok: false; reason: string; source: "claude" | "heuristic"; pageCount: number | null };

export interface RateConExtractor {
  readonly source: "claude" | "heuristic";
  extract(input: ExtractorInput): Promise<ExtractionOutcome>;
}

/** Which extractor is live. Chosen by whether a key is present, never by a flag. */
export function getExtractor(): RateConExtractor {
  return features.claude ? new ClaudeExtractor() : new HeuristicExtractor();
}

/* ------------------------------------------------------------------ shared -- */

/**
 * Turn a validated extraction into the stored shape, dropping stops whose state
 * is not a real jurisdiction — a hallucinated "state: ZZ" would otherwise make
 * the load look complete and then fail IFTA later.
 */
export function toStoredShape(
  extraction: Extraction,
  source: "claude" | "heuristic",
): { extracted: ExtractedRateCon; confidence: number } {
  const stops = (extraction.stops ?? []).filter((s) => isJurisdiction(s.state));
  const droppedStops = (extraction.stops ?? []).length - stops.length;

  const extracted: ExtractedRateCon = {
    broker: extraction.broker,
    brokerMc: extraction.brokerMc,
    rateCents: extraction.rateCents,
    totalMiles: extraction.totalMiles ?? null,
    equipment: extraction.equipment ?? null,
    references: extraction.references ?? [],
    stops: stops.map((s) => ({
      kind: s.kind,
      facility: s.facility ?? null,
      city: s.city,
      state: s.state.toUpperCase(),
      windowStart: s.windowStart ?? null,
      windowEnd: s.windowEnd ?? null,
    })),
    fieldConfidence: extraction.fieldConfidence ?? {},
    source,
    failureReason:
      droppedStops > 0
        ? `${droppedStops} stop${droppedStops === 1 ? "" : "s"} came back with a state code that is not a US jurisdiction and were dropped. Check the stops before confirming.`
        : null,
  };
  return { extracted, confidence: scoreOverall(extracted) };
}

/** Does this draft justify the one-tap confirm, or must review open? */
export function needsReview(confidence: number, extracted: ExtractedRateCon): boolean {
  if (confidence < CONFIDENCE_THRESHOLD) return true;
  if (extracted.failureReason) return true;
  const fc = extracted.fieldConfidence ?? {};
  return Object.values(fc).some((v) => v < CONFIDENCE_THRESHOLD);
}

/* --------------------------------------------------------------- heuristic -- */

export class HeuristicExtractor implements RateConExtractor {
  readonly source = "heuristic" as const;

  async extract(input: ExtractorInput): Promise<ExtractionOutcome> {
    let text = input.text?.trim() ?? "";
    let pageCount: number | null = null;

    if (text.length < 40 && input.pdf) {
      const pdf = extractPdfText(input.pdf);
      pageCount = pdf.pageCount;
      if (pdf.text.trim().length > text.length) text = pdf.text;
    }

    if (text.trim().length < 40) {
      return {
        ok: false,
        source: "heuristic",
        pageCount,
        reason:
          "No readable text in this one — it looks like a photograph or a scan. " +
          "The document is filed against the load; type the six fields in and it is done.",
      };
    }

    const { extraction } = extractFromText(text);
    const parsed = ExtractionSchema.safeParse(extraction);
    if (!parsed.success) {
      return {
        ok: false,
        source: "heuristic",
        pageCount,
        reason: "The reader produced something this app could not validate. Type the load in instead.",
      };
    }
    const { extracted, confidence } = toStoredShape(parsed.data, "heuristic");
    return { ok: true, extracted, confidence, source: "heuristic" };
  }
}

/* ------------------------------------------------------------------ Claude -- */

const TOOL_NAME = "record_rate_confirmation";

export const EXTRACTION_TOOL = {
  name: TOOL_NAME,
  description:
    "Record the fields of a freight rate confirmation exactly as printed. Never infer a value that is not on the page — return null instead.",
  input_schema: {
    type: "object" as const,
    properties: {
      broker: {
        type: ["string", "null"],
        description: "The brokerage that issued this confirmation, not the carrier being paid.",
      },
      brokerMc: { type: ["string", "null"], description: "The broker's MC number, digits only." },
      rateCents: {
        type: ["integer", "null"],
        description:
          "The total rate payable to the carrier, in INTEGER CENTS. $1,850.00 is 185000. Never dollars.",
      },
      totalMiles: { type: ["integer", "null"], description: "Loaded miles, if printed." },
      equipment: {
        type: ["string", "null"],
        enum: ["van", "reefer", "flatbed", "other", null],
      },
      references: {
        type: "array",
        items: { type: "string" },
        description: "Load, BOL, PO, pickup and delivery numbers as printed.",
      },
      stops: {
        type: "array",
        items: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["pickup", "delivery"] },
            facility: { type: ["string", "null"] },
            city: { type: "string" },
            state: { type: "string", description: "Two-letter US state code." },
            windowStart: {
              type: ["string", "null"],
              description:
                "Appointment window start as local wall time, YYYY-MM-DDTHH:MM, with no timezone.",
            },
            windowEnd: { type: ["string", "null"] },
          },
          required: ["kind", "city", "state"],
        },
      },
      fieldConfidence: {
        type: "object",
        description:
          "0-100 per field name (broker, rateCents, stops, …) — how legible that field was, not how confident you feel in general.",
        additionalProperties: { type: "integer" },
      },
    },
    required: ["broker", "brokerMc", "rateCents", "references", "stops"],
  },
};

const PROMPT = [
  "This is a freight rate confirmation sent to an owner-operator trucking company.",
  "Record what is printed on it with the record_rate_confirmation tool.",
  "",
  "Rules:",
  "- The broker is the party issuing the confirmation and paying the freight. The carrier is the party being paid. Do not confuse them.",
  "- rateCents is integer cents. Read the total payable to the carrier, including fuel surcharge if it is rolled in, excluding accessorials that are conditional.",
  "- Stops are in the order they are run: pickups before their deliveries.",
  "- Appointment windows are local wall time at the facility. Do not convert them.",
  "- If a field is not on the page, return null. Never infer, never average, never guess a city from a zip code.",
  "- fieldConfidence: score each field on how legible it was on the page.",
].join("\n");

export class ClaudeExtractor implements RateConExtractor {
  readonly source = "claude" as const;

  constructor(private readonly timeoutMs = 60_000) {}

  async extract(input: ExtractorInput): Promise<ExtractionOutcome> {
    let pageCount: number | null = null;
    if (input.pdf) pageCount = extractPdfText(input.pdf).pageCount;

    if (!input.pdf && !input.text) {
      return { ok: false, source: "claude", pageCount, reason: "Nothing to read: no PDF and no text." };
    }

    try {
      const first = await this.call(input, null);
      const validated = ExtractionSchema.safeParse(first);
      if (validated.success) {
        const { extracted, confidence } = toStoredShape(validated.data, "claude");
        return { ok: true, extracted, confidence, source: "claude" };
      }

      // One repair pass, quoting the validation error back. Anything still
      // invalid is discarded whole: a partially-merged extraction is exactly
      // the confident wrong answer this must never produce.
      const repaired = await this.call(input, formatIssues(validated.error));
      const second = ExtractionSchema.safeParse(repaired);
      if (second.success) {
        const { extracted, confidence } = toStoredShape(second.data, "claude");
        return { ok: true, extracted, confidence, source: "claude" };
      }
      return {
        ok: false,
        source: "claude",
        pageCount,
        reason:
          "The extraction came back in a shape this app could not validate, twice. " +
          "The document is filed against the load — type the fields in and it is done.",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        source: "claude",
        pageCount,
        reason: `The parser could not reach the extraction service (${message}). The document is filed; type the load in or retry.`,
      };
    }
  }

  private async call(input: ExtractorInput, repairNote: string | null): Promise<unknown> {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: env.anthropicApiKey, timeout: this.timeoutMs });

    const content: Array<Record<string, unknown>> = [];
    if (input.pdf) {
      content.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: Buffer.from(input.pdf).toString("base64"),
        },
      });
    }
    if (input.text) {
      content.push({ type: "text", text: `Text of the confirmation:\n\n${input.text.slice(0, 40_000)}` });
    }
    content.push({
      type: "text",
      text: repairNote ? `${PROMPT}\n\nYour last answer was rejected: ${repairNote}\nTry again.` : PROMPT,
    });

    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2048,
      tools: [EXTRACTION_TOOL as never],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [{ role: "user", content: content as never }],
    });

    for (const block of response.content) {
      if (block.type === "tool_use" && block.name === TOOL_NAME) return block.input;
    }
    throw new Error("the model returned no tool call");
  }
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 6)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}
