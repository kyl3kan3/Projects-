/**
 * Deployment shape.
 *
 * ARCHITECTURE.md calls for "Vercel Cron -> internal job routes", and that is
 * exactly what ships: one daily route (`/api/cron/tick`) runs the Monday
 * fan-out, the missed-talk sweep, the cert ladder and the 300A season reminders
 * inside a bounded time budget. There is no worker process to keep alive.
 */

export function isServerless(): boolean {
  return Boolean(process.env.VERCEL);
}

/**
 * How long the daily sweep may run before it stops and leaves the rest for the
 * next invocation. Vercel's default function duration is 300s; stopping well
 * short of it keeps one slow SMS from killing the whole tick.
 */
export function sweepBudgetMs(): number {
  const configured = Number(process.env.CRON_TICK_BUDGET_MS ?? 0);
  if (Number.isFinite(configured) && configured > 1_000) return configured;
  return 50_000;
}
