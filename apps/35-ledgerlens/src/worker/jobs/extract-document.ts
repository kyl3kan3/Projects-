/**
 * src/worker/jobs/extract-document.ts
 *
 * The core job: take a stored document, run AI extraction, apply the
 * confidence policy, and land it in the inbox as confirmed or flagged.
 *
 * TODO:
 * - [ ] Load document + org; verify status is `queued` (idempotency --
 *       a re-delivered job on an extracted document is a no-op).
 * - [ ] Plan-cap check via PLAN_DOCUMENT_CAPS; over-cap -> leave `queued`,
 *       set a dashboard notice, stop (no partial billing surprises).
 * - [ ] Fetch bytes from R2; call extraction.extractDocument(); escalate
 *       per the confidence policy.
 * - [ ] Write extractions row; upsert vendor (normalizeVendor); resolve
 *       category via categorize.resolveCategory().
 * - [ ] High confidence -> line_items row + status `confirmed` (system);
 *       mixed -> review_items rows + status `needs_review`;
 *       below floor -> status `rejected` with a retake prompt.
 * - [ ] Duplicate window check (same vendor + total +/- 3 days) beyond the
 *       exact-hash dedupe; mark `duplicate_of` candidates for merge UI.
 * - [ ] Increment usage_counters; record cost_microcents.
 */

export function extractDocumentJob(): Promise<void> {
  throw new Error("Not implemented");
}
