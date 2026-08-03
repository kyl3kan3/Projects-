/**
 * The long-lived worker.
 *
 * Optional. The product works on Vercel alone: uploads drain the queue through
 * `/api/jobs/run` while the operator watches, and `/api/cron/tick` sweeps anything left.
 * Run this when you would rather have a process that polls — a container on Railway or
 * Fly, where Chromium is also available for server-side PDF rendering.
 *
 *   npm run worker
 */

import "@/lib/load-env";
import { closeDb } from "@/db";
import { env } from "@/lib/env";
import { HANDLERS } from "@/lib/handlers";
import { runJobs } from "@/lib/jobs";

let running = true;

async function loop(): Promise<void> {
  const interval = Number.isFinite(env.workerIntervalMs) ? env.workerIntervalMs : 3_000;
  console.log(`GreenTally worker started; polling every ${interval}ms.`);

  while (running) {
    try {
      const summary = await runJobs(HANDLERS, { budgetMs: 25_000, maxJobs: 25 });
      if (summary.processed > 0 || summary.failed > 0) {
        console.log(
          `processed ${summary.processed}, failed ${summary.failed}${
            summary.errors.length ? ` — ${summary.errors.join(" | ")}` : ""
          }`,
        );
      }
    } catch (err) {
      // A transient database error must not end the process; the next tick retries.
      console.error("worker tick failed:", err instanceof Error ? err.message : err);
    }
    if (!running) break;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} received; finishing the current tick and closing the pool.`);
  running = false;
  await closeDb();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

loop().catch(async (err) => {
  console.error("worker failed:", err);
  await closeDb();
  process.exit(1);
});
