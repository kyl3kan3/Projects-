/**
 * The worker: the same tick as `/api/cron/tick`, on a loop, without a function
 * duration ceiling.
 *
 * Run this on Railway/Fly (or a VPS) when databases are large enough that a
 * dump does not finish inside a serverless invocation, or when you want backups
 * more often than your Vercel plan's cron floor allows. It is safe to run
 * alongside the cron route: work is claimed with a conditional UPDATE on
 * `backup_policies.next_run_at` and a unique index on
 * (policy_id, scheduled_for), so whichever process gets there first wins and the
 * other sees nothing to do.
 *
 * **Why there is no BullMQ here**, though ARCHITECTURE.md names it: the queue is
 * already durable in Postgres (`backup_jobs` rows with a claimable status), and
 * job state has to live there anyway — the dashboard reads it. Adding Redis would
 * create a second source of truth for "is this job running", which is precisely
 * the inconsistency that makes backup products lie. Redis remains the right call
 * if this ever needs cross-process rate limiting or delayed retries with jitter.
 */

import "@/lib/load-env";
import { closeDb } from "@/db";
import { runTick } from "@/lib/tick";

const INTERVAL_MS = Number(process.env.WORKER_TICK_MS ?? 20_000);
/** No ceiling by default — a long dump is exactly why this process exists. */
const BUDGET_MS = Number(process.env.WORKER_BUDGET_MS ?? 15 * 60 * 1000);

let stopping = false;

async function loop(): Promise<void> {
  console.info(
    `[worker] started · tick every ${Math.round(INTERVAL_MS / 1000)}s · budget ${Math.round(
      BUDGET_MS / 1000,
    )}s`,
  );
  while (!stopping) {
    const started = Date.now();
    try {
      await runTick({ budgetMs: BUDGET_MS });
    } catch (err) {
      console.error("[worker] tick failed", err);
    }
    const elapsed = Date.now() - started;
    const wait = Math.max(1_000, INTERVAL_MS - elapsed);
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.info(`[worker] ${signal} received, finishing the current tick`);
  // The in-flight tick keeps its database handle; give it a moment, then close.
  setTimeout(async () => {
    await closeDb();
    process.exit(0);
  }, 2_000);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

void loop();
