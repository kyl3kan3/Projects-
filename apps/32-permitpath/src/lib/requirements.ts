/**
 * src/lib/requirements.ts
 *
 * Read/write layer for the shared requirement corpus: resolving the current
 * record for a (jurisdiction, job type) pair, walking version history, and
 * publishing new versions. Every publish goes through here so version
 * chaining, verified-at stamping, and audit logging live in one place.
 *
 * TODO:
 * - [ ] getCurrentRecord(jurisdictionId, jobType): the record with
 *       superseded_by IS NULL, or null when coverage is missing.
 * - [ ] getVersionHistory(recordId): full chain, newest first, with the
 *       requirement_changes row that produced each version.
 * - [ ] publishVersion(previousId, changes, source, reviewerId): creates
 *       the new record, links superseded_by, stamps verified_at/verified_by,
 *       writes audit_log. MUST require a reviewer id -- no unattended
 *       publishes, enforced here, not by convention.
 * - [ ] recencyLabel(verifiedAt): "verified 11 days ago" strings for the
 *       UI and SEO pages (mono recency stamp).
 * - [ ] fileCoverageRequest(jurisdictionId, jobType, orgId): the honest
 *       "not covered yet" path that feeds expansion sequencing.
 * - [ ] Zod schemas for fees/submittal-requirement jsonb payloads.
 */

import type { FeeLine, SourceKind, SubmittalRequirement } from "../db/schema";

export interface RequirementView {
  jurisdictionName: string;
  jobType: string;
  permitsRequired: string[];
  submittalRequirements: SubmittalRequirement[];
  fees: FeeLine[];
  reviewTimeline: string;
  quirks: string | null;
  version: number;
  sourceKind: SourceKind;
  verifiedAt: Date;
}

export function getCurrentRecord(
  _jurisdictionId: string,
  _jobType: string,
): Promise<RequirementView | null> {
  throw new Error("Not implemented");
}

export function getVersionHistory(
  _recordId: string,
): Promise<RequirementView[]> {
  throw new Error("Not implemented");
}

export function recencyLabel(_verifiedAt: Date): string {
  throw new Error("Not implemented");
}
