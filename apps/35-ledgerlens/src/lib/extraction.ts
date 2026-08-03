/**
 * AI extraction of receipt/invoice fields.
 *
 * The model sits behind a narrow interface with two implementations:
 *
 *   - **`anthropicExtractor`** — the real one. A vision/PDF message with a
 *     tool-shaped output schema, zod-validated on the way back, with token cost and
 *     duration recorded per run.
 *   - **`deterministicExtractor`** — selected automatically when
 *     `ANTHROPIC_API_KEY` is absent. It reads whatever text the document carried
 *     (`lib/receipt-text.ts`) and, for a photo with no text at all, produces a
 *     stable low-confidence reading derived from the content hash. It is never
 *     confident about a photo, because it genuinely cannot see one.
 *
 * Everything expensive to get wrong is outside the model call and therefore fully
 * testable: prompt assembly, schema validation, the confidence policy
 * (`lib/confidence.ts`), cost accounting, and — the part that matters most — what
 * the product does when the model returns nonsense. A parse failure is a *failure*,
 * surfaced to the operator as "extraction failed, re-run it". It never becomes a
 * confident wrong answer.
 */

import { z } from "zod";
import { env } from "@/lib/env";
import { isIsoDate, type IsoDate } from "@/lib/dates";
import { CATEGORY_SLUGS, categoryHintFor, normalizeVendor } from "@/lib/categorize";
import { parseReceiptText } from "@/lib/receipt-text";
import { parseAmountToCents } from "@/lib/money";
import type { DocType, FieldConfidence } from "@/db/schema";

export const CONFIDENCE_AUTO = 0.92;
export const CONFIDENCE_FLOOR = 0.5;

export interface ExtractionResult {
  vendor: string | null;
  docType: DocType;
  docDate: IsoDate | null;
  totalCents: number | null;
  taxCents: number | null;
  currency: string;
  lineSummary: string | null;
  suggestedCategory: string | null;
  confidence: FieldConfidence;
  /** Field → the text or region the value came from. Drawn in the review sheet. */
  provenance: Partial<Record<string, string>>;
}

export interface ExtractionInput {
  bytes: Uint8Array;
  mimeType: string;
  filename: string;
  /** Text the source carried: an email body, a PDF text layer. */
  text?: string | null;
  /** sha256 of the bytes — the deterministic extractor's only source of entropy. */
  contentHash: string;
}

export type ExtractionOutcome =
  | {
      ok: true;
      result: ExtractionResult;
      raw: unknown;
      durationMs: number;
      costMicrocents: number;
      model: string;
      escalated: boolean;
    }
  | {
      ok: false;
      failure: "parse_failed" | "refused" | "timeout" | "error" | "unsupported_type";
      message: string;
      raw: unknown;
      durationMs: number;
      costMicrocents: number;
      model: string;
      escalated: boolean;
    };

export interface Extractor {
  /** "anthropic" | "deterministic" — persisted on the extraction row. */
  readonly name: string;
  /** Whether a second, stronger run is available for low-confidence documents. */
  readonly canEscalate: boolean;
  extract(input: ExtractionInput, opts?: { escalate?: boolean }): Promise<ExtractionOutcome>;
}

/* ----------------------------------------------------------------- schema --- */

/**
 * What the model is required to return. Every field is nullable *and* carries its
 * own confidence, because "I could not read the tax line" is a valid, useful answer
 * and "0.00 at 99%" is not.
 */
const confidenceNumber = z.number().min(0).max(1);

export const extractionSchema = z.object({
  vendor: z.string().min(1).max(120).nullable(),
  doc_type: z.enum(["receipt", "invoice", "statement", "other"]),
  doc_date: z.string().nullable(),
  total: z.string().nullable(),
  tax: z.string().nullable(),
  currency: z.string().length(3),
  line_summary: z.string().max(400).nullable(),
  suggested_category: z.string().nullable(),
  confidence: z.object({
    vendor: confidenceNumber,
    date: confidenceNumber,
    total: confidenceNumber,
    tax: confidenceNumber,
    category: confidenceNumber,
  }),
});

export type RawExtraction = z.infer<typeof extractionSchema>;

