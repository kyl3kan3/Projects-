/**
 * src/worker/index.ts
 *
 * Long-lived BullMQ worker process (deployed separately; `npm run worker`).
 * Runs the review pipeline as staged jobs with progress states the UI
 * reads live: parse -> extract -> score -> explain -> render.
 *
 * TODO:
 * - [ ] Queues: run-review (staged: updates contracts.status per stage),
 *       render-report-pdf, retention-sweep (daily repeatable),
 *       free-checker (single-clause, high concurrency).
 * - [ ] Stage failure handling: retry transient API errors with backoff;
 *       hard failures -> contracts.status failed + credit refund + honest
 *       email; partial pass-3 failure degrades to rule templates (see
 *       explain.ts) and still ships.
 * - [ ] Concurrency tuned to Anthropic rate limits; per-account queue
 *       fairness (one account can't starve the pipeline).
 * - [ ] Token/cost accounting flushed per stage.
 * - [ ] DRY_RUN=1 stubs Claude calls; graceful shutdown drains stages.
 */

export function startWorker(): Promise<void> {
  throw new Error("Not implemented");
}
