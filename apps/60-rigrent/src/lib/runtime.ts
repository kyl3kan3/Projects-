/**
 * src/lib/runtime.ts
 *
 * Which deployment shape is this process running in?
 *
 * RigRent supports two, and the domain logic is byte-identical in both:
 *
 *  - **Queued** (ARCHITECTURE.md): REDIS_URL is set, so `npm run worker` runs
 *    BullMQ workers for hold re-authorisation, hold release, document rendering
 *    and reminders, with retries and a dead-letter queue.
 *  - **Serverless** (Vercel + Neon, no Redis): `/api/cron/tick` does the same
 *    work inline on a schedule, bounded by a time budget. Vercel has no
 *    always-on process, so this is the shape that actually deploys there.
 *
 * Nothing decides this at build time — it turns on whether REDIS_URL is
 * present, so a deployment can grow a worker host later without a rewrite.
 */

export function hasQueue(): boolean {
  return Boolean(process.env.REDIS_URL);
}

/** True on Vercel (or any single-region serverless host). */
export function isServerless(): boolean {
  return Boolean(process.env.VERCEL);
}

/**
 * How long one cron tick may run before it stops and leaves the rest for the
 * next one. Vercel's default function duration is 300s; stopping well short of
 * it keeps one slow Stripe call from killing the whole pass.
 */
export function tickBudgetMs(): number {
  const configured = Number(process.env.CRON_TICK_BUDGET_MS ?? 0);
  if (Number.isFinite(configured) && configured > 1_000) return configured;
  return 45_000;
}
