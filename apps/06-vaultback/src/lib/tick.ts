/**
 * One unit of background work, shared by the cron route and the worker process.
 *
 * Order matters and is deliberate:
 *
 *   1. dispatch  — claim due policies, alert on missed slots. Cheap, must never
 *                  be starved by slow work, so it happens first.
 *   2. reap      — fail jobs whose process died, so a crash does not leave a job
 *                  "running" forever and block the next slot's alerting.
 *   3. backups   — run queued jobs with bounded concurrency, inside a deadline.
 *   4. drills    — one at a time; a drill restores a whole database.
 *   5. prune     — delete snapshots past retention, oldest first.
 *
 * Everything is bounded by `budgetMs`. Work that does not fit is left queued and
 * picked up by the next tick, which is why the queue lives in Postgres: there is
 * no in-memory state to lose between invocations.
 */

import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { backupJobs, restoreDrills, type BackupJob } from "@/db/schema";
import { pruneExpiredSnapshots, reapStuckJobs, runBackupJob } from "@/lib/backups";
import { runDrill } from "@/lib/drills";
import { runBounded, tickBudgetMs } from "@/lib/runtime";
import { dispatchDueBackups, dispatchDueDrills } from "@/lib/scheduler";

export interface TickOptions {
  budgetMs?: number;
  concurrency?: number;
  maxBackups?: number;
  maxDrills?: number;
  /** Skip the retention pruner — used by tests that assert on snapshot rows. */
  skipPrune?: boolean;
}

export interface TickSummary {
  claimed: number;
  missed: number;
  reaped: number;
  backupsRun: number;
  backupsDeferred: number;
  drillsRun: number;
  snapshotsPruned: number;
  tookMs: number;
}

/** Queued jobs, oldest first, including any left over from previous ticks. */
async function queuedJobs(limit: number): Promise<BackupJob[]> {
  const db = getDb();
  return db
    .select()
    .from(backupJobs)
    .where(eq(backupJobs.status, "queued"))
    .orderBy(asc(backupJobs.createdAt))
    .limit(limit);
}

export async function runTick(opts: TickOptions = {}): Promise<TickSummary> {
  const startedAt = Date.now();
  const budget = opts.budgetMs ?? tickBudgetMs();
  const deadline = startedAt + budget;
  const concurrency = opts.concurrency ?? Number(process.env.CRON_CONCURRENCY ?? 3);
  const maxBackups = opts.maxBackups ?? Number(process.env.CRON_MAX_BACKUPS ?? 25);
  const maxDrills = opts.maxDrills ?? Number(process.env.CRON_MAX_DRILLS ?? 2);

  const dispatch = await dispatchDueBackups(maxBackups);
  await dispatchDueDrills(maxDrills);

  let reaped = 0;
  try {
    reaped = await reapStuckJobs();
  } catch (err) {
    console.error("[tick] reaping stuck jobs failed", err);
  }

  const jobs = await queuedJobs(maxBackups);
  const tasks = jobs.map((job) => async () => {
    await runBackupJob(job.id);
  });
  const { done, skipped } = await runBounded(tasks, concurrency, deadline);

  // Drills are single-file: each one restores an entire database, and running two
  // at once on the scratch server would make both look slow.
  let drillsRun = 0;
  const drillIds = await pendingDrillIds(maxDrills);
  for (const drillId of drillIds) {
    if (Date.now() >= deadline) break;
    try {
      await runDrill(drillId);
      drillsRun++;
    } catch (err) {
      console.error(`[tick] drill ${drillId} threw`, err);
    }
  }

  let pruned = 0;
  if (!opts.skipPrune && Date.now() < deadline) {
    try {
      pruned = await pruneExpiredSnapshots();
    } catch (err) {
      console.error("[tick] retention pruning failed", err);
    }
  }

  const summary: TickSummary = {
    claimed: dispatch.claimed,
    missed: dispatch.missed,
    reaped,
    backupsRun: done,
    backupsDeferred: skipped,
    drillsRun,
    snapshotsPruned: pruned,
    tookMs: Date.now() - startedAt,
  };
  console.info("[tick]", summary);
  return summary;
}

/**
 * Drills waiting to run — the ones this tick created plus any left behind by a
 * previous tick that ran out of budget. They are all `queued` rows, so one query
 * covers both cases.
 */
async function pendingDrillIds(limit: number): Promise<string[]> {
  const db = getDb();
  const queued = await db
    .select({ id: restoreDrills.id })
    .from(restoreDrills)
    .where(eq(restoreDrills.status, "queued"))
    .orderBy(asc(restoreDrills.createdAt))
    .limit(limit);
  return queued.map((row) => row.id);
}