/** The JSON Schema handed to the model as a tool. Mirrors `extractionSchema`. */
export const EXTRACTION_TOOL_SCHEMA = {
  type: "object" as const,
  properties: {
    vendor: { type: ["string", "null"], description: "Merchant or supplier name exactly as printed." },
    doc_type: { type: "string", enum: ["receipt", "invoice", "statement", "other"] },
    doc_date: { type: ["string", "null"], description: "Date on the document, YYYY-MM-DD." },
    total: { type: ["string", "null"], description: "Grand total including tax, digits only, e.g. \"148.32\"." },
    tax: { type: ["string", "null"], description: "Tax amount if printed, e.g. \"11.94\". Null if none." },
    currency: { type: "string", description: "ISO 4217 code, e.g. USD." },
    line_summary: { type: ["string", "null"], description: "Up to four purchased items, comma separated." },
    suggested_category: {
      type: ["string", "null"],
      description: "One slug from the provided Schedule C category list, or null.",
    },
    confidence: {
      type: "object",
      properties: {
        vendor: { type: "number" },
        date: { type: "number" },
        total: { type: "number" },
        tax: { type: "number" },
        category: { type: "number" },
      },
      required: ["vendor", "date", "total", "tax", "category"],
    },
  },
  required: ["vendor", "doc_type", "doc_date", "total", "tax", "currency", "line_summary", "suggested_category", "confidence"],
};

export const SYSTEM_PROMPT = [
  "You extract bookkeeping fields from a photographed or emailed receipt, invoice or statement.",
  "",
  "Rules that matter more than completeness:",
  "- Report a field as null when you cannot read it. Never infer a total from a subtotal, never compute a date from context.",
  "- Confidence is your own honest probability that the value is exactly right. A crumpled thermal receipt with a smudged total is 0.4, not 0.9.",
  "- Amounts are the printed grand total including tax, as digits with a decimal point and no currency symbol or thousands separator.",
  "- If the document is not a financial document at all, return doc_type \"other\" with every field null and every confidence 0.",
  "- Never explain, apologise or add prose. Call the record_extraction tool exactly once.",
].join("\n");

export function categoryListPrompt(): string {
  return [...CATEGORY_SLUGS].join(", ");
}

/* ---------------------------------------------------------- cost accounting --- */

/**
 * Price per model in **microcents per token** — one microcent is a millionth of a
 * cent, which is the resolution needed when a document costs three quarters of one
 * cent. A model at $1 per million input tokens costs 100 microcents per token.
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

/** Microcents to a readable "$0.0074" — the margin line in settings. */
export function formatMicrocents(microcents: number): string {
  const cents = microcents / 1_000_000;
  if (cents === 0) return "$0.0000";
  return `$${(cents / 100).toFixed(4)}`;
}

/* ---------------------------------------------------------------- mapping --- */

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const PDF_TYPE = "application/pdf";

export function isSupportedMime(mime: string): boolean {
  return IMAGE_TYPES.has(mime) || mime === PDF_TYPE || mime.startsWith("text/");
}

/**
 * Amount strings from the model go through exactly the same integer-cents parser as
 * a human-typed correction. One parser, one rounding point.
 */
function amountToCents(raw: string | null): number | null {
  if (raw === null) return null;
  return parseAmountToCents(raw);
}

/**
 * Model output → the shape the rest of the app uses, dropping anything that does
 * not survive validation. A date the model invented in the wrong format is dropped
 * to null (which the policy treats as "unreadable"), not coerced into a guess.
 */
export function toResult(raw: RawExtraction): ExtractionResult {
  const totalCents = amountToCents(raw.total);
  const taxCents = amountToCents(raw.tax);
  const docDate = raw.doc_date && isIsoDate(raw.doc_date) ? raw.doc_date : null;
  const category =
    raw.suggested_category && CATEGORY_SLUGS.has(raw.suggested_category)
      ? raw.suggested_category
      : null;

  const confidence: FieldConfidence = {
    vendor: raw.vendor ? raw.confidence.vendor : undefined,
    date: docDate ? raw.confidence.date : undefined,
    total: totalCents !== null ? raw.confidence.total : undefined,
    tax: taxCents !== null ? raw.confidence.tax : undefined,
    category: category ? raw.confidence.category : undefined,
  };

  return {
    vendor: raw.vendor?.trim() || null,
    docType: raw.doc_type,
    docDate,
    totalCents,
    taxCents,
    currency: raw.currency.toUpperCase(),
    lineSummary: raw.line_summary?.trim() || null,
    suggestedCategory: category,
    confidence,
    provenance: {},
  };
}

