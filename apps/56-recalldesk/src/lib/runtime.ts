/**
 * src/lib/runtime.ts
 *
 * Which shape are we running in? RecallDesk's background work (import parsing,
 * the overdue recompute, campaign steps, attribution, the daily queue build) is
 * written once as plain functions in src/lib/jobs.ts and driven from either end:
 *
 *   - `/api/cron/tick` — a cron-triggered route, bounded by a time budget. The
 *     only shape that works on Vercel, which has no always-on processes.
 *   - `npm run worker` — a long-lived loop calling the same tick, for a host
 *     that does (Fly, Railway, a VPS).
 *
 * Both take the same `job_leases` row before doing anything, so running both at
 * once is safe rather than double-sending.
 */

export function isServerless(): boolean {
  return Boolean(process.env.VERCEL);
}

/**
 * How long one tick may spend. Vercel's default function ceiling is 300s; the
 * budget stops the tick well before it, so the response is always the report of
 * what it did rather than a timeout.
 */
export function tickBudgetMs(): number {
  const n = Number(process.env.TICK_BUDGET_MS ?? "");
  if (Number.isFinite(n) && n > 1000) return n;
  return isServerless() ? 45_000 : 20_000;
}
