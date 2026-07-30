/**
 * Scheduler: the brain. Four jobs in one process, which is the right size at
 * MVP scale (ARCHITECTURE.md — split later if it stops being).
 *
 *   1. Dispatch  — enqueue due checks onto per-region queues.
 *   2. Consume   — drain results, write them, run the incident state machine.
 *   3. Sweep     — every minute, open incidents for heartbeats that never pinged.
 *   4. Prune     — daily, drop raw check_results past the plan's retention.
 *
 * Run with: npm run worker:scheduler
 */

// Must be first: the workers are plain Node processes, not Next.
import "@/lib/load-env";

import { Worker, type Job } from "bullmq";
import { and, eq, inArray, lte, ne, sql } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { checkResults, monitors, teams, type Monitor } from "@/db/schema";
import {
  checksQueue,
  connectionOptions,
  QUEUE_PREFIX,
  RESULTS_QUEUE,
  type CheckJob,
  type CheckResultJob,
} from "@/lib/queue";
import {
  clearExpiryIncidentIfRenewed,
  recordDomainScan,
  recordResult,
  recordSslScan,
} from "@/lib/incidents";
import { sweepMissedHeartbeats } from "@/lib/heartbeats";
import { plan } from "@/lib/plans";
import { env } from "@/lib/env";

const TICK_MS = Number(process.env.SCHEDULER_TICK_MS ?? 1_000);
const SWEEP_MS = 60_000;
const PRUNE_MS = 6 * 60 * 60 * 1000;
/** Guard against a backlog turning one tick into a thundering herd. */
const MAX_DISPATCH_PER_TICK = 500;

let running = true;

/* ------------------------------------------------------------- dispatch --- */

function jobFor(monitor: Monitor): CheckJob | null {
  const kind =
    monitor.type === "http" ? "http" : monitor.type === "ssl" ? "ssl" : monitor.type === "domain" ? "domain" : null;
  if (!kind) return null; // heartbeats are swept, never dispatched
  return {
    monitorId: monitor.id,
    tick: Date.now(),
    kind,
    target: monitor.target,
    timeoutMs: monitor.timeoutMs,
    expectedStatusCodes: monitor.expectedStatusCodes,
    keyword: monitor.keyword,
    keywordInvert: monitor.keywordInvert,
    followRedirects: monitor.followRedirects,
    requestHeaders: monitor.requestHeaders ?? null,
  };
}

async function dispatchDue(): Promise<number> {
  const db = getDb();
  const now = new Date();

  const due = await db
    .select()
    .from(monitors)
    .where(
      and(
        lte(monitors.nextDueAt, now),
        ne(monitors.status, "paused"),
        inArray(monitors.type, ["http", "ssl", "domain"]),
      ),
    )
    .limit(MAX_DISPATCH_PER_TICK);
  if (!due.length) return 0;

  // Advance the due time *before* enqueueing so a slow enqueue can never cause
  // the same monitor to be dispatched twice on the next tick.
  await db
    .update(monitors)
    .set({ nextDueAt: sql`now() + (${monitors.intervalSeconds} * interval '1 second')` })
    .where(inArray(monitors.id, due.map((m) => m.id)));

  let enqueued = 0;
  for (const monitor of due) {
    const job = jobFor(monitor);
    if (!job) continue;
    // Expiry scans only need one vantage point; uptime checks fan out.
    const regions =
      monitor.type === "http" ? monitor.regions : monitor.regions.slice(0, 1);
    for (const region of regions.length ? regions : env.probeRegions.slice(0, 1)) {
      await checksQueue(region).add("check", job, {
        // One job per monitor per tick per region, even if we retry the loop.
        jobId: `${monitor.id}:${job.tick}:${region}`,
      });
      enqueued += 1;
    }
  }
  return enqueued;
}

/* -------------------------------------------------------------- consume --- */

