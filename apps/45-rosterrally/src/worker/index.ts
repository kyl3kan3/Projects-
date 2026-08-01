/**
 * The local worker: `npm run worker`.
 *
 * ARCHITECTURE.md called for a long-lived BullMQ process. The deployment target
 * does not have one — Vercel functions are invoked, they do not run — so the
 * scheduled work lives in `/api/cron/tick` and this process exists to run exactly
 * the same sweeps in a loop during development, where waiting until 08:00 for a
 * cron to prove a reminder works is no way to build anything.
 *
 * One implementation, two triggers. Nothing here is a second code path.
 */

import { loadEnvLocal } from "@/lib/load-env";
import { closeDb } from "@/db";
import {
  chargeDueInstallments,
  chaseUnpaid,
  promoteWaitlists,
  sendDueGameReminders,
  sendDueVolunteerReminders,
} from "@/lib/sweeps";
import { todayIso } from "@/lib/time";

loadEnvLocal();

const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 60_000);

export async function runOnce(): Promise<Record<string, unknown>> {
  const asOf = todayIso();
  const summary: Record<string, unknown> = { asOf };
  summary.waitlistPromotions = await promoteWaitlists();
  summary.installments = await chargeDueInstallments(asOf);
  summary.chased = await chaseUnpaid(asOf);
  summary.gameReminders = await sendDueGameReminders();
  summary.volunteerReminders = await sendDueVolunteerReminders();
  return summary;
}

export async function startWorker(): Promise<void> {
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    console.info("[worker] shutting down");
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  console.info(`[worker] started, sweeping every ${INTERVAL_MS}ms`);
  while (!stopping) {
    try {
      console.info("[worker] tick", await runOnce());
    } catch (err) {
      console.error("[worker] sweep failed", err);
    }
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
  }
}

// Run when invoked directly (`npm run worker`), not when imported by a test.
if (process.argv[1]?.includes("worker")) {
  void startWorker();
}
