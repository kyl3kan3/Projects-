/**
 * src/lib/runtime.ts
 *
 * Which deployment shape is this?
 *
 *  - **Queued** (ARCHITECTURE.md): REDIS_URL is set, so `npm run worker`
 *    runs the BullMQ workers — poll-sources, score-matches, morning-scan,
 *    deadline-reminders, refresh-staleness, process-stripe-event — with
 *    repeatable schedules and retries.
 *
 *  - **Serverless** (Vercel + Neon, no always-on process): the same job
 *    bodies run inline from a cron-triggered route (`/api/cron/tick`) on a
 *    bounded time budget. Vercel Hobby only runs cron once a day, which is
 *    enough for a 6am scan and the nightly reminder sweep but not for hourly
 *    polling — that wants Pro or any external scheduler hitting the URL.
 *
 * Nothing decides this at build time. The domain logic in src/lib/jobs.ts is
 * identical in both shapes; only the trigger differs.
 */

export function hasQueue(): boolean {
  return Boolean(process.env.REDIS_URL);
}

export function isServerless(): boolean {
  return Boolean(process.env.VERCEL);
}

/**
 * How long a cron tick may run before it stops and leaves the rest for the
 * next one. Vercel's ceiling is 300s; stopping well short of it keeps one slow
 * portal from killing the whole tick.
 */
export function tickBudgetMs(): number {
  const configured = Number(process.env.CRON_TICK_BUDGET_MS ?? 0);
  if (Number.isFinite(configured) && configured > 1_000) return configured;
  return 50_000;
}
