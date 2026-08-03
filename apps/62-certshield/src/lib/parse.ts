/**
 * src/lib/parse.ts
 *
 * ACORD 25 extraction behind one narrow interface, with two implementations:
 *
 *  - **model** — Claude with a forced `record_certificate` tool call, used when
 *    `ANTHROPIC_API_KEY` is set. The PDF goes up as a document block; the tool's
 *    schema is the contract; the reply is validated with zod before anything
 *    touches the database.
 *  - **local** — the deterministic grammar in lib/acord.ts over text pulled out of
 *    the PDF. Used when no key is configured, and it is what the tests exercise.
 *
 * Both return the same `ExtractedCertificate`, so the review queue, the confidence
 * threshold and the compliance engine never know or care which ran.
 *
 * The rules that matter here are about honesty, not accuracy:
 *
 *  - A reply that does not validate is a **failure**, not a partial success. It is
 *    never coerced into a half-filled form, because a half-filled form with a
 *    plausible limit in it is exactly how a certificate silently enters compliance.
 *  - A failure still lands the PDF. `parsedStatus` becomes `failed`, `parseError`
 *    records why, and the review queue offers manual entry beside the document.
 *  - One repair pass, then stop. Retrying a model that returned nonsense twice
 *    usually returns nonsense a third time, more expensively.
 */

import { z } from "zod";
import {
  extractFromText,
  needsReview,
  rowConfidence,
  type ExtractedCertificate,
} from "@/lib/acord";
import { env, modelConfigured } from "@/lib/env";
import { extractPdfText } from "@/lib/pdf-text";
import { COVERAGE_LABELS } from "@/lib/format";
import type { CoverageKind } from "@/db/schema";

/* -------------------------------------------------------------------- schema */

const CONFIDENCE = z.number().int().min(0).max(100);

export const CoverageLineSchema = z.object({
  kind: z.enum([
    "gl_each_occurrence",
    "gl_aggregate",
    "auto_combined",
    "umbrella_each",
    "wc_each_accident",
    "other",
  ]),
  label: z.string().max(200).nullable(),
  limitCents: z.number().int().min(0).max(1_000_000_000_000).nullable(),
  policyNumber: z.string().max(80).nullable(),
  effectiveOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
    .nullable(),
  expiresOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
    .nullable(),
  additionalInsured: z.boolean().nullable(),
  waiverOfSubrogation: z.boolean().nullable(),
  confidence: z.object({
    limitCents: CONFIDENCE,
    policyNumber: CONFIDENCE,
    effectiveOn: CONFIDENCE,
    expiresOn: CONFIDENCE,
    additionalInsured: CONFIDENCE,
    waiverOfSubrogation: CONFIDENCE,
  }),
});

export const CertificateSchema = z.object({
  carrier: z.string().max(200).nullable(),
  producer: z.string().max(200).nullable(),
  holder: z.string().max(200).nullable(),
  confidence: z.object({
    carrier: CONFIDENCE,
    producer: CONFIDENCE,
    holder: CONFIDENCE,
  }),
  lines: z.array(CoverageLineSchema).max(40),
});

export type ModelCertificate = z.infer<typeof CertificateSchema>;

