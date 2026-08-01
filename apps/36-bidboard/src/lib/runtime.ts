/** True when running on Vercel (or any single-region serverless host). */
export function isServerless(): boolean {
  return Boolean(process.env.VERCEL);
}

/**
 * How long the cron-triggered sweep may run before it stops and lets the next
 * one continue. ARCHITECTURE.md has no worker in v1; the reminder sweep runs
 * inline on a bounded budget (see the root DEPLOYING.md).
 */
export function tickBudgetMs(): number {
  const configured = Number(process.env.CRON_TICK_BUDGET_MS ?? 0);
  if (Number.isFinite(configured) && configured > 1_000) return configured;
  return 50_000;
}
