/**
 * Probot entrypoint: receives GitHub webhooks, enqueues review jobs.
 *
 * TODO:
 * - [ ] handle pull_request.opened / .synchronize -> enqueue review
 * - [ ] handle installation events -> persist installs + repo config
 * - [ ] check-run creation ("MergeMate review pending")
 * - [ ] rate limiting per installation + plan gating
 */
export {};