/** The JSON Schema the tool call is forced into. Kept beside the zod schema. */
export const RECORD_CERTIFICATE_TOOL = {
  name: "record_certificate",
  description:
    "Record every field read from an ACORD 25 certificate of liability insurance, with a 0-100 confidence for each field. Use 0 and null for anything the form does not show or that cannot be read — never estimate a limit, a date or a checkbox.",
  input_schema: {
    type: "object" as const,
    required: ["carrier", "producer", "holder", "confidence", "lines"],
    properties: {
      carrier: { type: ["string", "null"], description: "Insurer A's company name." },
      producer: { type: ["string", "null"], description: "The producing agency's name." },
      holder: { type: ["string", "null"], description: "The CERTIFICATE HOLDER box, verbatim." },
      confidence: {
        type: "object",
        required: ["carrier", "producer", "holder"],
        properties: {
          carrier: { type: "integer", minimum: 0, maximum: 100 },
          producer: { type: "integer", minimum: 0, maximum: 100 },
          holder: { type: "integer", minimum: 0, maximum: 100 },
        },
      },
      lines: {
        type: "array",
        items: {
          type: "object",
          required: [
            "kind",
            "label",
            "limitCents",
            "policyNumber",
            "effectiveOn",
            "expiresOn",
            "additionalInsured",
            "waiverOfSubrogation",
            "confidence",
          ],
          properties: {
            kind: {
              type: "string",
              enum: [
                "gl_each_occurrence",
                "gl_aggregate",
                "auto_combined",
                "umbrella_each",
                "wc_each_accident",
                "other",
              ],
            },
            label: { type: ["string", "null"] },
            limitCents: {
              type: ["integer", "null"],
              description: "The limit in cents. $1,000,000 is 100000000.",
            },
            policyNumber: { type: ["string", "null"] },
            effectiveOn: { type: ["string", "null"], description: "YYYY-MM-DD" },
            expiresOn: { type: ["string", "null"], description: "YYYY-MM-DD" },
            additionalInsured: {
              type: ["boolean", "null"],
              description: "The ADDL INSD column. null when the column is blank.",
            },
            waiverOfSubrogation: {
              type: ["boolean", "null"],
              description: "The SUBR WVD column. null when the column is blank.",
            },
            confidence: {
              type: "object",
              required: [
                "limitCents",
                "policyNumber",
                "effectiveOn",
                "expiresOn",
                "additionalInsured",
                "waiverOfSubrogation",
              ],
              properties: {
                limitCents: { type: "integer", minimum: 0, maximum: 100 },
                policyNumber: { type: "integer", minimum: 0, maximum: 100 },
                effectiveOn: { type: "integer", minimum: 0, maximum: 100 },
                expiresOn: { type: "integer", minimum: 0, maximum: 100 },
                additionalInsured: { type: "integer", minimum: 0, maximum: 100 },
                waiverOfSubrogation: { type: "integer", minimum: 0, maximum: 100 },
              },
            },
          },
        },
      },
    },
  },
};

export const SYSTEM_PROMPT = [
  "You read ACORD 25 certificates of liability insurance and record exactly what the form says.",
  "",
  "Rules, in order of importance:",
  "1. Never estimate. If a limit, date or checkbox is not legible on the form, record null and confidence 0.",
  "2. A blank ADDL INSD or SUBR WVD column is null, not false. Blank means the form does not say.",
  "3. Limits are integer cents: $1,000,000 is 100000000.",
  "4. Dates are YYYY-MM-DD. A two-digit year on the form is a guess about the century — record the date and drop its confidence below 70.",
  "5. One line per printed limit, not per policy: a general liability policy showing each-occurrence and general-aggregate is two lines sharing one policy number.",
  "6. Confidence is about legibility and certainty, not about whether the coverage looks adequate. Judging adequacy is not your job.",
].join("\n");

export function buildUserPrompt(filename?: string): string {
  return [
    "Read this certificate of insurance and call record_certificate with every field it shows.",
    filename ? `The file is named ${filename}.` : "",
    "If the document is not an ACORD 25 or any certificate of insurance, call record_certificate with empty lines and confidence 0 throughout rather than describing the document.",
  ]
    .filter(Boolean)
    .join(" ");
}

/* ------------------------------------------------------------------ outcome */

export interface ExtractionUsage {
  inputTokens: number;
  outputTokens: number;
  /** Rounded to the nearest cent, once, at this edge. */
  costCents: number;
}

export type ExtractionOutcome =
  | {
      ok: true;
      via: "model" | "local";
      certificate: ExtractedCertificate;
      usage?: ExtractionUsage;
      /** True when a repair pass was needed. Worth surfacing in the audit log. */
      repaired?: boolean;
    }
  | { ok: false; via: "model" | "local"; error: string; usage?: ExtractionUsage };

/* ------------------------------------------------------------- model client */

/**
 * The narrowest slice of the Messages API this needs. A seam, so the whole model
 * path — prompt assembly, tool-call location, schema validation, the repair pass,
 * cost accounting, and every way a model can misbehave — is testable with no key
 * and no network.
 */
export interface ModelMessage {
  role: "user" | "assistant";
  content: unknown;
}

export interface ModelRequest {
  model: string;
  system: string;
  messages: ModelMessage[];
  tools: unknown[];
  toolChoice: { type: "tool"; name: string };
  maxTokens: number;
}

