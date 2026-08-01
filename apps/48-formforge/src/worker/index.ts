/**
 * src/worker/index.ts
 *
 * The optional long-lived worker (Railway/Fly). It does nothing the cron route
 * does not: both call `runTick`. The difference is cadence — a worker polls every
 * minute, so a reminder lands within a minute of its scheduled time instead of at
 * the next daily cron.
 *
 * Deploying it is a choice, not a requirement. On Vercel alone the app is
 * complete; the reminder ladder just fires with daily granularity, which is why
 * every rung is a day or more apart. `DRY_RUN=1` keeps outbound email and SMS
 * simulated.
 */

import "@/lib/load-env";
import { runTick } from "@/lib/tick";
import { closeDb } from "@/db";

const INTERVAL_MS = Number.parseInt(process.env.WORKER_INTERVAL_MS ?? "60000", 10);

let stopping = false;

async function loop(): Promise<void> {
  while (!stopping) {
    const started = Date.now();
    try {
      const result = await runTick({ budgetMs: 45_000 });
      if (result.remindersSent || result.expired || result.retentionDeleted) {
        console.log(
          `[worker] expired=${result.expired} sent=${result.remindersSent} skipped=${result.remindersSkipped} failed=${result.remindersFailed} deleted=${result.retentionDeleted} in ${result.ms}ms`,
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
