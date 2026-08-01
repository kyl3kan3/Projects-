/**
 * The interval worker.
 *
 * ARCHITECTURE.md specifies a long-lived BullMQ process on Railway or Fly. That is
 * a perfectly good way to run this, and it is what this entrypoint is for — but it
 * is not the only way, and the primary deployment target (Vercel) cannot host it.
 *
 * So the sweep itself lives in `src/lib/sweep.ts` and there are two ways to invoke
 * it: `/api/cron/tick` on a schedule, or this process on an interval. There is no
 * queue in between because there is nothing to fan out: the sweep is one pass over
 * deadlines whose ordering does not matter, and the exactly-once guarantee comes
 * from a unique index rather than from a job broker. Adding Redis and BullMQ here
 * would add two failure modes and remove none.
 *
 * Run with: npm run worker
 */

import { closeDb } from "@/db";
import { runSweep } from "@/lib/sweep";

const INTERVAL_MS = Number(process.env.SWEEP_INTERVAL_MS ?? 3_600_000); // hourly

let running = false;
let stopping = false;

async function tick(): Promise<void> {
  if (running || stopping) return;
  running = true;
  try {
    const summary = await runSweep();
    console.info("[worker] sweep", summary);
  } catch (err) {
    console.error("[worker] sweep failed", err);
  } finally {
    running = false;
  }
}

export async function main(): Promise<void> {
  console.info(`[worker] starting; sweeping every ${Math.round(INTERVAL_MS / 1000)}s`);
  await tick();
  const timer = setInterval(() => void tick(), INTERVAL_MS);

  const shutdown = async (signal: string) => {
    console.info(`[worker] ${signal} — draining`);
    stopping = true;
    clearInterval(timer);
    // Let an in-flight sweep finish so a half-sent ladder is not left mid-rung.
    for (let i = 0; i < 60 && running; i++) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await closeDb();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

const invokedDirectly = process.argv[1]?.includes("worker");
if (invokedDirectly) {
  void main();
}