export interface ModelResponseBlock {
  type: string;
  name?: string;
  input?: unknown;
  text?: string;
}

export interface ModelResponse {
  content: ModelResponseBlock[];
  stopReason?: string | null;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface ModelClient {
  create(req: ModelRequest): Promise<ModelResponse>;
}

/** Sonnet list price, Feb 2026: $3/MTok in, $15/MTok out. */
const COST_PER_MTOK_IN_CENTS = { input: 300, output: 1500 };

function priceOf(usage: ModelResponse["usage"]): ExtractionUsage | undefined {
  if (!usage) return undefined;
  const cents =
    (usage.inputTokens / 1_000_000) * COST_PER_MTOK_IN_CENTS.input +
    (usage.outputTokens / 1_000_000) * COST_PER_MTOK_IN_CENTS.output;
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    costCents: Math.round(cents),
  };
}

function toExtracted(parsed: ModelCertificate): ExtractedCertificate {
  return {
    carrier: parsed.carrier,
    producer: parsed.producer,
    holder: parsed.holder,
    fieldConfidence: { ...parsed.confidence },
    lines: parsed.lines.map((l) => ({
      kind: l.kind as CoverageKind,
      label: l.label ?? COVERAGE_LABELS[l.kind as CoverageKind],
      limitCents: l.limitCents,
      policyNumber: l.policyNumber,
      effectiveOn: l.effectiveOn,
      expiresOn: l.expiresOn,
      additionalInsured: l.additionalInsured,
      waiverOfSubrogation: l.waiverOfSubrogation,
      fieldConfidence: { ...l.confidence },
    })),
  };
}

function firstToolUse(res: ModelResponse): { input: unknown } | null {
  const block = res.content?.find((b) => b.type === "tool_use" && b.name === RECORD_CERTIFICATE_TOOL.name);
  return block ? { input: block.input } : null;
}

function describeRefusal(res: ModelResponse): string {
  const text = res.content
    ?.filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join(" ")
    .trim();
  if (res.stopReason === "max_tokens") {
    return "The extraction was cut off before the model finished the certificate. Nothing was recorded.";
  }
  if (text) {
    return `The extractor answered in prose instead of recording the certificate: "${text.slice(0, 240)}"`;
  }
  return "The extractor returned no certificate data.";
}

function zodMessage(err: z.ZodError): string {
  const first = err.issues[0];
  const path = first?.path?.join(".") || "the reply";
  return `${path}: ${first?.message ?? "did not match the expected shape"}`;
}

export interface ModelExtractOptions {
  model?: string;
  maxTokens?: number;
  filename?: string;
  /** Milliseconds before the call is abandoned. */
  timeoutMs?: number;
}

/**
 * Run the model path against an injected client. Exported for tests; production
 * goes through `getExtractor()`.
 */
