/**
 * src/lib/parse.ts
 *
 * Rate-con extraction via the Claude API — a forced tool call
 * (`record_rate_confirmation`) returning broker, MC, rate, stops with
 * windows, and reference numbers, plus per-field confidence.
 *
 * Parse honesty is a product law: confidence is stored and surfaced,
 * low-confidence fields are flagged in review, and a failed parse still
 * lands the document for manual entry.
 *
 * TODO:
 * - [ ] ExtractionSchema (zod) mirroring rate_con_drafts.extracted.
 * - [ ] extractRateCon(pdfBytes): tool_choice-forced call, one repair
 *       pass on schema mismatch, overall confidence 0-100.
 * - [ ] Broker matching: fuzzy match extracted broker/MC against the
 *       carrier's broker book; propose create-new when no match.
 */

import { z } from "zod";

export const ExtractionSchema = z.object({
  broker: z.string(),
  brokerMc: z.string().nullable(),
  rateCents: z.number().int(),
  references: z.array(z.string()),
  stops: z.array(
    z.object({
      kind: z.enum(["pickup", "delivery"]),
      facility: z.string().nullable(),
      city: z.string(),
      state: z.string(),
      windowStart: z.string().nullable(),
      windowEnd: z.string().nullable(),
    }),
  ),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

export async function extractRateCon(
  pdfBytes: Uint8Array,
): Promise<{ extraction: Extraction; confidence: number }> {
  throw new Error("Not implemented");
}
