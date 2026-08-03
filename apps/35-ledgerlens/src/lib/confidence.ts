/**
 * The confidence policy — the product's central promise.
 *
 * "Extraction errors destroy trust. One wrong total in a tax export is worse than
 * no product" (README, Key Risks). So the thresholds live here, in one file, as
 * constants, and every decision the extractor's output drives goes through
 * `decide()`:
 *
 *   - a field at or above `auto` is applied without asking;
 *   - a field below `auto` becomes a review item — flagged, never guessed;
 *   - a document whose overall confidence is below `floor` is **rejected** with a
 *     retake prompt rather than filling the review queue with garbage;
 *   - a document between `floor` and `escalate` is re-run on the stronger model
 *     before an operator is asked to do anything.
 *
 * The line item that comes out of a `needs_review` decision is a *draft*
 * (`confirmed_at` null) and the export layer filters drafts out. That is the gate:
 * nothing below threshold reaches an export unreviewed.
 */

import type { FieldConfidence, ReviewField } from "@/db/schema";

export const CONFIDENCE_AUTO = 0.92;
export const CONFIDENCE_FLOOR = 0.5;
export const CONFIDENCE_ESCALATE = 0.8;

export interface ConfidencePolicy {
  /** At or above: applied silently. */
  auto: number;
  /** Below: the document is unusable — ask for a retake, do not queue a review. */
  floor: number;
  /** Overall below this (but above the floor): re-run on the escalation model. */
  escalate: number;
}

export const DEFAULT_POLICY: ConfidencePolicy = {
  auto: CONFIDENCE_AUTO,
  floor: CONFIDENCE_FLOOR,
  escalate: CONFIDENCE_ESCALATE,
};

/**
 * Weights for the overall score. The total dominates because it is the number that
 * ends up on a tax return; a wrong tax split costs a rounding error, a wrong total
 * costs an audit.
 */
export const FIELD_WEIGHTS: Record<ReviewField, number> = {
  total: 4,
  vendor: 2,
  date: 2,
  category: 1,
  tax: 1,
};

/** The fields a review sheet can ask about, in the order the sheet shows them. */
export const REVIEW_FIELDS: ReviewField[] = ["vendor", "date", "total", "tax", "category"];

/** 0–1 to basis points. Comparisons and storage use the integer; only display uses the float. */
export function toBp(confidence: number): number {
  if (!Number.isFinite(confidence)) return 0;
  return Math.max(0, Math.min(10_000, Math.round(confidence * 10_000)));
}

export function fromBp(bp: number): number {
  return bp / 10_000;
}

/** "61%" — how a confidence is printed beside a flagged field. */
export function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

/**
 * Weighted mean over the fields actually present. A receipt with no tax line is not
 * a less confident receipt, so an absent field contributes nothing at all rather
 * than contributing a zero.
 */
export function overallConfidence(confidence: FieldConfidence): number {
  let weighted = 0;
  let weight = 0;
  for (const field of REVIEW_FIELDS) {
    const value = confidence[field];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    weighted += value * FIELD_WEIGHTS[field];
    weight += FIELD_WEIGHTS[field];
  }
  return weight === 0 ? 0 : weighted / weight;
}

export interface FlaggedField {
  field: ReviewField;
  confidence: number;
}

export type Decision =
  | { status: "confirmed"; overall: number; flagged: [] }
  | { status: "needs_review"; overall: number; flagged: FlaggedField[] }
  | {
      status: "rejected";
      overall: number;
      flagged: [];
      reason: "unreadable" | "no_total" | "no_vendor" | "no_date";
    };

export interface DecisionInput {
  /** Which fields the extractor actually produced a value for. */
  present: Partial<Record<ReviewField, boolean>>;
  confidence: FieldConfidence;
}

/**
 * Turn an extraction into a document status plus the list of fields to flag.
 *
 * Pure, and deliberately unaware of the database: the same function decides for a
 * live model response, for the deterministic extractor, and in the tests that prove
 * the gate holds.
 */
export function decide(input: DecisionInput, policy: ConfidencePolicy = DEFAULT_POLICY): Decision {
  const overall = overallConfidence(input.confidence);

  // A document missing any of the three fields an export row needs is not a
  // low-confidence document, it is an unreadable one. Asking an operator to review
  // five empty fields is worse than asking for a better photo.
  if (!input.present.total) return { status: "rejected", overall, flagged: [], reason: "no_total" };
  if (!input.present.vendor) {
    return { status: "rejected", overall, flagged: [], reason: "no_vendor" };
  }
  if (!input.present.date) return { status: "rejected", overall, flagged: [], reason: "no_date" };
  if (overall < policy.floor) {
    return { status: "rejected", overall, flagged: [], reason: "unreadable" };
  }

  const flagged: FlaggedField[] = [];
  for (const field of REVIEW_FIELDS) {
    if (!input.present[field]) continue;
    const value = input.confidence[field];
    // A present field with no confidence reported is treated as unconfident: the
    // absence of a score is not evidence of a good reading.
    const c = typeof value === "number" && Number.isFinite(value) ? value : 0;
    if (c < policy.auto) flagged.push({ field, confidence: c });
  }

  if (flagged.length === 0) return { status: "confirmed", overall, flagged: [] };
  return { status: "needs_review", overall, flagged };
}

/** True when the document should be re-run on the stronger model before review. */
export function shouldEscalate(
  overall: number,
  alreadyEscalated: boolean,
  policy: ConfidencePolicy = DEFAULT_POLICY,
): boolean {
  return !alreadyEscalated && overall >= policy.floor && overall < policy.escalate;
}

/** Plain-English copy for a rejection, shown on the document and in the inbox row. */
export function rejectionCopy(reason: string | null): string {
  switch (reason) {
    case "no_total":
      return "No total could be read on this document.";
    case "no_vendor":
      return "No vendor name could be read on this document.";
    case "no_date":
      return "No date could be read on this document.";
    case "unreadable":
      return "This scan was too unclear to read. Retake the photo in better light.";
    case "not_financial":
      return "This does not look like a receipt or invoice.";
    case "extractor_error":
      return "Extraction failed on our side. Re-run it — nothing was written to your books.";
    default:
      return "This document could not be extracted.";
  }
}
