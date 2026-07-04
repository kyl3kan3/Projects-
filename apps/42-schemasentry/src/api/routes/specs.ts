/**
 * src/api/routes/specs.ts
 *
 * Spec push + deploy timeline routes.
 *
 * TODO:
 * - [ ] POST /v1/specs: token auth, canonicalize, store deploy (jsonb) +
 *       raw original (R2), compute spec_health, enqueue run-diff against
 *       the baseline; respond with the diff URL.
 * - [ ] GET /v1/apis/:slug/deploys: timeline with verdicts.
 * - [ ] POST /v1/apis/:slug/baseline: baseline management (audit-logged).
 * - [ ] Idempotency on (api, version_label, env) — re-push is a no-op.
 */

export {};
