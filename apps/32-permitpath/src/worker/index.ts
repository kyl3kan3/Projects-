/**
 * The long-lived worker.
 *
 * ARCHITECTURE.md's shape: a standalone Node process on Railway/Fly that crawls,
 * diffs, sweeps expiries, and fans out alerts, independent of web deploys. It is a
 * loop around `runTick` rather than a queue consumer — the work is a bounded sweep
 * over rows the database already orders for us, and adding Redis to schedule it
 * would buy nothing but another service to operate.
 *
 * On Vercel there is no always-on process, so the same pass runs from
 * /api/cron/tick instead. Run one or the other, not both.
 */

import "@/lib/load-env";
import { closeDb } from "@/db";
import { runTick } from "@/lib/tick";
import { tickBudgetMs, workerIntervalMs } from "@/lib/runtime";

let stopping = false;

async function loop(): Promise<void> {
  const interval = workerIntervalMs();
  console.info(`[worker] started, tick every ${Math.round(interval / 1000)}s`);

  while (!stopping) {
    const startedAt = Date.now();
    try {
      const summary = await runTick({ deadline: startedAt + tickBudgetMs() });
      console.info("[worker] tick", summary);
    } catch (err) {
      console.error("[worker] tick failed", err);
    }
    const elapsed = Date.now() - startedAt;
    const wait = Math.max(1_000, interval - elapsed);
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

function shutdown(signal: string): void {
  if (stopping) return;
  stopping = true;
  console.info(`[worker] ${signal} received, finishing current tick`);
  void closeDb().then(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

loop().catch(async (err) => {
  console.error("[worker] fatal", err);
  await closeDb();
  process.exit(1);
});
