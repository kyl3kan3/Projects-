/**
 * src/lib/extraction.ts
 *
 * LLM-assisted utility-bill extraction: page images in, normalized activity
 * data out, with per-field confidence. The deterministic validators here are
 * the guardrail — no silently wrong number may pass.
 *
 * TODO:
 * - [ ] extractBill(images): Claude vision call with a strict zod-validated
 *       JSON schema (provider, service address, period, quantities + units,
 *       per-field confidence 0-1); one retry on schema violation.
 * - [ ] validate(lines, site, existing): unit sanity bands (kWh per sqm,
 *       litres per period), period continuity/overlap, duplicate detection
 *       (provider + period).
 * - [ ] Confidence thresholding -> accepted | needs_review routing.
 * - [ ] DRY_RUN=1 fixture mode for local dev (no API calls).
 */

export interface ExtractedField<T> {
  value: T;
  confidence: number;
}

export type ValidationIssue =
  | { kind: "unit_out_of_band"; detail: string }
  | { kind: "period_overlap"; detail: string }
  | { kind: "duplicate_document"; detail: string };

export async function extractBill(_imageKeys: string[]): Promise<unknown> {
  throw new Error("Not implemented");
}
