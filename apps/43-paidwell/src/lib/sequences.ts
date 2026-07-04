/**
 * src/lib/sequences.ts
 *
 * The escalation engine: turns a firm's sequence ladder into scheduled
 * sends for each overdue invoice, and manages run state (pause on reply,
 * pause on promise, awaiting approval, resume, stop).
 *
 * TODO:
 * - [ ] Default ladder: due-3d heads-up -> due+3d gentle -> due+10d firm ->
 *       due+21d final (late-fee mention configurable, off by default).
 * - [ ] planRun(invoiceId, sequenceId): compute absolute send times from
 *       due_at; enqueue BullMQ delayed jobs; one sequence_runs row.
 * - [ ] executeStep(runId, stepIndex): SEND-TIME RE-CHECKS (hard rules):
 *       balance still > 0, no open promise, no reply pause, not VIP-excluded,
 *       not disputed. Approval mode -> queue awaiting_approval instead.
 * - [ ] pauseOnReply(runId, messageId) / pauseOnPromise(runId, promiseId).
 * - [ ] resumeAfterBrokenPromise(runId): skip to next escalation level with
 *       promise-aware template variant.
 * - [ ] stopRun(runId, reason): cancel outstanding jobs (paid / written off).
 * - [ ] Validation (zod) for ladder edits from the dashboard.
 */

import type { SequenceStep } from "../db/schema";

export interface RunPlan {
  steps: Array<{ scheduledFor: Date; step: SequenceStep }>;
}

export function planRun(
  _invoiceId: string,
  _sequenceId: string,
): Promise<RunPlan> {
  throw new Error("Not implemented");
}

export function executeStep(
  _runId: string,
  _stepIndex: number,
): Promise<void> {
  throw new Error("Not implemented");
}
