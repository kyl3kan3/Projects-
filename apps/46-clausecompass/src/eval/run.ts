/**
 * src/eval/run.ts
 *
 * The eval harness (`npm run eval`) — the quality gate for a product
 * whose failure mode is missing an indemnity clause. Runs the full
 * pipeline against hand-labeled contract fixtures and blocks prompt,
 * schema, playbook, or model-version changes that regress.
 *
 * TODO:
 * - [ ] Load eval_cases fixtures (anonymized real contracts + expected
 *       clauses/flags), run parse -> extract -> score against the real
 *       Claude API (never DRY_RUN).
 * - [ ] Metrics per run: clause recall/precision by type, flag recall
 *       (target >= 90%), fabricated-quote count (target: zero, hard fail),
 *       determinism check (5 runs, identical flags), token cost per
 *       review.
 * - [ ] Persist results to eval_cases.last_result; print a diff vs the
 *       previous run.
 * - [ ] CI mode: nonzero exit on regression (wired as the merge gate for
 *       any change to prompts, schemas, playbooks, or ANTHROPIC_MODEL).
 * - [ ] Phase 3: grow to >= 50 fixtures across 5 contract types; publish
 *       aggregate accuracy in the transparency note.
 */

export function runEvals(): Promise<void> {
  throw new Error("Not implemented");
}
