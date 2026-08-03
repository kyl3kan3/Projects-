/**
 * src/worker/index.ts
 *
 * The standalone worker (`npm run worker`, tsx). Owns every recurring job in
 * ARCHITECTURE.md's Queue & Worker Jobs table:
 *
 *   poll-sources          repeatable, per source poll_interval_minutes
 *   score-matches         fan-out on changed notices and profile edits
 *   morning-scan          hourly sweep; each firm's own local scan hour gates it
 *   deadline-reminders    nightly; T-7/3/1 exactly-once via the reminders ledger
 *   refresh-staleness     weekly; recompute answer_blocks.stale
 *   process-stripe-event  enqueued by the webhook route
 *
 * The job bodies live in src/lib/jobs.ts, shared with the cron route, so this
 * file is only wiring: schedules, concurrency, retries, a dead-letter queue, and
 * a graceful shutdown that drains what is in flight.
 *
 * A note on the morning scan schedule: it runs hourly, not at 06:00 UTC. Firms
 * set a local scan hour and live in different timezones, and the per-firm
 * per-local-date dedupe key means an hourly sweep sends each firm exactly one
 * scan on their own morning.
 */

import "@/lib/load-env";

import type { Job } from "bullmq";
import { closeDb, getDb } from "@/db";
import { sources } from "@/db/schema";
import { env } from "@/lib/env";
import { hasQueue } from "@/lib/runtime";
import {
  QUEUES,
  QUEUE_PREFIX,
  closeQueues,
  getConnection,
  getQueue,
  type MorningScanJob,
  type PollSourcesJob,
  type ScoreMatchesJob,
  type StripeEventJob,
} from "@/lib/queue";
import {
  runDeadlineReminders,
  runMorningScans,
  runPollAndScore,
  runRefreshStaleness,
  runRescoreProfile,
  runStripeEvents,
} from "@/lib/jobs";
import { rescoreForOpportunities } from "@/lib/matching";

const shutdownHandlers: Array<() => Promise<void>> = [];

async function main(): Promise<void> {
  if (!hasQueue()) {
    console.error(
      "[worker] REDIS_URL is not set. This process is the queued deployment shape; " +
        "without Redis, use the cron-triggered route at /api/cron/tick instead.",
    );
    process.exit(1);
  }

  // Fail fast on a missing database URL rather than on the first job.
  void env.databaseUrl;

  const connection = await getConnection();
  if (!connection) throw new Error("Could not open a Redis connection.");

  const { Worker } = await import("bullmq");
  const dead = await getQueue(QUEUES.dead);

  /** Repeated failures go to the dead-letter queue, with the reason kept. */
  async function bury(queue: string, job: Job | undefined, error: Error): Promise<void> {
    console.error(`[worker] ${queue} job ${job?.id ?? "?"} failed:`, error.message);
    if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return;
    if (env.sentryDsn) {
      // Sentry is configured by DSN in production; there is deliberately no
      // client here so the worker has no network dependency in development.
      console.error(`[worker] would report to Sentry: ${queue}/${job.name}: ${error.message}`);
    }
    await dead?.add(
      `${queue}:${job.name}`,
      { queue, jobName: job.name, data: job.data, error: error.message },
      { removeOnComplete: false },
    );
  }

  const workers = [
    new Worker<PollSourcesJob>(
      QUEUES.pollSources,
      async (job) => {
        const result = await runPollAndScore({
          sourceIds: job.data.sourceId ? [job.data.sourceId] : undefined,
        });
        return {
          polls: result.polls.map((poll) => ({
            source: poll.sourceKey,
            upserted: poll.upserted,
            changed: poll.changed,
            status: poll.status,
            sampled: poll.sampled,
          })),
          matchesScored: result.matchesScored,
          hotAlerted: result.hotAlerted,
        };
      },
      // Two at a time: pacing lives inside the job, per source.
      { connection, prefix: QUEUE_PREFIX, concurrency: 2 },
    ),

    new Worker<ScoreMatchesJob>(
      QUEUES.scoreMatches,
      async (job) => {
        if (job.data.profileId) return await runRescoreProfile(job.data.profileId);
        if (job.data.opportunityIds?.length) {
          return await rescoreForOpportunities(job.data.opportunityIds);
        }
        return { skipped: true };
      },
      { connection, prefix: QUEUE_PREFIX, concurrency: 8 },
    ),

    new Worker<MorningScanJob>(
      QUEUES.morningScan,
      async (job) => await runMorningScans({ firmId: job.data.firmId }),
      { connection, prefix: QUEUE_PREFIX, concurrency: 2 },
    ),

    new Worker(
      QUEUES.deadlineReminders,
      async () => await runDeadlineReminders({}),
      { connection, prefix: QUEUE_PREFIX, concurrency: 1 },
    ),

    new Worker(
      QUEUES.refreshStaleness,
      async () => await runRefreshStaleness(),
      { connection, prefix: QUEUE_PREFIX, concurrency: 1 },
    ),

    new Worker<StripeEventJob>(
      QUEUES.stripeEvents,
      async () => await runStripeEvents(),
      { connection, prefix: QUEUE_PREFIX, concurrency: 4 },
    ),
  ];

  for (const worker of workers) {
    worker.on("failed", (job, error) => {
      void bury(worker.name, job, error as Error);
    });
    worker.on("ready", () => console.info(`[worker] ${worker.name} ready`));
    shutdownHandlers.push(async () => {
      await worker.close();
    });
  }

  await registerSchedules();

  console.info(
    `[worker] running ${workers.length} workers: ${workers.map((w) => w.name).join(", ")}`,
  );
}

