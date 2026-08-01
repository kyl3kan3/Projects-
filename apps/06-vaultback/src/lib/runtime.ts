/**
 * Which deployment shape are we running in?
 *
 * VaultBack supports two, and the job bodies are identical in both:
 *
 *  - **Queued** (ARCHITECTURE.md): REDIS_URL is set, so a long-lived worker
 *    process drains BullMQ queues. This is the shape that can hold a multi-hour
 *    dump stream open and run `pg_dump` binaries.
 *
 *  - **Serverless** (Vercel + Neon, no Redis): one CRON_SECRET-protected route
 *    picks up due policies and runs them inline against a time budget. Nothing
 *    to operate; bounded by the function duration, so it suits small and mid
 *    databases and defers the rest to the next tick.
 *
 * Nothing decides this at build time — it is whether REDIS_URL exists, so a
 * deployment can grow a worker later without a rewrite.
 */

export function hasQueue(): boolean {
  return Boolean(process.env.REDIS_URL);
}

/** True on Vercel (or any single-region serverless host). */
export function isServerless(): boolean {
  return Boolean(process.env.VERCEL);
}

/**
 * How long one cron tick may run before it stops and leaves the rest to the
 * next tick. Vercel's default duration is 300s; stopping well short of it means
 * a slow customer database can never kill the whole tick.
 */
export function tickBudgetMs(): number {
  const configured = Number(process.env.CRON_TICK_BUDGET_MS ?? 0);
  if (Number.isFinite(configured) && configured > 1_000) return configured;
  return 50_000;
}

/**
 * Run tasks with bounded concurrency, stopping when the deadline passes.
 * Returns how many ran and how many were left for the next tick.
 */
export async function runBounded(
  tasks: (() => Promise<void>)[],
  concurrency: number,
  deadline: number,
): Promise<{ done: number; skipped: number }> {
  let next = 0;
  let done = 0;

  async function lane(): Promise<void> {
    for (;;) {
      if (Date.now() >= deadline) return;
      const index = next++;
      if (index >= tasks.length) return;
      try {
        await tasks[index]();
      } catch (err) {
        console.error("[runtime] task failed", err);
      }
      done++;
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, tasks.length)) }, lane),
  );
  return { done, skipped: Math.max(0, tasks.length - done) };
}