export async function extractWithModel(
  client: ModelClient,
  bytes: Uint8Array,
  opts: ModelExtractOptions = {},
): Promise<ExtractionOutcome> {
  const model = opts.model ?? env.parseModel;
  const maxTokens = opts.maxTokens ?? 4096;
  const base64 = Buffer.from(bytes).toString("base64");

  const documentBlock = {
    type: "document",
    source: { type: "base64", media_type: "application/pdf", data: base64 },
  };

  const messages: ModelMessage[] = [
    {
      role: "user",
      content: [documentBlock, { type: "text", text: buildUserPrompt(opts.filename) }],
    },
  ];

  let usage: ExtractionUsage | undefined;
  let lastError = "The extractor returned nothing.";

  // One attempt, then one repair pass that shows the model its own error. No
  // third try: a reply that failed a schema twice is not going to pass on a whim,
  // and every attempt costs the customer money.
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: ModelResponse;
    try {
      res = await withTimeout(
        client.create({
          model,
          system: SYSTEM_PROMPT,
          messages,
          tools: [RECORD_CERTIFICATE_TOOL],
          toolChoice: { type: "tool", name: RECORD_CERTIFICATE_TOOL.name },
          maxTokens,
        }),
        opts.timeoutMs ?? 90_000,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        via: "model",
        usage,
        error:
          message === "timeout"
            ? "The extractor did not answer within 90 seconds. The certificate is stored and can be entered by hand."
            : `The extractor could not be reached: ${message}`,
      };
    }

    const priced = priceOf(res.usage);
    if (priced) {
      usage = usage
        ? {
            inputTokens: usage.inputTokens + priced.inputTokens,
            outputTokens: usage.outputTokens + priced.outputTokens,
            costCents: usage.costCents + priced.costCents,
          }
        : priced;
    }

    const tool = firstToolUse(res);
    if (!tool) {
      lastError = describeRefusal(res);
      if (attempt === 0) {
        messages.push({ role: "assistant", content: res.content });
        messages.push({
          role: "user",
          content: `You did not call ${RECORD_CERTIFICATE_TOOL.name}. Call it now with whatever the form shows, using null and confidence 0 for anything unreadable.`,
        });
        continue;
      }
      return { ok: false, via: "model", error: lastError, usage };
    }

    const parsed = CertificateSchema.safeParse(tool.input);
    if (parsed.success) {
      return {
        ok: true,
        via: "model",
        certificate: toExtracted(parsed.data),
        usage,
        repaired: attempt > 0,
      };
    }

    lastError = `The extractor's reply did not match the certificate schema (${zodMessage(parsed.error)}).`;
    if (attempt === 0) {
      messages.push({ role: "assistant", content: res.content });
      messages.push({
        role: "user",
        content: `That tool call was rejected: ${zodMessage(
          parsed.error,
        )}. Call ${RECORD_CERTIFICATE_TOOL.name} again with a valid payload.`,
      });
      continue;
    }
    return { ok: false, via: "model", error: lastError, usage };
  }

  return { ok: false, via: "model", error: lastError, usage };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/* -------------------------------------------------------------- local path */

/**
 * The deterministic path: text out of the PDF, then the ACORD grammar. A PDF with
 * no text layer is a scan, and a scan is a failure with a sentence a coordinator
 * can act on — not an empty certificate.
 */
export function extractLocally(bytes: Uint8Array): ExtractionOutcome {
  const read = extractPdfText(bytes);
  if (!read.text) {
    return {
      ok: false,
      via: "local",
      error:
        "No text could be read from this PDF — it is most likely a scan or a photograph. The document is stored; enter the coverage by hand or ask the agent to send the certificate as a text PDF.",
    };
  }
  const certificate = extractFromText(read.text);
  if (!certificate.lines.length) {
    return {
      ok: false,
      via: "local",
      error:
        "This document has readable text but no ACORD coverage table in it, so no policy lines could be recorded. The document is stored; check it is the certificate and not a cover letter.",
    };
  }
  return { ok: true, via: "local", certificate };
}

/* ------------------------------------------------------------- the extractor */

export interface Extractor {
  readonly name: "model" | "local";
  extract(bytes: Uint8Array, opts?: { filename?: string }): Promise<ExtractionOutcome>;
}

/** The live Anthropic client, adapted to `ModelClient`. Loaded only when used. */
function anthropicClient(): ModelClient {
  return {
    async create(req) {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });
      const res = await anthropic.messages.create({
        model: req.model,
        max_tokens: req.maxTokens,
        system: req.system,
        // The seam's types are deliberately loose: the SDK's content-block unions
        // are wide, and narrowing them here would buy nothing testable.
        messages: req.messages as never,
        tools: req.tools as never,
        tool_choice: { type: "tool", name: req.toolChoice.name },
      });
      return {
        content: res.content as ModelResponseBlock[],
        stopReason: res.stop_reason,
        usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
      };
    },
  };
}

export function getExtractor(): Extractor {
  if (modelConfigured()) {
    return {
      name: "model",
      extract: (bytes, opts) => extractWithModel(anthropicClient(), bytes, opts),
    };
  }
  return {
    name: "local",
    extract: async (bytes) => extractLocally(bytes),
  };
}

/* ------------------------------------------------------------------ helpers */

/** `parsed` when every field clears the bar, `needs_review` when any does not. */
export function statusFor(
  certificate: ExtractedCertificate,
  threshold = env.reviewThreshold,
): "parsed" | "needs_review" {
  return needsReview(certificate, threshold) ? "needs_review" : "parsed";
}

export { rowConfidence };
