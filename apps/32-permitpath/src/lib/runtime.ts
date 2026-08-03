/**
 * Deployment shape.
 *
 * PermitPath's background work (crawls, diffing, the expiry sweep, alert
 * fan-out) is one bounded pass — `runTick` in lib/tick.ts — and it runs in
 * either shape without a code change:
 *
 *  - **Serverless** (Vercel + Neon): `/api/cron/tick` runs the pass on a
 *    schedule, protected by CRON_SECRET. No always-on process to operate.
 *  - **Long-lived** (`npm run worker`): the same pass on an interval, for a
 *    Railway/Fly box that wants crawls more often than Hobby cron allows.
 */

export function isServerless(): boolean {
  return Boolean(process.env.VERCEL);
}

/**
 * How long one tick may run before it stops and leaves the rest for the next
 * pass. Vercel's function ceiling is 300s; stopping well short of it means one
 * slow municipal server can never kill the whole sweep.
 */
export function tickBudgetMs(): number {
  const configured = Number(process.env.CRON_TICK_BUDGET_MS ?? 0);
  if (Number.isFinite(configured) && configured > 1_000) return configured;
  return 50_000;
}

/** Interval between passes for the long-lived worker shape. */
export function workerIntervalMs(): number {
  const configured = Number(process.env.WORKER_INTERVAL_MS ?? 0);
  if (Number.isFinite(configured) && configured >= 10_000) return configured;
  return 60_000;
}