async function handleResult(result: CheckResultJob): Promise<void> {
  const db = getDb();
  const [monitor] = await db.select().from(monitors).where(eq(monitors.id, result.monitorId));
  if (!monitor) return;

  if (monitor.type === "ssl") {
    const notAfter = result.expiry?.notAfter ? new Date(result.expiry.notAfter) : null;
    await recordSslScan(monitor, {
      notAfter,
      issuer: result.expiry?.issuer ?? null,
      subject: result.expiry?.subject ?? null,
      error: result.errorDetail ?? undefined,
    });
    const days = notAfter ? Math.floor((notAfter.getTime() - Date.now()) / 86_400_000) : null;
    await clearExpiryIncidentIfRenewed(monitor, "ssl_expiry", days);
    return;
  }

  if (monitor.type === "domain") {
    const expiresAt = result.expiry?.notAfter ? new Date(result.expiry.notAfter) : null;
    await recordDomainScan(monitor, {
      expiresAt,
      registrar: result.expiry?.registrar ?? null,
      error: result.errorDetail ?? undefined,
    });
    const days = expiresAt ? Math.floor((expiresAt.getTime() - Date.now()) / 86_400_000) : null;
    await clearExpiryIncidentIfRenewed(monitor, "domain_expiry", days);
    return;
  }

  await recordResult(result);
}

const resultsWorker = new Worker<CheckResultJob>(
  RESULTS_QUEUE,
  async (job: Job<CheckResultJob>) => {
    await handleResult(job.data);
  },
  { connection: connectionOptions(), prefix: QUEUE_PREFIX, concurrency: 20 },
);

resultsWorker.on("failed", (job, err) => {
  console.error(`[scheduler] result ${job?.id} failed`, err);
});

/* ----------------------------------------------------------------- prune --- */

/**
 * Drop raw results past each plan's retention. The daily rollup is what the
 * 90-day bars read, so pruning never costs a status page any history.
 */
async function pruneOldResults(): Promise<number> {
  const db = getDb();
  let removed = 0;
  for (const planId of ["free", "solo", "team"] as const) {
    const days = plan(planId).retentionDays;
    // Passed as an ISO string with an explicit cast: a Date object inside a raw
    // sql template is not serialised by the driver.
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    const result = await db.execute(sql`
      delete from ${checkResults}
      where ${checkResults.checkedAt} < ${cutoff}::timestamptz
        and ${checkResults.monitorId} in (
          select ${monitors.id} from ${monitors}
          join ${teams} on ${teams.id} = ${monitors.teamId}
          where ${teams.plan} = ${planId}
        )
    `);
    removed += (result as unknown as { count?: number }).count ?? 0;
  }
  return removed;
}

/* ------------------------------------------------------------------ loops --- */

async function everyTick(): Promise<void> {
  while (running) {
    const startedAt = Date.now();
    try {
      const n = await dispatchDue();
      if (n > 0) console.info(`[scheduler] dispatched ${n} checks`);
    } catch (err) {
      console.error("[scheduler] dispatch failed", err);
    }
    const elapsed = Date.now() - startedAt;
    await sleep(Math.max(0, TICK_MS - elapsed));
  }
}

async function everySweep(): Promise<void> {
  while (running) {
    try {
      const opened = await sweepMissedHeartbeats();
      if (opened > 0) console.info(`[scheduler] opened ${opened} missed-heartbeat incidents`);
    } catch (err) {
      console.error("[scheduler] heartbeat sweep failed", err);
    }
    await sleep(SWEEP_MS);
  }
}

async function everyPrune(): Promise<void> {
  while (running) {
    try {
      const removed = await pruneOldResults();
      if (removed > 0) console.info(`[scheduler] pruned ${removed} old check results`);
    } catch (err) {
      console.error("[scheduler] prune failed", err);
    }
    await sleep(PRUNE_MS);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function shutdown(signal: string): Promise<void> {
  console.info(`[scheduler] ${signal} — draining`);
  running = false;
  await resultsWorker.close();
  await closeDb();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

console.info(
  `[scheduler] starting — tick ${TICK_MS}ms, regions ${env.probeRegions.join(", ")}`,
);
void Promise.all([everyTick(), everySweep(), everyPrune()]);

/** Exported so ops scripts can run a single pass without the loops. */
export { dispatchDue, handleResult, pruneOldResults };
