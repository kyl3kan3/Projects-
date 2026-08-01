/**
 * Deployment shape.
 *
 * ARCHITECTURE.md describes a long-lived BullMQ worker. The portfolio's actual
 * target is Vercel + Neon, which has no always-on processes, so the same work
 * runs as a cron-triggered route with a bounded time budget
 * (`/api/cron/tick`). `src/worker/index.ts` runs the identical function on an
 * interval for anyone hosting a persistent process instead — there is one
 * implementation of the sweep, two ways to invoke it.
 */

export function isServerless(): boolean {
  return Boolean(process.env.VERCEL);
}

/**
 * How long a sweep may run before it stops and lets the next invocation
 * continue. Vercel's default function duration is 300s; stopping well short of
 * it keeps one slow send from killing the whole tick.
 */
export function sweepBudgetMs(): number {
  const configured = Number(process.env.CRON_TICK_BUDGET_MS ?? 0);
  if (Number.isFinite(configured) && configured > 1_000) return configured;
  return 50_000;
}
