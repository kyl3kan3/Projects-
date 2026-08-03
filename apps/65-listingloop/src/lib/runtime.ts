/**
 * src/lib/runtime.ts
 *
 * Which deployment shape are we in? The domain logic is identical in both.
 *
 *  - **Queued** (ARCHITECTURE.md): REDIS_URL is set, so `npm run worker` drains
 *    the BullMQ queues for reminder fan-out, recomputes and closing packets.
 *  - **Serverless** (Vercel + Neon, no always-on process): the nightly work runs
 *    from `/api/cron/tick`, and recomputes run inline in the server action that
 *    applies them — which is where a TC wants them anyway, since they just
 *    approved the diff and expect the timeline to be right on the next paint.
 *
 * Nothing decides this at build time; it is read from the environment, so a
 * deployment can grow a worker later without a rewrite.
 */

export function hasQueue(): boolean {
  return Boolean(process.env.REDIS_URL);
}

/** True on Vercel (or any single-region serverless host): one pooled connection. */
export function isServerless(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

/**
 * How long a cron-triggered tick may run before it stops and lets tomorrow's (or
 * the next manual) pass continue. Vercel's function ceiling is 300s; stopping
 * well short of it keeps one slow account from killing the whole sweep.
 */
export function tickBudgetMs(): number {
  const configured = Number(process.env.CRON_TICK_BUDGET_MS ?? 0);
  if (Number.isFinite(configured) && configured > 1_000) return configured;
  return 50_000;
}
