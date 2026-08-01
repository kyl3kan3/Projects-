/**
 * The optional long-lived worker.
 *
 * ARCHITECTURE.md calls for a standalone Node process. On the actual deployment
 * target (Vercel + Neon) the sweep runs from `/api/cron/tick`, so this process is
 * not required — but a firm running PaidWell on a box, or an operator who wants
 * finer-grained escalation than once a day, can run `npm run worker` and get the
 * same behaviour on a shorter interval.
 *
 * It deliberately contains no scheduling logic of its own. It calls exactly the
 * function the cron route calls, which is idempotent, which is why running both
 * at once is harmless rather than a double-send.
 */

import { config } from "dotenv";
import { closeDb } from "@/db";
import { runSweep } from "@/lib/sweep";

config({ path: [".env.local", ".env"], quiet: true });

const INTERVAL_MS = Math.max(60_000, Number(process.env.WORKER_INTERVAL_MS ?? 900_000));

let stopping = false;

async function tick(): Promise<void> {
  const startedAt = Date.now();
  try {
    const result = await runSweep({ budgetMs: INTERVAL_MS - 5_000 });
    const totals = result.firms.reduce(
      (sum, firm) => ({
        queued: sum.queued + firm.queuedForApproval,
        sent: sum.sent + firm.sent,
        broken: sum.broken + firm.promisesBroken,
      }),
      { queued: 0, sent: 0, broken: 0 },
    );
    console.log(
      `[worker] swept ${result.firms.length} firm(s) in ${Date.now() - startedAt}ms — ` +
        `${totals.queued} queued for approval, ${totals.sent} sent, ${totals.broken} promise(s) broken`,
    );
  } catch (err) {
    // Never exit on a bad sweep: the next tick may well succeed, and a dead
    // worker means a firm's follow-up silently stops.
    console.error("[worker] sweep failed", err);
  }
}

export async function startWorker(): Promise<void> {
  console.log(`[worker] PaidWell sweep loop starting — every ${Math.round(INTERVAL_MS / 1000)}s`);
  await tick();
  while (!stopping) {
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
    if (stopping) break;
    await tick();
  }
  await closeDb();
  console.log("[worker] stopped");
}

async function shutdown(signal: string): Promise<void> {
  console.log(`[worker] ${signal} received — finishing the current sweep and exiting`);
  stopping = true;
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

// Run when invoked directly (`npm run worker`), not when imported by a test.
if (process.argv[1]?.includes("worker")) {
  void startWorker();
}
