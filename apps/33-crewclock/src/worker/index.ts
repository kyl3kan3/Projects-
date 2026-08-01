/**
 * The long-lived worker (`npm run worker`).
 *
 * ARCHITECTURE.md describes this as BullMQ on Redis. The portfolio's deployment
 * target is Vercel + Neon, where there is no always-on process to run a queue
 * consumer, so the background work is one idempotent function — `runTick()` —
 * reachable two ways: this loop, for a Railway/Fly host, and
 * `/api/cron/tick`, for Vercel Cron. Both do the same work, and running both at
 * once is harmless because every alert the tick can send is guarded by a unique
 * constraint or a sent-at column.
 *
 * A queue buys ordering, retries and fan-out limits. None of those are load
 * bearing at this volume: the tick reads a handful of rows per org, sends at
 * most one email per worker per week, and is safe to repeat. Redis would be
 * infrastructure to operate with nothing to show for it — so it is not here, and
 * this file is the honest version of that decision.
 */

import "./load-env";
import { closeDb } from "@/db";
import { runTick } from "@/lib/tick";

const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 15 * 60 * 1000);

let stopping = false;
let running: Promise<unknown> | null = null;

async function once(): Promise<void> {
  const started = Date.now();
  try {
    const summary = await runTick();
    console.info("[worker] tick", summary);
  } catch (err) {
    console.error("[worker] tick failed", err);
  } finally {
    console.info(`[worker] tick finished in ${Date.now() - started}ms`);
  }
}

export async function startWorker(): Promise<void> {
  console.info(`[worker] starting; tick every ${Math.round(INTERVAL_MS / 1000)}s`);
  while (!stopping) {
    running = once();
    await running;
    running = null;
    if (stopping) break;
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
  }
}

/** Drain the in-flight tick before exiting, so a deploy never cuts one in half. */
async function shutdown(signal: string): Promise<void> {
  console.info(`[worker] ${signal} received, draining`);
  stopping = true;
  if (running) await running.catch(() => undefined);
  await closeDb();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

// Only run when executed directly, so importing this module in a test is safe.
if (process.argv[1] && process.argv[1].includes("worker")) {
  void startWorker();
}
