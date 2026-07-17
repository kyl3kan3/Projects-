/**
 * src/lib/parse.ts
 *
 * ACORD 25 extraction via the Claude API — forced tool call
 * (`record_certificate`) returning carrier, producer, holder, and
 * per-line policy numbers, dates, limits, and AI/WOS checkboxes, each
 * with confidence 0-100.
 *
 * Parse honesty: any field under the review threshold (default 80)
 * sends the certificate to needs_review; a human confirms before the
 * compliance engine ever sees it. Failed parses still land the PDF.
 *
 * TODO:
 * - [ ] CertificateSchema (zod) mirroring coverages columns.
 * - [ ] extractCertificate(pdfBytes): tool_choice-forced call + one
 *       repair pass; per-field confidence.
 * - [ ] holderCheck(extractedHolder, org): fuzzy match -> holder_ok.
 */

import { z } from "zod";

export const CoverageLineSchema = z.object({
  kind: z.enum([
    "gl_each_occurrence",
    "gl_aggregate",
    "auto_combined",
    "umbrella_each",
    "wc_each_accident",
    "other",
  ]),
  label: z.string(),
  limitCents: z.number().int().nullable(),
  policyNumber: z.string().nullable(),
  effectiveOn: z.string().nullable(),
  expiresOn: z.string().nullable(),
  additionalInsured: z.boolean().nullable(),
  waiverOfSubrogation: z.boolean().nullable(),
  confidence: z.number().int().min(0).max(100),
});

export const CertificateSchema = z.object({
  carrier: z.string().nullable(),
  producer: z.string().nullable(),
  holder: z.string().nullable(),
  lines: z.array(CoverageLineSchema),
});

export type ParsedCertificate = z.infer<typeof CertificateSchema>;

export async function extractCertificate(pdfBytes: Uint8Array): Promise<ParsedCertificate> {
  throw new Error("Not implemented");
}