/**
 * Repeatable schedules, registered on boot and idempotent by job id — a restart
 * re-registers the same keys rather than doubling them.
 *
 * Per-source polling intervals come from the `sources` table, so adding a state
 * portal is a seed row, not a deploy.
 */
async function registerSchedules(): Promise<void> {
  const pollQueue = await getQueue(QUEUES.pollSources);
  const scanQueue = await getQueue(QUEUES.morningScan);
  const reminderQueue = await getQueue(QUEUES.deadlineReminders);
  const stalenessQueue = await getQueue(QUEUES.refreshStaleness);
  const stripeQueue = await getQueue(QUEUES.stripeEvents);

  const rows = await getDb().select().from(sources);
  for (const source of rows) {
    await pollQueue?.add(
      `poll:${source.key}`,
      { sourceId: source.id },
      {
        repeat: { every: Math.max(source.pollIntervalMinutes, 15) * 60_000 },
        jobId: `poll:${source.key}`,
      },
    );
  }
  console.info(`[worker] registered ${rows.length} source poll schedules`);

  await scanQueue?.add(
    "sweep",
    {},
    { repeat: { pattern: "5 * * * *" }, jobId: "morning-scan:sweep" },
  );
  await reminderQueue?.add(
    "sweep",
    {},
    { repeat: { pattern: "20 2 * * *" }, jobId: "deadline-reminders:sweep" },
  );
  await stalenessQueue?.add(
    "sweep",
    {},
    { repeat: { pattern: "40 3 * * 1" }, jobId: "refresh-staleness:sweep" },
  );
  // A safety net for events the route could not enqueue (Redis blip): the
  // ledger is the source of truth, so a sweep picks up anything unprocessed.
  await stripeQueue?.add(
    "sweep",
    { webhookEventId: "" },
    { repeat: { every: 5 * 60_000 }, jobId: "process-stripe-event:sweep" },
  );
}

async function shutdown(signal: string): Promise<void> {
  console.info(`[worker] ${signal} received — draining active jobs`);
  for (const handler of shutdownHandlers) {
    await handler().catch((error) => console.error("[worker] shutdown error:", error));
  }
  await closeQueues().catch(() => undefined);
  await closeDb().catch(() => undefined);
  console.info("[worker] stopped");
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
