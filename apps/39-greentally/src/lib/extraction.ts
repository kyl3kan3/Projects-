/**
 * Utility-bill extraction.
 *
 * The model sits behind a narrow interface with two implementations:
 *
 *  - **`anthropicExtractor`** — the real one. A vision/PDF message with a
 *    tool-shaped output schema, zod-validated on the way back, with token cost and
 *    duration recorded per run. It is given the PDF's text layer as well as the
 *    document itself, because a model that can read the characters does not have to
 *    guess at a picture of them.
 *  - **`deterministicExtractor`** — selected automatically when
 *    `ANTHROPIC_API_KEY` is absent. It reads the text layer with
 *    `lib/bill-text.ts`, and for a scanned bill with no text at all it returns a
 *    *failure*, not a reading. It cannot see an image and does not pretend to.
 *
 * Everything expensive to get wrong sits outside the model call and is therefore
 * fully testable: prompt assembly, schema validation, unit conversion, the
 * confidence policy, cost accounting, and — the part that matters most — what the
 * product does when the model returns nonsense. A parse failure is a failure,
 * surfaced as "we could not read this bill, here are the fields to type in". It
 * never becomes a confident wrong number.
 */

import { z } from "zod";
import { env } from "@/lib/env";
import { readBillText, type BillReading } from "@/lib/bill-text";
import { pdfText, looksLikePdf } from "@/lib/pdf-text";
import { convertToCanonical } from "@/lib/units";
import type { ActivityCategory, FieldConfidences, FieldEvidence } from "@/db/schema";

/** At or above this, every field is trusted and the document is auto-accepted. */
export const AUTO_ACCEPT_BP = 9_200;

export interface ExtractedLine {
  category: ActivityCategory;
  /** Canonical quantity × 1000. */
  quantityMilli: number;
  unit: "kWh" | "L";
  sourceQuantity: string;
  sourceUnit: string;
  serviceStart: string;
  serviceEnd: string;
  provider: string;
  fieldConfidences: FieldConfidences;
  evidence: FieldEvidence;
}

export interface ExtractionReading {
  provider: string | null;
  serviceAddress: string | null;
  lines: ExtractedLine[];
  /** Minimum confidence across every field of every line. */
  confidenceBp: number;
}

export type ExtractionOutcome =
  | {
      ok: true;
      reading: ExtractionReading;
      extractor: string;
      model: string;
      durationMs: number;
      costMicrocents: number;
      raw: unknown;
    }
  | {
      ok: false;
      failure: "no_text" | "parse_failed" | "refused" | "timeout" | "error" | "unsupported_type";
      message: string;
      extractor: string;
      model: string;
      durationMs: number;
      costMicrocents: number;
      raw: unknown;
    };

export interface ExtractionInput {
  bytes: Uint8Array;
  mimeType: string;
  filename: string;
  contentHash: string;
}

export interface Extractor {
  readonly name: string;
  extract(input: ExtractionInput): Promise<ExtractionOutcome>;
}

/* ------------------------------------------------------------------ schema --- */

const confidence = z.number().min(0).max(1);

export const billSchema = z.object({
  provider: z.string().min(1).max(120).nullable(),
  service_address: z.string().max(200).nullable(),
  lines: z
    .array(
      z.object({
        category: z.enum([
          "electricity_kwh",
          "natural_gas_kwh",
          "diesel_l",
          "petrol_l",
          "heating_oil_l",
          "propane_l",
        ]),
        quantity: z.string().min(1).max(24),
        unit: z.string().min(1).max(16),
        period_start: z.string().min(8).max(10),
        period_end: z.string().min(8).max(10),
        confidence: z.object({
          quantity: confidence,
          period: confidence,
          provider: confidence,
          category: confidence,
        }),
        evidence: z.object({
          quantity: z.string().max(200),
          period: z.string().max(200),
        }),
      }),
    )
    .max(12),
});

export type RawBill = z.infer<typeof billSchema>;

