/**
 * src/worker/index.ts — `npm run worker`.
 *
 * ARCHITECTURE.md specified a long-lived BullMQ process for the nightly work.
 * The deployment target does not have one: Vercel functions are invoked, they do
 * not run, and Hobby cron fires once a day. So the scheduled work lives in
 * `src/lib/sweeps.ts` and has two triggers — `/api/cron/tick` in production, and
 * this process in development, where waiting until 3am to find out whether the
 * retention scan works is no way to build anything.
 *
 * One implementation, two triggers. Nothing here is a second code path.
 *
 * The Redis dependency ARCHITECTURE.md asked for is still real and still load-
 * bearing: the sweep takes a `SET NX PX` lock (src/lib/lock.ts) so a developer's
 * worker and a cron invocation cannot both mail the same past-due parent. With no
 * REDIS_URL the worker says so and carries on.
 */

import { loadEnvLocal } from "@/lib/load-env";

loadEnvLocal();

import { closeDb } from "@/db";
import { closeLock, redisStatus, withSweepLock } from "@/lib/lock";
import { runSweeps, type SweepSummary } from "@/lib/sweeps";

const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 60_000);

export async function runOnce(): Promise<SweepSummary | null> {
  const { ran, reason, result } = await withSweepLock("sweeps", 120_000, () =>
    runSweeps({ budgetMs: 55_000 }),
  );
  if (!ran) {
    console.info(`[worker] skipped — ${reason}`);
    return null;
  }
  return result;
}

export async function startWorker(): Promise<void> {
  const redis = await redisStatus();
  console.info(
    redis.configured
      ? `[worker] redis ${redis.reachable ? "reachable" : "configured but unreachable"} — sweeps are locked`
      : "[worker] no REDIS_URL — running unlocked (single process assumed)",
  );

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    console.info("[worker] draining and shutting down");
    await closeLock();
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  console.info(`[worker] started, sweeping every ${INTERVAL_MS}ms`);
  while (!stopping) {
    try {
      const summary = await runOnce();
      if (summary) console.info("[worker] tick", summary);
    } catch (err) {
      console.error("[worker] sweep failed", err);
    }
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
  }
}

if (process.argv[1] && process.argv[1].includes("worker")) {
  void startWorker();
}
