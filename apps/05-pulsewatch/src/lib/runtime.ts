/**
 * Which deployment shape are we running in?
 *
 * PulseWatch supports two, and the domain logic is identical in both:
 *
 *  - **Queued** (ARCHITECTURE.md): Redis is configured, so the scheduler
 *    enqueues checks onto per-region queues, probe machines in each region drain
 *    them, and a dispatcher process sends alerts. This is the shape that can
 *    confirm an outage from more than one network.
 *
 *  - **Serverless** (Vercel + Neon, no Redis): a cron-triggered function does
 *    the dispatch, runs the checks inline, and sends the alerts itself. One
 *    region, no always-on processes, nothing to operate.
 *
 * Nothing chooses this at build time — it is decided by whether REDIS_URL is
 * set, so the same deployment can grow a probe fleet later without a rewrite.
 */

export function hasQueue(): boolean {
  return Boolean(process.env.REDIS_URL);
}

/** True when running on Vercel (or any single-region serverless host). */
export function isServerless(): boolean {
  return Boolean(process.env.VERCEL);
}

/**
 * How long a cron-triggered tick may run before it must stop and let the next
 * one continue. Vercel's default function duration is 300s; stopping well short
 * of it keeps a slow target from killing the whole tick.
 */
export function tickBudgetMs(): number {
  const configured = Number(process.env.CRON_TICK_BUDGET_MS ?? 0);
  if (Number.isFinite(configured) && configured > 1_000) return configured;
  return 50_000;
}
