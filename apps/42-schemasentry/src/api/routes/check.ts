/**
 * src/api/routes/check.ts
 *
 * The synchronous CI verdict endpoint (PR gate).
 *
 * TODO:
 * - [ ] POST /v1/check: candidate spec + baseline ref in, verdict +
 *       findings out, in seconds (engine runs inline, no queue).
 * - [ ] Ack application: findings acknowledged on this PR return level
 *       "info" with the ack note attached.
 * - [ ] Record check_runs row; when installed as a GitHub App, create/
 *       update the check run + the single in-place PR comment.
 * - [ ] Rate limits per token; payload size caps.
 */

export {};
