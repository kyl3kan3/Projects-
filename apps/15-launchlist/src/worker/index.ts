/**
 * The standalone worker.
 *
 * Two deployment shapes, one body of work (DEPLOYING.md):
 *
 *  - On Vercel there is no always-on process, so `/api/cron/tick` does the work
 *    inline on a schedule with a bounded budget.
 *  - On a host that can run a process (Fly, Railway, a VPS) this loop does the
 *    same work continuously, which is what a launch-day blast wants.
 *
 * They must not race. This worker takes a Redis lock for each cycle, and the
 * cron route is expected to be disabled when a worker is running — the lock is
 * the belt to that braces. Without `REDIS_URL` the worker refuses to start
 * rather than running unlocked beside a cron.
 */

import "@/lib/load-env";
import Redis from "ioredis";
import { closeDb } from "@/db";
import { dueBlasts, runBlast } from "@/lib/blasts";
import { deliver, dueDeliveries } from "@/lib/webhooks";

const LOCK_KEY = "launchlist:worker:tick";
const LOCK_TTL_MS = 60_000;
const CYCLE_MS = 5_000;

let stopping = false;

async function acquire(redis: Redis, token: string): Promise<boolean> {
  const result = await redis.set(LOCK_KEY, token, "PX", LOCK_TTL_MS, "NX");
  return result === "OK";
}

async function release(redis: Redis, token: string): Promise<void> {
  // Only release a lock we still hold, so a slow cycle cannot delete the lock a
  // second worker legitimately took after ours expired.
  const current = await redis.get(LOCK_KEY);
  if (current === token) await redis.del(LOCK_KEY);
}

async function cycle(): Promise<{ blasts: number; delivered: number; failed: number }> {
  let blastCount = 0;
  for (const blast of await dueBlasts(3)) {
    await runBlast(blast, { batchSize: 50, budgetMs: 15_000 });
    blastCount++;
  }

  let delivered = 0;
  let failed = 0;
  for (const delivery of await dueDeliveries(50)) {
    const result = await deliver(delivery);
    if (result.ok) delivered++;
    else failed++;
  }

  return { blasts: blastCount, delivered, failed };
}

async function main(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.error(
      "[worker] REDIS_URL is not set. The worker needs it to hold the cycle lock; " +
        "without one, use the cron route (/api/cron/tick) instead.",
    );
    process.exit(1);
  }

  const redis = new Redis(url, { maxRetriesPerRequest: 3 });
  const token = `${process.pid}-${Date.now()}`;
  console.info("[worker] started");

  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.info(`[worker] ${signal} — finishing the current cycle`);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  while (!stopping) {
    if (await acquire(redis, token)) {
      try {
        const result = await cycle();
        if (result.blasts || result.delivered || result.failed) {
          console.info(
            `[worker] blasts=${result.blasts} webhooks=${result.delivered}/${result.delivered + result.failed}`,
          );
        }
      } catch (err) {
        console.error("[worker] cycle failed", err);
      } finally {
        await release(redis, token);
      }
    }
    if (stopping) break;
    await new Promise((resolve) => setTimeout(resolve, CYCLE_MS));
  }

  await redis.quit();
  await closeDb();
  console.info("[worker] stopped");
}

void main();
