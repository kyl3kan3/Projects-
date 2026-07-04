/**
 * src/worker/jobs/process-walkthrough.ts
 *
 * The pipeline job: turns a completed walkthrough capture into a draft
 * estimate. Owns the status machine capturing -> uploaded -> transcribing
 * -> drafting -> drafted | failed, and the plan-quota gate.
 *
 * TODO:
 * - [ ] Verify all walkthrough_media rows are upload_status = complete;
 *       requeue with backoff if stragglers remain (max 3 tries).
 * - [ ] Plan gate: atomically increment organizations.
 *       quote_count_current_period BEFORE any OpenAI spend; on limit,
 *       fail with typed PLAN_LIMIT error (UI turns it into an upgrade
 *       prompt) and decrement nothing.
 * - [ ] transcribeWalkthrough (src/lib/transcription) -> store transcript
 *       + confidence; low-confidence path sets failed/low_confidence.
 * - [ ] draftEstimate (src/lib/drafting) -> estimates + line-item rows;
 *       record draft_duration_ms (ROADMAP target: <90s end to end).
 * - [ ] Notify contractor (email/push) that the draft is ready.
 * - [ ] Idempotency: re-running the job must not create a second estimate
 *       version; audit_log row per attempt with model + prompt version.
 */

export interface ProcessWalkthroughJobData {
  walkthroughId: string;
  organizationId: string;
}

export function processWalkthrough(
  _data: ProcessWalkthroughJobData,
): Promise<void> {
  throw new Error("Not implemented");
}
