/**
 * Standalone tick runner, for anyone self-hosting instead of deploying to
 * Vercel. It calls exactly the same `runTick` as the cron route, on a loop, so
 * there is one implementation of the background work and no second code path to
 * drift.
 *
 *   npm run worker            # every 15 minutes
 *   TICK_INTERVAL_MS=60000 npm run worker
 */

import "@/lib/load-env";
import { closeDb } from "@/db";
import { runTick } from "@/lib/tick";

const intervalMs = Number(process.env.TICK_INTERVAL_MS ?? 15 * 60 * 1000);
let stopping = false;

async function once(): Promise<void> {
  try {
    const report = await runTick();
    console.log(
      `[worker] tick in ${report.durationMs}ms · ${report.syncs.length} syncs · ${report.usersRecomputed} users${report.truncated ? " · truncated" : ""}`,
    );
    for (const sync of report.syncs) {
      if (!sync.ok) console.warn(`[worker] sync failed for ${sync.label}: ${sync.error}`);
    }
  } catch (err) {
    console.error("[worker] tick failed", err);
  }
}

async function main(): Promise<void> {
  console.log(`[worker] starting, tick every ${Math.round(intervalMs / 1000)}s`);
  while (!stopping) {
    await once();
    if (stopping) break;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  await closeDb();
  console.log("[worker] stopped");
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`[worker] ${signal} received, finishing the current tick`);
    stopping = true;
  });
}

void main();