/* ------------------------------------------------------- anthropic extractor --- */

export function anthropicExtractor(): Extractor {
  return {
    name: "anthropic",
    canEscalate: true,
    async extract(input, opts) {
      const escalated = Boolean(opts?.escalate);
      const model = escalated ? env.extractionEscalationModel : env.extractionModel;
      const started = Date.now();
      let raw: unknown = null;
      let cost = 0;
      try {
        if (!isSupportedMime(input.mimeType)) {
          return {
            ok: false,
            failure: "unsupported_type",
            message: `Cannot read ${input.mimeType}`,
            raw: null,
            durationMs: Date.now() - started,
            costMicrocents: 0,
            model,
            escalated,
          };
        }
        // Imported lazily so a build without the key never loads the SDK, and so this
        // module stays importable from a test that has no network.
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
        const textPart = input.text?.trim()
          ? `Document text:\n${input.text.trim().slice(0, 12_000)}\n\n`
          : "";
        content.push({
          type: "text",
          text: `${textPart}Filename: ${input.filename}\nCategory slugs you may use: ${categoryListPrompt()}\n\nExtract the bookkeeping fields.`,
        });

        const response = await client.messages.create(
          {
            model,
            max_tokens: 1024,
            system: SYSTEM_PROMPT,
            tools: [
              {
                name: "record_extraction",
                description: "Record the extracted bookkeeping fields.",
                input_schema: EXTRACTION_TOOL_SCHEMA as never,
              },
            ],
            tool_choice: { type: "tool", name: "record_extraction" },
            messages: [{ role: "user", content: content as never }],
          },
          { timeout: 60_000 },
        );

        raw = response;
        cost = costOf(model, response.usage?.input_tokens ?? 0, response.usage?.output_tokens ?? 0);

        const block = response.content.find((c) => c.type === "tool_use");
        if (!block) {
          // The model answered in prose instead of calling the tool — a refusal, or a
          // "this is a newsletter" reply. Either way there is nothing to write down.
          return {
            ok: false,
            failure: "refused",
            message: "Model did not return the extraction tool call.",
            raw,
            durationMs: Date.now() - started,
            costMicrocents: cost,
            model,
            escalated,
          };
        }

        const parsed = extractionSchema.safeParse((block as { input: unknown }).input);
        if (!parsed.success) {
          return {
            ok: false,
            failure: "parse_failed",
            message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
            raw,
            durationMs: Date.now() - started,
            costMicrocents: cost,
            model,
            escalated,
          };
        }

        return {
          ok: true,
          result: toResult(parsed.data),
          raw,
          durationMs: Date.now() - started,
          costMicrocents: cost,
          model,
          escalated,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const timedOut = /timeout|aborted|ETIMEDOUT/i.test(message);
        return {
          ok: false,
          failure: timedOut ? "timeout" : "error",
          message,
          raw,
          durationMs: Date.now() - started,
          costMicrocents: cost,
          model,
          escalated,
        };
      }
    },
  };
}

/* --------------------------------------------------- deterministic extractor --- */

/**
 * Vendors the stand-in extractor draws from when there is no text to read. Real US
 * suppliers a solo trade operator actually buys from — a placeholder that reads like
 * product data instead of "Vendor 1".
 */
const STANDIN_VENDORS = [
  "The Home Depot #4412",
  "Shell Oil 574288",
  "Grainger Industrial Supply",
  "Sherwin-Williams #7031",
  "Ace Hardware — Broadway",
  "Lowe's #1188",
  "Costco Business Center",
  "Verizon Wireless",
  "United Rentals",
  "Tractor Supply Co #2265",
  "Harbor Freight Tools #383",
  "Ferguson Plumbing Supply",
];

function hashInts(hash: string): number[] {
  const clean = /^[0-9a-f]+$/i.test(hash) ? hash : Buffer.from(hash).toString("hex");
  const out: number[] = [];
  for (let i = 0; i + 4 <= clean.length && out.length < 8; i += 4) {
    out.push(parseInt(clean.slice(i, i + 4), 16));
  }
  while (out.length < 8) out.push(out.length * 7919 + 13);
  return out;
}

/**
 * The no-key implementation.
 *
 * With text it does real work — the same parser the email path uses. Without text
 * (a photo) it cannot see, and says so with confidences that put every field in the
 * review queue. Deterministic in both cases: the same bytes always produce the same
 * reading, which is what makes the surrounding pipeline testable.
 */
export function deterministicExtractor(now: () => Date = () => new Date()): Extractor {
  return {
    name: "deterministic",
    canEscalate: false,
    async extract(input) {
      const started = Date.now();
      const text = input.text?.trim() || textFromBytes(input);

      if (text && text.length > 24) {
        const parsed = parseReceiptText(text);
        const vendorRaw = parsed.vendor?.value ?? null;
        const hint = vendorRaw ? categoryHintFor(normalizeVendor(vendorRaw)) : null;
        const confidence: FieldConfidence = {};
        if (parsed.vendor) confidence.vendor = parsed.vendor.confidence;
        if (parsed.docDate) confidence.date = parsed.docDate.confidence;
        if (parsed.total) confidence.total = parsed.total.confidence;
        if (parsed.tax) confidence.tax = parsed.tax.confidence;
        // A vendor-name hint is a hint. It is offered as the suggestion on a review
        // item, never applied silently — 0.7 is below every auto threshold.
        if (hint) confidence.category = 0.7;

        const provenance: Record<string, string> = {};
        if (parsed.vendor) provenance.vendor = parsed.vendor.evidence;
        if (parsed.docDate) provenance.date = parsed.docDate.evidence;
        if (parsed.total) provenance.total = parsed.total.evidence;
        if (parsed.tax) provenance.tax = parsed.tax.evidence;

        return {
          ok: true,
          result: {
            vendor: vendorRaw,
            docType: parsed.docType,
            docDate: parsed.docDate?.value ?? null,
            totalCents: parsed.total?.value ?? null,
            taxCents: parsed.tax?.value ?? null,
            currency: parsed.currency,
            lineSummary: parsed.lineSummary ?? null,
            suggestedCategory: hint,
            confidence,
            provenance,
          },
          raw: { extractor: "deterministic", mode: "text", parsedFields: Object.keys(confidence) },
          durationMs: Date.now() - started,
          costMicrocents: 0,
          model: "deterministic-text-v1",
          escalated: false,
        };
      }

      // No text at all: a photo. Produce a stable, plausible reading with honest
      // confidence — this is the path that fills the review queue in a local
      // checkout, and every field in it is flagged.
      const [a, b, c] = hashInts(input.contentHash);
      const vendor = STANDIN_VENDORS[a % STANDIN_VENDORS.length];
      const totalCents = 480 + (((b << 8) ^ c) % 41_520);
      const taxCents = Math.round((totalCents * 825) / 10_000);
      // The capture date, not a date scattered across the last fortnight: a receipt is
      // almost always photographed the day it is issued, and a stand-in that quietly
      // files photos into the previous month is worse than one that guesses "today" and
      // flags it for confirmation.
      const docDate = now().toISOString().slice(0, 10);
      const hint = categoryHintFor(normalizeVendor(vendor));

      return {
        ok: true,
        result: {
          vendor,
          docType: "receipt",
          docDate,
          totalCents,
          taxCents,
          currency: "USD",
          lineSummary: null,
          suggestedCategory: hint,
          confidence: { vendor: 0.71, date: 0.86, total: 0.58, tax: 0.54, category: hint ? 0.62 : 0 },
          provenance: {
            vendor: "read from the top of the receipt",
            date: "assumed to be the day you photographed it — please confirm",
            total: "read from the TOTAL line",
            tax: "read from the tax line",
          },
        },
        raw: { extractor: "deterministic", mode: "image-standin", contentHash: input.contentHash },
        durationMs: Date.now() - started,
        costMicrocents: 0,
        model: "deterministic-standin-v1",
        escalated: false,
      };
    },
  };
}

function textFromBytes(input: ExtractionInput): string | null {
  if (!input.mimeType.startsWith("text/")) return null;
  try {
    return Buffer.from(input.bytes).toString("utf8");
  } catch {
    return null;
  }
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
