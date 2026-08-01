/**
 * The local worker: the same `runTick` the cron route calls, on a loop.
 *
 * Useful when running ClientDock on a box you own. On Vercel there is nothing to
 * run — the cron route is the deployment (see the repo's DEPLOYING.md) — and both
 * paths call the identical function, so behaviour can't drift between them.
 *
 * Usage: `npm run worker`
 */

import "@/lib/load-env";
import { closeDb } from "@/db";
import { runTick } from "@/lib/tick";

const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 15 * 60 * 1000);

let stopping = false;

async function loop() {
  while (!stopping) {
    try {
      const result = await runTick();
      console.info(
        `[worker] scanned ${result.scannedPortals} portals · ${result.nudgesSent} nudges · ${result.tokensExpired} tokens expired`,
      );
    } catch (err) {
      // Never exit on a transient database error: the next pass will do the work.
      console.error("[worker] tick failed", err);
    }
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
    void closeDb().finally(() => process.exit(0));
  });
}

void loop();
