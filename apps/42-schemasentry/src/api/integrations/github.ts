/**
 * src/api/integrations/github.ts
 *
 * GitHub App integration: check runs, in-place PR comments, OAuth sign-in.
 *
 * TODO:
 * - [ ] App auth (installation tokens via @octokit/app); webhook signature
 *       verification.
 * - [ ] createOrUpdateCheckRun(diff): conclusion mapping (breaking ->
 *       failure, risky -> neutral by default, policy-configurable).
 * - [ ] upsertPrComment(diff): ONE comment updated across pushes — a
 *       findings table with mono pointer paths, reasons, consumer impact,
 *       and ack links. No emoji anywhere in the comment.
 * - [ ] OAuth flow for dashboard sign-in.
 */

export {};
