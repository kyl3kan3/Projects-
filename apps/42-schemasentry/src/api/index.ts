/**
 * src/api/index.ts
 *
 * Fastify API boot: spec ingestion, check endpoint, dashboard routes,
 * GitHub/Slack webhook receivers, token + session auth.
 *
 * TODO:
 * - [ ] Route registration: /v1/specs (push), /v1/check, /v1/apis,
 *       /v1/consumers, /v1/changelog, /v1/tokens.
 * - [ ] zod schemas on every route; jose-verified sessions; hashed API
 *       tokens with per-API scoping.
 * - [ ] Plan gating at push time (API count) with a clear upgrade error,
 *       never a silent drop.
 * - [ ] CORS for the dashboard; graceful shutdown.
 */

export {};