/** The JSON Schema handed to the model as a tool. Mirrors `billSchema`. */
export const BILL_TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    provider: { type: ["string", "null"], description: "Utility or supplier name exactly as printed." },
    service_address: { type: ["string", "null"], description: "Service address if printed." },
    lines: {
      type: "array",
      description: "One entry per billed quantity. A dual-fuel bill has two.",
      items: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: [
              "electricity_kwh",
              "natural_gas_kwh",
              "diesel_l",
              "petrol_l",
              "heating_oil_l",
              "propane_l",
            ],
          },
          quantity: { type: "string", description: 'Digits as printed, e.g. "4182" or "486.4". No unit, no commas.' },
          unit: { type: "string", description: 'Unit exactly as printed: kWh, MWh, therms, CCF, MCF, m3, gal, L.' },
          period_start: { type: "string", description: "Service period start, YYYY-MM-DD." },
          period_end: { type: "string", description: "Service period end, YYYY-MM-DD." },
          confidence: {
            type: "object",
            properties: {
              quantity: { type: "number" },
              period: { type: "number" },
              provider: { type: "number" },
              category: { type: "number" },
            },
            required: ["quantity", "period", "provider", "category"],
          },
          evidence: {
            type: "object",
            properties: {
              quantity: { type: "string", description: "The line of the bill the quantity was read from." },
              period: { type: "string", description: "The line the service period was read from." },
            },
            required: ["quantity", "period"],
          },
        },
        required: ["category", "quantity", "unit", "period_start", "period_end", "confidence", "evidence"],
      },
    },
  },
  required: ["provider", "service_address", "lines"],
};

export const SYSTEM_PROMPT = [
  "You read utility bills and fuel receipts for a greenhouse-gas inventory. You extract only what is printed.",
  "",
  "Rules that matter more than completeness:",
  "- Report the quantity in the unit the bill prints it in. Never convert. CCF is not therms, therms are not kWh.",
  "- If the service period is not printed, omit the line entirely. Do not infer a period from a statement date, a due date, or the month name in a filename.",
  "- Confidence is your own honest probability that the value is exactly right. A smudged fax of a bill with an ambiguous slashed date is 0.5, not 0.9.",
  "- Evidence is the literal line of the bill you read the value from, copied verbatim.",
  "- A bill covering both electricity and gas produces two lines. A summary page covering three months produces three lines only if each month's quantity is printed separately.",
  "- If the document is not a utility bill or fuel receipt, return an empty lines array.",
  "- Never explain or apologise. Call the record_bill tool exactly once.",
].join("\n");

/* --------------------------------------------------------- cost accounting --- */

/**
 * Price per model in **microcents per token** — a millionth of a cent, which is the
 * resolution needed when a bill page costs a third of a cent.
 */
const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 100, output: 500 },
  "claude-haiku-4-5": { input: 100, output: 500 },
  "claude-sonnet-5": { input: 300, output: 1_500 },
  "claude-opus-5": { input: 1_500, output: 7_500 },
};

const FALLBACK_PRICE = { input: 300, output: 1_500 };

export function costOf(model: string, inputTokens: number, outputTokens: number): number {
  const price = MODEL_PRICES[model] ?? FALLBACK_PRICE;
  return Math.round(inputTokens * price.input + outputTokens * price.output);
}

/** Microcents to a readable "$0.0034" — the cost line in settings. */
export function formatMicrocents(microcents: number): string {
  return `$${(microcents / 1_000_000 / 100).toFixed(4)}`;
}

/* ----------------------------------------------------------------- mapping --- */

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PDF_TYPE = "application/pdf";

export function isSupportedMime(mime: string): boolean {
  return IMAGE_TYPES.has(mime) || mime === PDF_TYPE || mime.startsWith("text/");
}

const bp = (n: number) => Math.max(0, Math.min(10_000, Math.round(n * 10_000)));

/**
 * Model output → the shape the rest of the app uses.
 *
 * A line whose unit cannot be converted for its category is **dropped**, and the
 * caller sees fewer lines than the model claimed. That is deliberate: 4,182 in an
 * unrecognised unit is not a number this product is willing to multiply by a factor.
 */
export function toReading(raw: RawBill): { reading: ExtractionReading; dropped: string[] } {
  const dropped: string[] = [];
  const lines: ExtractedLine[] = [];

  for (const l of raw.lines) {
    const qty = Number(l.quantity.replace(/,/g, ""));
    if (!Number.isFinite(qty) || qty <= 0) {
      dropped.push(`quantity "${l.quantity}" is not a number`);
      continue;
    }
    const conv = convertToCanonical(l.category, qty, l.unit);
    if (!conv) {
      dropped.push(`unit "${l.unit}" is not a unit of ${l.category}`);
      continue;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(l.period_start) || !/^\d{4}-\d{2}-\d{2}$/.test(l.period_end)) {
      dropped.push(`service period "${l.period_start}..${l.period_end}" is not two ISO dates`);
      continue;
    }
    if (l.period_end <= l.period_start) {
      dropped.push(`service period ends before it starts (${l.period_start}..${l.period_end})`);
      continue;
    }
    lines.push({
      category: l.category,
      quantityMilli: conv.quantityMilli,
      unit: conv.canonicalUnit,
      sourceQuantity: l.quantity,
      sourceUnit: conv.sourceUnitDisplay,
      serviceStart: l.period_start,
      serviceEnd: l.period_end,
      provider: raw.provider ?? "",
      fieldConfidences: {
        quantity: bp(l.confidence.quantity),
        period: bp(l.confidence.period),
        provider: bp(l.confidence.provider),
        category: bp(l.confidence.category),
      },
      evidence: { quantity: l.evidence.quantity, period: l.evidence.period },
    });
  }

  return {
    reading: {
      provider: raw.provider,
      serviceAddress: raw.service_address,
      lines,
      confidenceBp: minConfidence(lines),
    },
    dropped,
  };
}

