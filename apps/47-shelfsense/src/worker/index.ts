/**
 * The long-lived worker, for anyone hosting one.
 *
 * ARCHITECTURE.md calls for a standalone Node process; the deployment target
 * (Vercel) has no such thing, so the primary shape is the cron route at
 * `/api/cron/tick`. Both drive the identical `runTick` — this file is a loop around
 * it, nothing more, which is the point: there is one implementation of the
 * background work and two ways to invoke it, so the two shapes cannot drift.
 *
 * Run with `npm run worker`. It is also the fastest way to watch a backfill happen.
 */

// Must be first: this is a plain Node process, not Next, so nothing has loaded
// .env.local yet.
import "@/lib/load-env";

import { closeDb } from "@/db";
import { runTick, tickHealth } from "@/lib/tick";

const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 30_000);
let running = true;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function shutdown(signal: string): Promise<void> {
  console.info(`[worker] ${signal} — finishing the current tick and stopping`);
  running = false;
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

export async function main(): Promise<void> {
  const health = await tickHealth();
  console.info(`[worker] starting — ${health.shops} active shop(s), interval ${INTERVAL_MS}ms`);

  while (running) {
    const startedAt = Date.now();
    try {
      const summary = await runTick({ deadline: startedAt + Math.max(5_000, INTERVAL_MS - 2_000) });
      const busy =
        summary.webhooksProcessed ||
        summary.backfillsAdvanced ||
        summary.shopsRecomputed ||
        summary.digestsSent;
      if (busy) console.info("[worker] tick", summary);
    } catch (err) {
      console.error("[worker] tick failed", err);
    }
    const elapsed = Date.now() - startedAt;
    await sleep(Math.max(1_000, INTERVAL_MS - elapsed));
  }

  await closeDb();
  console.info("[worker] stopped");
}

// Only run the loop when invoked directly, so the module stays importable.
if (process.argv[1]?.includes("worker/index")) {
  void main().catch((err) => {
    console.error("[worker] fatal", err);
    process.exit(1);
  });
}
