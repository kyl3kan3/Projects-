/**
 * Deployment shape.
 *
 * ARCHITECTURE.md describes a long-lived worker for the date-driven work
 * (monthly charge generation, reminders, late fees). The portfolio's deployment
 * target is Vercel + Neon, which has no always-on processes, so the time-based
 * engine lives in one pure function (`runTick`, src/lib/tick.ts) with two
 * drivers:
 *
 *  - `/api/cron/tick` — a cron-triggered route with a bounded time budget,
 *    protected by CRON_SECRET (it refuses to run when the secret is unset).
 *  - `npm run worker` — a plain Node loop calling the same tick on an interval,
 *    for hosts that do have a process (Railway/Fly, per ARCHITECTURE.md).
 *
 * Nothing is decided at build time and neither driver owns any logic.
 */

export function isServerless(): boolean {
  return Boolean(process.env.VERCEL);
}

/**
 * How long a tick may run before it stops and leaves the rest for the next one.
 * Vercel's ceiling is 300s; stopping well short of it keeps one slow email
 * provider from killing the whole tick.
 */
export function tickBudgetMs(): number {
  const configured = Number(process.env.CRON_TICK_BUDGET_MS ?? 0);
  if (Number.isFinite(configured) && configured > 1_000) return configured;
  return 45_000;
}
