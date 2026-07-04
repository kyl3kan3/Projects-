/**
 * src/lib/checklists.ts
 *
 * Checklist engine: turns the current requirement record for a job's
 * (jurisdiction, job type) pair into a concrete per-job permit checklist,
 * pinned to the record version so later rule changes never silently rewrite
 * an in-flight job. Pure planning logic -- persistence via src/db.
 *
 * TODO:
 * - [ ] generateChecklist(jobId): resolve current record, expand into items
 *       (one per required permit, submittal document, fee, inspection note,
 *       license check), pin requirement_record_id at generation time.
 * - [ ] verifyItem(itemId, userId): state open -> verified with
 *       verified_by/verified_at (drives the stamp animation + recency label).
 * - [ ] markNotApplicable(itemId, userId, reason).
 * - [ ] checklistProgress(checklistId): "4 of 6 verified"; set
 *       fully_stamped_at when the last item verifies (header sweep moment).
 * - [ ] isStale(checklist): true when a newer record version exists for the
 *       pinned pair -- powers the "requirements changed since generation"
 *       banner; regenerate() preserves verified states where items match.
 * - [ ] Plan gating: active-job limits per plan (crew 15 / company 50 /
 *       regional unlimited) enforced at generation.
 */

import type { VerificationState } from "../db/schema";

export type ChecklistItemKind =
  | "permit"
  | "document"
  | "fee"
  | "inspection_note"
  | "license_check";

export interface ChecklistItemView {
  kind: ChecklistItemKind;
  title: string;
  detail: string;
  state: VerificationState;
  verifiedAt: Date | null;
}

export interface ChecklistView {
  jobId: string;
  pinnedRecordVersion: number;
  items: ChecklistItemView[];
  fullyStampedAt: Date | null;
  stale: boolean;
}

export function generateChecklist(_jobId: string): Promise<ChecklistView> {
  throw new Error("Not implemented");
}

export function verifyItem(
  _itemId: string,
  _userId: string,
): Promise<ChecklistItemView> {
  throw new Error("Not implemented");
}
