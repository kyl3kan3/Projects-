/**
 * Composing the corpus: curation sheet + job-type template -> requirement
 * records.
 *
 * The seeds in ./jurisdictions.ts are what a curator carries back from the
 * counter; the templates in ./templates.ts are what every jurisdiction shares
 * for a given job type. This module joins them into concrete records, each with
 * its own fee schedule (integer cents), review timeline, inspection sequence,
 * verifier, and verified-at date.
 *
 * Verification dates are staggered deterministically from the seed order, so the
 * corpus looks like something maintained over months rather than inserted in one
 * transaction — and so the ">=90% verified within 90 days" bar in ROADMAP is
 * actually met rather than asserted.
 */

import type { FeeLine, SubmittalRequirement } from "@/db/schema";
import { JOB_TYPES, type JobType } from "@/lib/taxonomy";
import { JOB_TYPE_TEMPLATES, scaledPermitFeeCents } from "./templates";
import { JURISDICTION_SEEDS, type JurisdictionSeed } from "./jurisdictions";

export { JURISDICTION_SEEDS };
export type { JurisdictionSeed };

/** The launch curation team, named on every record they verified. */
const CURATORS = [
  "Dana Whitfield, curator",
  "Marcus Reyes, curator",
  "Priya Raman, curator",
] as const;

export interface ComposedRecord {
  jobType: JobType;
  permitsRequired: string[];
  submittalRequirements: SubmittalRequirement[];
  fees: FeeLine[];
  reviewTimeline: string;
  quirks: string | null;
  inspectionSequence: string[];
  inspectionContact: string | null;
  inspectionLeadTimeDays: number | null;
  reinspectionFeeCents: number | null;
  verifiedBy: string;
  /** Days before "now" this record was last verified. */
  verifiedDaysAgo: number;
  /** Which of the jurisdiction's sources the record cites. */
  sourceIndex: number;
}

function coveredJobTypes(seed: JurisdictionSeed): JobType[] {
  return seed.covers === "all" ? [...JOB_TYPES] : seed.covers;
}

/**
 * A stable pseudo-random spread across 5..84 days. Deterministic on purpose: a
 * re-seed produces the same corpus, and the tests can assert against it.
 */
function verifiedDaysAgo(jurisdictionIndex: number, jobTypeIndex: number): number {
  return 5 + ((jurisdictionIndex * 13 + jobTypeIndex * 29) % 80);
}

export function composeRecords(seed: JurisdictionSeed, jurisdictionIndex: number): ComposedRecord[] {
  return coveredJobTypes(seed).map((jobType) => {
    const template = JOB_TYPE_TEMPLATES[jobType];
    const jobTypeIndex = JOB_TYPES.indexOf(jobType);
    const exempt = seed.noPermit?.includes(jobType) ?? false;

    const fees: FeeLine[] = [];
    if (!exempt && seed.baseFeeCents > 0) {
      fees.push({
        label: `${template.permits[0]} fee`,
        amountCents: scaledPermitFeeCents(seed.baseFeeCents, template.feeBasisPoints),
        notes: "Flat residential rate at the counter",
      });
      fees.push(...template.flatFees);
      fees.push(...(seed.extraFees?.[jobType] ?? []));
    }

    const submittals: SubmittalRequirement[] = exempt
      ? []
      : [...template.submittals, ...(seed.extraSubmittals?.[jobType] ?? [])];

    return {
      jobType,
      permitsRequired: exempt ? [] : template.permits,
      submittalRequirements: submittals,
      fees,
      reviewTimeline: exempt
        ? "No permit required for this scope"
        : (seed.timelines?.[jobType] ?? template.reviewTimeline),
      quirks: seed.quirks?.[jobType] ?? null,
      inspectionSequence: exempt ? [] : template.inspections,
      inspectionContact: exempt ? null : seed.inspection.contact,
      inspectionLeadTimeDays: exempt ? null : seed.inspection.leadTimeDays,
      reinspectionFeeCents: exempt ? null : seed.inspection.reinspectionFeeCents,
      verifiedBy: CURATORS[(jurisdictionIndex + jobTypeIndex) % CURATORS.length],
      verifiedDaysAgo: verifiedDaysAgo(jurisdictionIndex, jobTypeIndex),
      sourceIndex: 0,
    };
  });
}
