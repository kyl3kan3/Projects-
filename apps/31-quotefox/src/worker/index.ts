/**
 * The optional long-lived worker.
 *
 * ARCHITECTURE.md calls for a standalone Node process running BullMQ queues. The
 * actual deployment target is Vercel + Neon (repo DEPLOYING.md), which has no
 * always-on process, so in production:
 *
 *  - the transcription/drafting pipeline runs inline in the route that completes a
 *    walkthrough, with its status machine persisted so the capture screen can poll;
 *  - the follow-up nudges, proposal expiry and trial expiry run from
 *    `/api/cron/tick`, once a day, protected by CRON_SECRET.
 *
 * This process exists for a shop self-hosting QuoteFox, or an operator who wants
 * nudges evaluated hourly instead of daily, and for retrying walkthroughs whose
 * inline processing died mid-flight. It contains no scheduling logic of its own: it
 * calls exactly the functions the routes call, all of which are idempotent, so
 * running this *and* the cron at the same time is harmless rather than a
 * double-send.
 */

import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { organizations } from "@/db/schema";
import { runSweep } from "@/lib/sweep";
import { completeWalkthrough, stalledWalkthroughs } from "@/lib/walkthroughs";

config({ path: [".env.local", ".env"], quiet: true });

const INTERVAL_MS = Math.max(60_000, Number(process.env.WORKER_INTERVAL_MS ?? 900_000));

let stopping = false;

/** Pick up walkthroughs whose inline processing never finished. */
async function retryStalled(): Promise<number> {
  const db = getDb();
  const stalled = await stalledWalkthroughs(10);
  let retried = 0;
  for (const walkthrough of stalled) {
    // Only touch ones that have been stuck for more than five minutes: a
    // walkthrough that is genuinely mid-draft right now must be left alone.
    if (Date.now() - walkthrough.updatedAt.getTime() < 5 * 60_000) continue;
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, walkthrough.organizationId));
    if (!org) continue;
    const outcome = await completeWalkthrough(org, "system", walkthrough.id);
    console.log(
      `[worker] retried walkthrough ${walkthrough.id}: ${outcome.ok ? `drafted ${outcome.estimateId}` : outcome.code}`,
    );
    retried += 1;
  }
  return retried;
}

async function tick(): Promise<void> {
  const startedAt = Date.now();
  try {
    const retried = await retryStalled();
    const sweep = await runSweep({ budgetMs: INTERVAL_MS - 5_000 });
    console.log(
      `[worker] tick in ${Date.now() - startedAt}ms — ${retried} walkthrough(s) retried, ` +
        `${sweep.nudgesSent} nudge(s) sent, ${sweep.rungsSkipped} rung(s) skipped, ` +
        `${sweep.expired} proposal(s) expired, ${sweep.trialsExpired} trial(s) expired`,
    );
  } catch (err) {
    // Never exit on a bad tick: the next one may well succeed, and a dead worker
    // means a shop's follow-ups silently stop.
    console.error("[worker] tick failed", err);
  }
}

export async function startWorker(): Promise<void> {
  console.log(`[worker] QuoteFox worker starting — every ${Math.round(INTERVAL_MS / 1000)}s`);
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
  console.log(`[worker] ${signal} received — finishing the current tick and exiting`);
  stopping = true;
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Run when invoked directly (`npm run worker`), not when imported by a test.
if (process.argv[1]?.includes("worker")) {
  void startWorker();
}
