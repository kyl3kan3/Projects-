/**
 * The optional long-lived worker.
 *
 * ARCHITECTURE.md calls for worker processes (a Redis/BullMQ fleet). On the actual
 * deployment target — Vercel + Neon — there are no always-on processes, so the tick
 * runs from `/api/cron/tick` and this process is not required. A team running
 * CloudSpend on a box, or one that wants a shorter interval than a Hobby cron's
 * once-a-day, can run `npm run worker` and get identical behaviour.
 *
 * It contains no scheduling logic of its own: it calls exactly the function the
 * cron route calls, which is idempotent, which is why running both at once is
 * harmless rather than a double-send.
 */

import { config } from "dotenv";
import { closeDb } from "@/db";
import { runTick } from "@/lib/tick";

config({ path: [".env.local", ".env"], quiet: true });

const INTERVAL_MS = Math.max(60_000, Number(process.env.WORKER_INTERVAL_MS ?? 900_000));

let stopping = false;

async function tick(): Promise<void> {
  const startedAt = Date.now();
  try {
    const result = await runTick({ budgetMs: INTERVAL_MS - 5_000 });
    const totals = result.orgs.reduce(
      (sum, org) => {
        for (const account of org.accounts) {
          sum.facts += account.factsIngested + account.curFacts;
          sum.opened += account.anomaliesOpened;
          sum.resolved += account.anomaliesResolved;
        }
        sum.budgets += org.budgetAlertsSent;
        sum.digests += org.digestSent ? 1 : 0;
        return sum;
      },
      { facts: 0, opened: 0, resolved: 0, budgets: 0, digests: 0 },
    );
    console.log(
      `[worker] ticked ${result.orgs.length} org(s) in ${Date.now() - startedAt}ms — ` +
        `${totals.facts} facts, ${totals.opened} opened, ${totals.resolved} resolved, ` +
        `${totals.budgets} budget alert(s), ${totals.digests} digest(s)` +
        (result.outOfTime ? " [budget exhausted; resuming next tick]" : ""),
    );
  } catch (err) {
    // Never exit on a bad tick: the next one may succeed, and a dead worker means
    // a customer's cost monitoring silently stops.
    console.error("[worker] tick failed", err);
  }
}

export async function startWorker(): Promise<void> {
  console.log(`[worker] CloudSpend tick loop starting — every ${Math.round(INTERVAL_MS / 1000)}s`);
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
  console.log(`[worker] ${signal} received — finishing this tick and exiting`);
  stopping = true;
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Run when invoked directly (`npm run worker`), not when imported by a test.
if (process.argv[1]?.includes("worker")) {
  void startWorker();
}
