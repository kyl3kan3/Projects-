/**
 * src/worker/index.ts
 *
 * The optional long-lived worker. It does nothing the cron route does not — both
 * call `runPipelineTick` — the difference is cadence: this polls every few
 * seconds, so a draft lands about two minutes after the session instead of at
 * the next cron pass.
 *
 * Deploying it is a choice. On Vercel alone the app is complete: capture kicks
 * the pipeline inline via `after()`, and the daily cron is the safety net for
 * anything that failed and is owed a retry.
 */

import "@/lib/load-env";
import { runPipelineTick } from "@/lib/pipeline";
import { closeDb } from "@/db";

const INTERVAL_MS = Number.parseInt(process.env.WORKER_INTERVAL_MS ?? "5000", 10);

let stopping = false;

async function loop(): Promise<void> {
  while (!stopping) {
    const started = Date.now();
    try {
      const result = await runPipelineTick({ budgetMs: 45_000 });
      if (
        result.claimed ||
        result.drafted ||
        result.failed ||
        result.audioPurged ||
        result.transcriptsPurged
      ) {
        console.log(
          `[worker] claimed=${result.claimed} transcribed=${result.transcribed} drafted=${result.drafted} failed=${result.failed} purged=${result.audioPurged}/${result.transcriptsPurged} in ${result.ms}ms`,
        );
      }
    } catch (err) {
      console.error("[worker] tick failed", err);
    }
    const wait = Math.max(1_000, INTERVAL_MS - (Date.now() - started));
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

export async function main(): Promise<void> {
  console.log(`[worker] started, polling every ${INTERVAL_MS}ms`);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      if (stopping) process.exit(1);
      console.log(`[worker] ${signal} received, draining`);
      stopping = true;
    });
  }
  await loop();
  await closeDb();
  console.log("[worker] stopped");
}

main().catch((err) => {
  console.error("[worker] fatal", err);
  process.exit(1);
});
