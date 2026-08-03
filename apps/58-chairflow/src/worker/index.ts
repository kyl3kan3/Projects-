/**
 * src/worker/index.ts — `npm run worker`
 *
 * The long-lived shape of the same scheduler `/api/cron/tick` drives. It exists for hosts that
 * have processes (Fly, Railway, a VPS); on Vercel the cron route is the only shape available,
 * and both call the identical `runTick`.
 *
 * Running both at once is safe: every step takes its `job_leases` row first, and the expiry is
 * compared in SQL rather than against a JS `Date`, so a lease taken by the other shape is
 * respected instead of being stolen a millisecond early.
 *
 * SIGTERM drains: the tick in flight finishes, then the pool closes. Killing a tick halfway
 * through a reminder pass would be safe anyway — the unique index on
 * `(appointment, kind, channel)` means a resumed pass cannot re-send what already went — but
 * finishing cleanly keeps the logs readable.
 */

import "@/lib/load-env";
import { closeDb } from "@/db";
import { tickBudgetMs, workerIntervalMs } from "@/lib/runtime";
import { runTick } from "@/server/jobs";

let stopping = false;
let active: Promise<unknown> | null = null;

async function once(): Promise<void> {
  const started = Date.now();
  const report = await runTick({ deadline: Date.now() + tickBudgetMs() });
  const ran = report.steps.filter((s) => s.ran);
  console.log(
    `[worker] tick in ${Date.now() - started}ms · ${ran.length}/${report.steps.length} steps ran${
      report.budgetExhausted ? " · budget exhausted" : ""
    }`,
  );
  for (const step of report.steps) {
    console.log(`[worker]   ${step.name}: ${JSON.stringify(step.detail)}`);
  }
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set — copy .env.example to .env.local and fill it in");
  }
  const interval = workerIntervalMs();
  console.log(`[worker] started · tick every ${Math.round(interval / 1000)}s`);

  while (!stopping) {
    active = once().catch((err) => {
      console.error("[worker] tick failed:", err instanceof Error ? err.message : err);
    });
    await active;
    active = null;
    if (stopping) break;
    await sleep(interval);
  }

  await closeDb();
  console.log("[worker] stopped");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    // Do not hold the process open when a signal has already asked it to stop.
    if (stopping) {
      clearTimeout(timer);
      resolve();
    }
  });
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    if (stopping) process.exit(0);
    stopping = true;
    console.log(`[worker] ${signal} received — draining`);
    void Promise.resolve(active).then(async () => {
      await closeDb();
      process.exit(0);
    });
  });
}

main().catch((err) => {
  console.error("[worker] fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
