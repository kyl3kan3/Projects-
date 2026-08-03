/**
 * Which deployment shape are we in?
 *
 * ARCHITECTURE.md calls for a long-lived BullMQ worker. The actual deployment
 * target is Vercel + Neon, which has no always-on processes (root DEPLOYING.md),
 * so the background work — extraction, monthly close, digests — is written as one
 * idempotent sweep (`lib/sweep.ts`) that both `/api/cron/tick` and the optional
 * `npm run worker` loop call. Nothing in the domain layer knows which one ran it.
 */

export function isServerless(): boolean {
  return Boolean(process.env.VERCEL);
}

/**
 * How long a sweep may run before it stops and leaves the rest for the next one.
 * Vercel's default function duration is 300s; stopping well short of it keeps one
 * slow extraction from killing the whole tick.
 */
export function tickBudgetMs(): number {
  const configured = Number(process.env.CRON_TICK_BUDGET_MS ?? 0);
  if (Number.isFinite(configured) && configured > 1_000) return configured;
  return 50_000;
}
