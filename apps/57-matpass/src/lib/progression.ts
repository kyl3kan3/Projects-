/**
 * src/lib/progression.ts
 *
 * The progression engine: classes-since-promotion, days-in-rank, sign-off
 * state -> eligibility. The product's core query.
 *
 * TODO:
 * - [ ] progressFor(enrollment): count check-ins since promoted_at vs
 *       rank.min_classes; days since promoted_at vs rank.min_days_in_rank;
 *       sign-off state where required. Returns the EligibilitySnapshot
 *       shape from src/db/schema.
 * - [ ] Edge cases (each with a test): promotion mid-week, paused
 *       enrollments (clock stops), imported history (promoted_at from
 *       import), stripes within a rank (stripe steps use per-stripe class
 *       counts derived from min_classes / (stripes + 1)).
 * - [ ] nextStep(): stripe vs full rank — what this enrollment is working
 *       toward, for the belt bar's progress hairline and mono "18 / 24".
 * - [ ] refreshEligibility(schoolId): nightly batch recompute (drift
 *       guard); incremental updates happen on check-in.
 */

import type { EligibilitySnapshot } from "@/db/schema";

export async function progressFor(
  _enrollmentId: string,
): Promise<EligibilitySnapshot> {
  // TODO: implement per ARCHITECTURE.md key flow 2
  throw new Error("Not implemented");
}

export async function refreshEligibility(
  _schoolId: string,
): Promise<{ enrollmentsUpdated: number }> {
  throw new Error("Not implemented");
}
