/**
 * Deployment shape.
 *
 * ARCHITECTURE.md describes BullMQ workers as standalone `tsx` processes. The
 * portfolio's deployment target is Vercel, which has no always-on processes, so
 * every date-driven job lives in one pure function (`runTick`, src/lib/tick.ts)
 * with two drivers:
 *
 *  - `/api/cron/tick` — a cron-triggered route with a bounded time budget,
 *    protected by CRON_SECRET (it refuses to run when the secret is unset).
 *  - `npm run worker` — BullMQ workers plus a repeatable job calling the same
 *    tick, for hosts that do have a process (Railway/Fly, per ARCHITECTURE.md).
 *
 * Nothing is decided at build time and neither driver owns any logic. Enqueueing
 * is best-effort everywhere: every job has an inline or next-tick fallback, so
 * Redis being unreachable slows the product instead of breaking it.
 */

export function isServerless(): boolean {
  return Boolean(process.env.VERCEL);
}

/** Does this deployment have a queue at all? */
export function hasQueue(): boolean {
  return Boolean(process.env.REDIS_URL);
}

/**
 * How long a tick may run before it stops and leaves the rest for the next one.
 * Vercel's ceiling is 300s; stopping well short keeps one slow card decline from
 * killing the whole autopay run.
 */
export function tickBudgetMs(): number {
  const configured = Number(process.env.CRON_TICK_BUDGET_MS ?? 0);
  if (Number.isFinite(configured) && configured > 1_000) return configured;
  return 45_000;
}
