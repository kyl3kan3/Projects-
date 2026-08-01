/**
 * The worker: a plain Node loop that calls the same tick the cron route calls.
 *
 * ARCHITECTURE.md asks for a long-lived process (Railway/Fly), and this is it. It
 * holds no logic of its own — every decision is in src/lib/tick.ts, so the two
 * deployment shapes cannot drift apart.
 *
 * Deliberately not BullMQ. The work here is driven entirely by database state
 * (which charges exist, which reminders are due) rather than by queue position, so
 * a polling loop is both simpler and more robust: a missed interval self-heals on
 * the next pass, and there is no Redis to keep alive. It is also what lets the
 * exact same code run on Vercel with no always-on process at all.
 *
 *   npm run worker                     # every 5 minutes
 *   TICK_INTERVAL_MS=60000 npm run worker
 */

import "@/lib/load-env";
import { closeDb } from "@/db";
import { runTick } from "@/lib/tick";
import { tickBudgetMs } from "@/lib/runtime";

const INTERVAL_MS = Number(process.env.TICK_INTERVAL_MS ?? 5 * 60 * 1000);

let running = false;
let stopping = false;

async function tickOnce(): Promise<void> {
  if (running) {
    console.warn("[worker] previous tick still running, skipping this one");
    return;
  }
  running = true;
  try {
    const result = await runTick(new Date(), { deadline: Date.now() + tickBudgetMs() });
    console.info("[worker] tick", result);
  } catch (err) {
    console.error("[worker] tick failed", err);
  } finally {
    running = false;
  }
}

export async function startWorker(): Promise<void> {
  console.info(`[worker] starting, tick every ${Math.round(INTERVAL_MS / 1000)}s`);
  await tickOnce();

  const timer = setInterval(() => {
    if (!stopping) void tickOnce();
  }, INTERVAL_MS);

  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.info(`[worker] ${signal} received, draining`);
    clearInterval(timer);
    // Let an in-flight tick finish rather than killing it mid-ledger-write.
    const deadline = Date.now() + 30_000;
    while (running && Date.now() < deadline) await new Promise((r) => setTimeout(r, 200));
    await closeDb();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

// `npm run worker` executes this module directly.
if (process.argv[1]?.includes("worker")) {
  void startWorker();
}
