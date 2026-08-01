/**
 * Deployment-shape questions the rest of the app asks.
 *
 * PaperTrail has exactly one background job — the late-payment reminder sweep —
 * and it is day-granular, so it runs as a cron-triggered route rather than a
 * long-lived worker (see DEPLOYING.md: Vercel has no always-on processes, and
 * Hobby cron fires once a day, which is precisely this job's cadence).
 */

/** True when running on Vercel (or any serverless host with per-request pools). */
export function isServerless(): boolean {
  return Boolean(process.env.VERCEL);
}

/**
 * How long the reminder sweep may run before it stops and leaves the rest for
 * the next tick. Vercel's default function duration is 300s; stopping well
 * short of it means a slow mail provider can never kill the whole sweep.
 */
export function sweepBudgetMs(): number {
  const configured = Number(process.env.CRON_SWEEP_BUDGET_MS ?? 0);
  if (Number.isFinite(configured) && configured > 1_000) return configured;
  return 50_000;
}
