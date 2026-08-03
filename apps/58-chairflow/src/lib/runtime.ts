/**
 * src/lib/runtime.ts
 *
 * Which shape are we running in?
 *
 * ARCHITECTURE.md calls for BullMQ workers, which assumes a host with always-on
 * processes. The deployment target is Vercel, where functions are invoked and never
 * run, so the eight jobs from the queue table are written once as plain async
 * functions in `src/server/jobs.ts` and driven from either end:
 *
 *   - `/api/cron/tick` — a `CRON_SECRET`-gated route with a time budget. The only
 *     shape a schedule can take on Vercel.
 *   - `npm run worker` — a long-lived loop calling the same `runTick`, for a host
 *     that does have processes (Fly, Railway, a VPS).
 *
 * Every step takes a `job_leases` row before doing anything, so running both at
 * once is safe rather than a double-send.
 */

export function isServerless(): boolean {
  return Boolean(process.env.VERCEL);
}

/**
 * How long one tick may spend. Vercel's default function ceiling is 300s; the
 * budget stops well before it so the response is a report of what happened rather
 * than a timeout.
 */
export function tickBudgetMs(): number {
  const n = Number(process.env.TICK_BUDGET_MS ?? "");
  if (Number.isFinite(n) && n > 1000) return n;
  return isServerless() ? 45_000 : 20_000;
}

/** How often `npm run worker` runs a tick. */
export function workerIntervalMs(): number {
  const n = Number(process.env.WORKER_INTERVAL_MS ?? "");
  return Number.isFinite(n) && n >= 5_000 ? n : 60_000;
}