/**
 * The document's confidence: the minimum across the fields that can change a number.
 *
 * `provider` is deliberately excluded. It is read from the top of the bill and an
 * unrecognised utility name scores low by design, but the provider does not enter any
 * arithmetic — and the double-count guard does not depend on it either, because the
 * period-overlap check keys on (site, category, dates). Including it meant every bill from
 * a municipal utility landed in the review queue with a perfectly-read quantity. The
 * provider's own confidence is still stored and still shown on the review screen.
 */
export function minConfidence(lines: ExtractedLine[]): number {
  if (lines.length === 0) return 0;
  let min = 10_000;
  for (const l of lines) {
    for (const key of ["quantity", "period", "category"] as const) {
      const v = l.fieldConfidences[key];
      if (typeof v === "number" && v < min) min = v;
    }
  }
  return min;
}

/* ------------------------------------------------------- anthropic extractor --- */

export function anthropicExtractor(): Extractor {
  return {
    name: "anthropic",
    async extract(input) {
      const model = env.extractionModel;
      const started = Date.now();
      let raw: unknown = null;
      let cost = 0;
      const fail = (
        failure: Extract<ExtractionOutcome, { ok: false }>["failure"],
        message: string,
      ): ExtractionOutcome => ({
        ok: false,
        failure,
        message,
        extractor: "anthropic",
        model,
        durationMs: Date.now() - started,
        costMicrocents: cost,
        raw,
      });

      if (!isSupportedMime(input.mimeType)) {
        return fail("unsupported_type", `Cannot read ${input.mimeType}`);
      }

      try {
        // Imported lazily so a build without the key never loads the SDK, and so this
        // module stays importable from a test with no network.
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        const client = new Anthropic({ apiKey: env.anthropicApiKey, maxRetries: 2 });

        const content: Record<string, unknown>[] = [];
        if (IMAGE_TYPES.has(input.mimeType)) {
          content.push({
            type: "image",
            source: {
              type: "base64",
              media_type: input.mimeType,
              data: Buffer.from(input.bytes).toString("base64"),
            },
          });
        } else if (input.mimeType === PDF_TYPE) {
          content.push({
            type: "document",
            source: {
              type: "base64",
              media_type: PDF_TYPE,
              data: Buffer.from(input.bytes).toString("base64"),
            },
          });
        }

        const layer = textLayer(input);
        content.push({
          type: "text",
          text: [
            layer ? `Text layer of the document:\n${layer.slice(0, 12_000)}\n` : "",
            `Filename: ${input.filename}`,
            "",
            "Extract the billed quantities.",
          ].join("\n"),
        });

        const response = await client.messages.create(
          {
            model,
            max_tokens: 2048,
            system: SYSTEM_PROMPT,
            tools: [
              {
                name: "record_bill",
                description: "Record the quantities printed on this bill.",
                input_schema: BILL_TOOL_SCHEMA as never,
              },
            ],
            tool_choice: { type: "tool", name: "record_bill" },
            messages: [{ role: "user", content: content as never }],
          },
          { timeout: 90_000 },
        );

        raw = response;
        cost = costOf(model, response.usage?.input_tokens ?? 0, response.usage?.output_tokens ?? 0);

        const block = response.content.find((c) => c.type === "tool_use");
        if (!block) {
          // Prose instead of a tool call: a refusal, or "this is a newsletter". Either
          // way there is nothing to write down.
          return fail("refused", "Model did not return the extraction tool call.");
        }

        const parsed = billSchema.safeParse((block as { input: unknown }).input);
        if (!parsed.success) {
          return fail(
            "parse_failed",
            parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
          );
        }

        const { reading, dropped } = toReading(parsed.data);
        if (reading.lines.length === 0) {
          return fail(
            "parse_failed",
            dropped.length > 0
              ? `No usable line survived validation: ${dropped.join("; ")}`
              : "The model found no billed quantity in this document.",
          );
        }

        return {
          ok: true,
          reading,
          extractor: "anthropic",
          model,
          durationMs: Date.now() - started,
          costMicrocents: cost,
          raw: { dropped, usage: response.usage },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const timedOut = /timeout|aborted|ETIMEDOUT/i.test(message);
        return fail(timedOut ? "timeout" : "error", message);
      }
    },
  };
}

/* --------------------------------------------------- deterministic extractor --- */

function textLayer(input: ExtractionInput): string {
  if (input.mimeType.startsWith("text/")) {
    return Buffer.from(input.bytes).toString("utf8");
  }
  if (input.mimeType === PDF_TYPE || looksLikePdf(input.bytes)) {
    return pdfText(input.bytes);
  }
  return "";
}

/**
 * The no-key implementation.
 *
 * With a text layer it does real work: the same reader the model's output is checked
 * against. Without one — a photograph, a scan — it returns a failure. It genuinely
 * cannot see an image, and a plausible stand-in reading of a bill would be the single
 * most dangerous thing this codebase could contain.
 */
export function deterministicExtractor(): Extractor {
  return {
    name: "deterministic",
    async extract(input) {
      const started = Date.now();
      const base = {
        extractor: "deterministic",
        model: "text-layer-v1",
        costMicrocents: 0,
      };
      const text = textLayer(input);
      if (!text || text.trim().length < 24) {
        return {
          ok: false,
          failure: "no_text",
          message:
            "This file carries no text layer, so it can only be read by the vision extractor. Set ANTHROPIC_API_KEY, or type the figures in on the review screen.",
          raw: { bytes: input.bytes.length, mimeType: input.mimeType },
          durationMs: Date.now() - started,
          ...base,
        };
      }

      const reading = readBillText(text);
      const line = toExtractedLine(reading);
      if (!line) {
        return {
          ok: false,
          failure: "parse_failed",
          message: describeIncomplete(reading),
          raw: { mode: "text-layer", chars: text.length },
          durationMs: Date.now() - started,
          ...base,
        };
      }

      return {
        ok: true,
        reading: {
          provider: reading.provider?.value ?? null,
          serviceAddress: reading.serviceAddress,
          lines: [line],
          confidenceBp: minConfidence([line]),
        },
        raw: { mode: "text-layer", chars: text.length },
        durationMs: Date.now() - started,
        ...base,
      };
    },
  };
}

function toExtractedLine(r: BillReading): ExtractedLine | null {
  if (!r.quantity || !r.category || !r.period) return null;
  const conv = convertToCanonical(
    r.category.value,
    r.quantity.value.quantity,
    r.quantity.value.unit,
  );
  if (!conv) return null;
  return {
    category: r.category.value,
    quantityMilli: conv.quantityMilli,
    unit: conv.canonicalUnit,
    sourceQuantity: String(r.quantity.value.quantity),
    sourceUnit: conv.sourceUnitDisplay,
    serviceStart: r.period.value.start,
    serviceEnd: r.period.value.end,
    provider: r.provider?.value ?? "",
    fieldConfidences: {
      quantity: r.quantity.confidenceBp,
      period: r.period.confidenceBp,
      provider: r.provider?.confidenceBp ?? 0,
      category: r.category.confidenceBp,
    },
    evidence: {
      quantity: r.quantity.evidence,
      period: r.period.evidence,
      provider: r.provider?.evidence,
    },
  };
}

function describeIncomplete(r: BillReading): string {
  const missing: string[] = [];
  if (!r.quantity) missing.push("the billed quantity");
  if (!r.period) missing.push("the service period");
  if (!r.category) missing.push("what was billed");
  if (missing.length === 0) {
    return "The quantity was printed in a unit this reader does not recognise.";
  }
  return `Could not find ${missing.join(" or ")} in this document. Type the figures in below.`;
}

/* ------------------------------------------------------------------ select --- */

let _override: Extractor | null = null;

/** Test seam: swap the extractor for the duration of a test. */
export function setExtractor(extractor: Extractor | null): void {
  _override = extractor;
}

export function getExtractor(): Extractor {
  if (_override) return _override;
  return env.anthropicApiKey ? anthropicExtractor() : deterministicExtractor();
}

export function extractorIsLive(): boolean {
  return Boolean(env.anthropicApiKey);
}
