/**
 * Which shape are we running in?
 *
 * TradeLog has no always-on process. Imports are synchronous (parsing and
 * matching a year of a retail trader's fills is milliseconds), and the only
 * periodic work — broker sync and leak recomputation — runs from a cron-triggered
 * route with a time budget, per the portfolio's DEPLOYING.md. `npm run worker`
 * calls the same tick function on a loop for anyone self-hosting.
 */

export function isServerless(): boolean {
  return Boolean(process.env.VERCEL);
}

/**
 * How long a cron tick may run before it stops and leaves the rest for the next
 * one. Vercel's default function duration is 300s; stopping well short of it
 * keeps one slow broker sync from killing the whole tick.
 */
export function tickBudgetMs(): number {
  const configured = Number(process.env.CRON_TICK_BUDGET_MS ?? 0);
  if (Number.isFinite(configured) && configured > 1_000) return configured;
  return 50_000;
}
