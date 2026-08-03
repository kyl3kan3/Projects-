/**
 * src/lib/runtime.ts
 *
 * Which deployment shape are we in? CertShield runs two, and the domain logic is
 * identical in both:
 *
 *  - **Queued** (ARCHITECTURE.md): REDIS_URL is set, so `npm run worker` drains
 *    BullMQ queues for parsing, evaluation, chasing and binders.
 *  - **Serverless** (Vercel + Neon, no Redis): the nightly work runs from
 *    `/api/cron/tick` and parsing runs inline on upload. No always-on process.
 *
 * Nothing decides this at build time — it is read from the environment, so the
 * same deployment can grow a worker later without a rewrite.
 */

export function hasQueue(): boolean {
  return Boolean(process.env.REDIS_URL);
}

/** True on Vercel (or any single-region serverless host): one pooled connection. */
export function isServerless(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

/**
 * How long a cron-triggered tick may run before it stops and lets the next one
 * continue. Vercel's default function ceiling is 300s; stopping well short of it
 * keeps one slow certificate from killing the whole pass.
 */
export function tickBudgetMs(): number {
  const configured = Number(process.env.CRON_TICK_BUDGET_MS ?? 0);
  if (Number.isFinite(configured) && configured > 1_000) return configured;
  return 50_000;
}
