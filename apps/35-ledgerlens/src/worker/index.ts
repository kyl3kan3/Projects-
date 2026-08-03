/**
 * The optional long-lived worker.
 *
 * ARCHITECTURE.md calls for a standalone Node process consuming BullMQ queues. On the
 * actual deployment target (Vercel + Neon) there are no always-on processes and Hobby cron
 * fires once a day, so the background work is written as one idempotent sweep that
 * `/api/cron/tick` drives. This process exists for the other shape: an operator running
 * LedgerLens on a box, or a deployment that wants extraction to land in seconds rather than
 * when the next request happens to arrive.
 *
 * It contains no scheduling logic of its own. It calls exactly the function the cron route
 * calls, which is why running both at once is harmless rather than a double-send.
 */

import { config } from "dotenv";
import { closeDb } from "@/db";
import { runSweep } from "@/lib/sweep";

config({ path: [".env.local", ".env"], quiet: true });

const INTERVAL_MS = Math.max(15_000, Number(process.env.WORKER_INTERVAL_MS ?? 60_000));

let stopping = false;

async function tick(): Promise<void> {
  const startedAt = Date.now();
  try {
    const result = await runSweep({ budgetMs: INTERVAL_MS - 2_000 });
    const parts = [
      `${result.extracted} extracted`,
      result.parked > 0 ? `${result.parked} parked over cap` : null,
      result.closed.length > 0 ? `${result.closed.length} closed` : null,
      result.blocked.length > 0 ? `${result.blocked.length} blocked` : null,
      result.nudges > 0 ? `${result.nudges} nudges` : null,
      result.digests > 0 ? `${result.digests} digests` : null,
      result.timedOut ? "hit the budget" : null,
    ].filter(Boolean);
    console.log(`[worker] swept in ${Date.now() - startedAt}ms — ${parts.join(", ")}`);
  } catch (err) {
    // Never exit on a bad sweep: the next one may well succeed, and a dead worker means an
    // operator's receipts silently stop being read.
    console.error("[worker] sweep failed", err);
  }
}

export async function startWorker(): Promise<void> {
  console.log(`[worker] LedgerLens sweep loop starting — every ${Math.round(INTERVAL_MS / 1000)}s`);
  await tick();
  while (!stopping) {
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
    if (stopping) break;
    await tick();
  }
  await closeDb();
  console.log("[worker] stopped");
}

function shutdown(signal: string): void {
  console.log(`[worker] ${signal} received — finishing the current sweep and exiting`);
  stopping = true;
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Run when invoked directly (`npm run worker`), not when imported by a test.
if (process.argv[1]?.includes("worker")) {
  void startWorker();
}
