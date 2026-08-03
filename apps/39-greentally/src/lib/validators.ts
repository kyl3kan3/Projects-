/**
 * The deterministic guardrail.
 *
 * Confidence tells you how sure the reader was. Validation tells you whether the
 * number is *possible*. Both have to pass before a figure lands in a footprint
 * unreviewed, because the failure mode that ruins a report is not a low-confidence
 * field — it is a confident one that is thirty times too large.
 *
 * Every issue has a severity:
 *   - `block` — the document goes to review no matter how confident the reader was.
 *   - `warn`  — shown beside the field, does not by itself force a review.
 */

import type { ActivityCategory } from "@/db/schema";
import { CATEGORY_LABEL, formatQuantityMilli } from "@/lib/units";

export interface ValidationIssue {
  kind:
    | "unit_out_of_band"
    | "intensity_out_of_band"
    | "period_length"
    | "period_outside_year"
    | "period_overlap"
    | "duplicate_document";
  severity: "block" | "warn";
  field: "quantity" | "period" | "provider";
  detail: string;
}

export interface CandidateLine {
  category: ActivityCategory;
  quantityMilli: number;
  serviceStart: string;
  serviceEnd: string;
  provider: string;
}

export interface ExistingLine {
  documentId: string;
  siteId: string;
  category: ActivityCategory;
  serviceStart: string;
  serviceEnd: string;
  provider: string;
}

export interface ValidationContext {
  siteId: string;
  /** Reporting year the document was filed under. */
  year: number;
  /** 0 when unknown — the intensity band is then skipped rather than guessed. */
  floorAreaSqm: number;
  /** Accepted or pending lines already on this site, for overlap and duplicates. */
  existing: ExistingLine[];
  /** The document being validated, so a re-run does not collide with itself. */
  documentId: string;
}

/**
 * Absolute plausibility bands per category, in canonical units.
 *
 * Deliberately wide — the job is to catch a unit mix-up or a misread digit group, not
 * to second-guess a large factory. The upper bounds are a single site's single
 * billing period.
 */
const ABSOLUTE_BANDS: Record<ActivityCategory, { min: number; max: number; unit: string }> = {
  electricity_kwh: { min: 1, max: 5_000_000, unit: "kWh" },
  natural_gas_kwh: { min: 1, max: 10_000_000, unit: "kWh" },
  diesel_l: { min: 1, max: 500_000, unit: "L" },
  petrol_l: { min: 1, max: 500_000, unit: "L" },
  heating_oil_l: { min: 1, max: 500_000, unit: "L" },
  propane_l: { min: 1, max: 500_000, unit: "L" },
};

/**
 * Electricity intensity band, kWh per m² per 30 days.
 *
 * CBECS puts US commercial buildings at roughly 80–350 kWh/m²/year, i.e. 7–29 per
 * month; a data centre or a foundry runs far higher. The band below (0.5–120) flags
 * only readings that are off by an order of magnitude — which is exactly the shape of
 * a CCF-read-as-kWh or a decimal-point error.
 */
const ELEC_KWH_PER_SQM_MONTH = { min: 0.5, max: 120 };

