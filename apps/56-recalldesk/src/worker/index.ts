/**
 * src/worker/index.ts — `npm run worker`
 *
 * The long-lived shape of the scheduler, for a host that has always-on processes
 * (Fly, Railway, a VPS). It calls exactly the same `runTick` as
 * `/api/cron/tick`, so there is one implementation of every job and no chance of
 * the two drifting.
 *
 * ARCHITECTURE.md specifies BullMQ workers over Redis. The jobs, their order and
 * their boundaries are as specified; the transport is not, because the deployment
 * target is Vercel, which has no process for a queue consumer to live in, and a
 * second scheduling mechanism that only works in one of the two shapes is worse
 * than one that works in both. Mutual exclusion comes from `job_leases` rather than
 * Redis, compared in SQL against `now()`, so this process and a cron route can run
 * simultaneously without double-sending.
 *
 * Graceful shutdown: SIGTERM stops the loop and lets the tick in flight finish, so
 * a deploy never severs a send half-way through.
 */

import "@/lib/load-env";
import { closeDb } from "@/db";
import { runTick } from "@/server/jobs";
import { tickBudgetMs } from "@/lib/runtime";

const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 60_000);

let stopping = false;
let active: Promise<unknown> | null = null;

async function loop(): Promise<void> {
  console.log(
    `[worker] started · interval ${Math.round(INTERVAL_MS / 1000)}s · budget ${Math.round(tickBudgetMs() / 1000)}s`,
  );

  while (!stopping) {
    const startedAt = Date.now();
    try {
      active = runTick({ deadline: startedAt + tickBudgetMs() });
      const report = await active;
      // PHI-free by construction: counts and ids only.
      console.log(`[worker] tick ${JSON.stringify(report)}`);
    } catch (error) {
      console.error("[worker] tick failed", error instanceof Error ? error.message : error);
    } finally {
      active = null;
    }

    const elapsed = Date.now() - startedAt;
    const wait = Math.max(1_000, INTERVAL_MS - elapsed);
    for (let waited = 0; waited < wait && !stopping; waited += 250) {
      await sleep(250);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log(`[worker] ${signal} — draining`);
  if (active) {
    try {
      await active;
    } catch {
      // Already logged by the loop.
    }
  }
  await closeDb();
  console.log("[worker] stopped");
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

loop().catch(async (error) => {
  console.error("[worker] fatal", error);
  await closeDb();
  process.exit(1);
});