function daysBetween(startIso: string, endIso: string): number {
  const a = Date.parse(`${startIso}T00:00:00Z`);
  const b = Date.parse(`${endIso}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export function validateLine(line: CandidateLine, ctx: ValidationContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const band = ABSOLUTE_BANDS[line.category];
  const qty = line.quantityMilli / 1000;

  if (qty < band.min || qty > band.max) {
    issues.push({
      kind: "unit_out_of_band",
      severity: "block",
      field: "quantity",
      detail: `${formatQuantityMilli(line.quantityMilli)} ${band.unit} of ${CATEGORY_LABEL[
        line.category
      ].toLowerCase()} is outside the plausible range for one site and one period (${band.min}–${band.max.toLocaleString(
        "en-US",
      )} ${band.unit}). Check the unit on the bill.`,
    });
  }

  const days = daysBetween(line.serviceStart, line.serviceEnd);
  if (days <= 0) {
    issues.push({
      kind: "period_length",
      severity: "block",
      field: "period",
      detail: "The service period ends on or before the day it starts.",
    });
  } else if (days > 100) {
    issues.push({
      kind: "period_length",
      severity: "block",
      field: "period",
      detail: `A ${days}-day service period is too long for one bill. Split it, or correct the dates.`,
    });
  } else if (days < 20 || days > 70) {
    issues.push({
      kind: "period_length",
      severity: "warn",
      field: "period",
      detail: `${days} days is unusual for a utility bill — check the read dates.`,
    });
  }

  // Intensity, only where the floor area is known.
  if (line.category === "electricity_kwh" && ctx.floorAreaSqm > 0 && days > 0) {
    const perSqmMonth = (qty / ctx.floorAreaSqm) * (30 / days);
    if (perSqmMonth < ELEC_KWH_PER_SQM_MONTH.min || perSqmMonth > ELEC_KWH_PER_SQM_MONTH.max) {
      issues.push({
        kind: "intensity_out_of_band",
        severity: "block",
        field: "quantity",
        detail: `${perSqmMonth.toFixed(1)} kWh per m² per month at this site is outside the ${
          ELEC_KWH_PER_SQM_MONTH.min
        }–${ELEC_KWH_PER_SQM_MONTH.max} band for a commercial building. Either the quantity or the floor area is wrong.`,
      });
    }
  }

  // Inside the reporting year? A period straddling the year boundary is normal; a
  // period wholly outside it means the document was filed under the wrong year.
  const yearStart = `${ctx.year}-01-01`;
  const yearEnd = `${ctx.year}-12-31`;
  if (!overlaps(line.serviceStart, line.serviceEnd, yearStart, yearEnd)) {
    issues.push({
      kind: "period_outside_year",
      severity: "block",
      field: "period",
      detail: `This bill covers ${line.serviceStart} to ${line.serviceEnd}, which is entirely outside reporting year ${ctx.year}.`,
    });
  }

  for (const other of ctx.existing) {
    if (other.documentId === ctx.documentId) continue;
    if (other.siteId !== ctx.siteId) continue;
    if (other.category !== line.category) continue;
    if (!overlaps(line.serviceStart, line.serviceEnd, other.serviceStart, other.serviceEnd)) continue;

    const sameProvider =
      other.provider.trim().toLowerCase() === line.provider.trim().toLowerCase() &&
      other.provider.trim() !== "";
    const samePeriod =
      other.serviceStart === line.serviceStart && other.serviceEnd === line.serviceEnd;

    if (sameProvider && samePeriod) {
      issues.push({
        kind: "duplicate_document",
        severity: "block",
        field: "period",
        detail: `${line.provider} already has a ${CATEGORY_LABEL[
          line.category
        ].toLowerCase()} reading for ${line.serviceStart} to ${line.serviceEnd} at this site. Accepting this would double-count it.`,
      });
    } else {
      issues.push({
        kind: "period_overlap",
        severity: "block",
        field: "period",
        detail: `This period overlaps an existing ${CATEGORY_LABEL[
          line.category
        ].toLowerCase()} reading (${other.serviceStart} to ${other.serviceEnd}) at this site.`,
      });
    }
  }

  return issues;
}

export function blocking(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === "block");
}

/**
 * The routing decision, in one place.
 *
 * A document is accepted only when every field cleared the confidence threshold *and*
 * nothing blocked. Everything else is `needs_review` — which is a working state with a
 * screen behind it, not an error.
 */
export function route(
  confidenceBp: number,
  issues: ValidationIssue[],
  threshold: number,
): "accepted" | "needs_review" {
  if (blocking(issues)) return "needs_review";
  return confidenceBp >= threshold ? "accepted" : "needs_review";
}
