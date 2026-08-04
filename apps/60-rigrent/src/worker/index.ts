/**
 * src/worker/index.ts
 *
 * The standalone worker (`npm run worker`), for the deployment shape that has a
 * host to run it on. It registers every job in ARCHITECTURE.md's table:
 *
 *   reauth-holds          repeatable, nightly
 *   send-reminders        repeatable, nightly
 *   release-holds         on a clean check-in
 *   render-docs           on a run being planned
 *   process-stripe-event  on a webhook ack
 *
 * It does no domain work of its own — every handler calls the same function
 * `/api/cron/tick` calls, so the two deployment shapes cannot drift apart.
 *
 * Redis reconnects are ioredis's job and it does them by itself; what this file
 * owns is not exiting when one happens. The `error` handler logs and returns,
 * because a worker that dies on a transient Redis blip is a worker that stops
 * releasing deposit holds at 3am.
 */

import "@/lib/load-env";
import { Worker, type Job } from "bullmq";
import { closeDb } from "@/db";
import { handleStripeEvent } from "@/lib/billing";
import { isoDateOf } from "@/lib/dates";
import { releaseHold } from "@/lib/deposits";
import {
  closeQueue,
  connection,
  connectionOptions,
  JOBS_QUEUE,
  QUEUE_PREFIX,
  queue,
  type JobData,
  type JobName,
} from "@/lib/queue";
import { reauthHolds, sendReminders } from "@/lib/tick";

const NIGHTLY = { pattern: "0 6 * * *" }; // 06:00 — before the yard opens.

async function handle(job: Job<JobData>): Promise<unknown> {
  const name = (job.data?.name ?? job.name) as JobName;
  const payload = (job.data?.payload ?? {}) as Record<string, unknown>;
  const today = typeof payload.today === "string" ? payload.today : isoDateOf(new Date());

  switch (name) {
    case "reauth-holds":
      return reauthHolds(today);
    case "send-reminders":
      return sendReminders(today);
    case "release-holds":
      return releaseHold(
        String(payload.accountId),
        String(payload.orderId),
        String(payload.actor ?? "system:worker"),
      );
    case "render-docs": {
      const { renderRunSheet } = await import("@/lib/documents");
      return renderRunSheet(String(payload.accountId), String(payload.runId));
    }
    case "process-stripe-event":
      return handleStripeEvent(String(payload.externalId));
    default:
      throw new Error(`Unknown job: ${String(name)}`);
  }
}

async function main(): Promise<void> {
  if (!process.env.REDIS_URL) {
    console.error(
      "[worker] REDIS_URL is not set. This deployment shape needs Redis; on Vercel use /api/cron/tick instead.",
    );
    process.exit(1);
  }

  const redis = connection();
  redis.on("error", (err) => {
    // Log and carry on: ioredis reconnects, and exiting here would strand every
    // hold release until somebody noticed the process was gone.
    console.error("[worker] redis error:", err.message);
  });
  redis.on("reconnecting", () => console.warn("[worker] redis reconnecting…"));
  redis.on("ready", () => console.info("[worker] redis ready"));

  const jobs = queue();
  await jobs.upsertJobScheduler(
    "nightly-reauth-holds",
    NIGHTLY,
    { name: "reauth-holds", data: { name: "reauth-holds", payload: {} } },
  );
  await jobs.upsertJobScheduler(
    "nightly-send-reminders",
    NIGHTLY,
    { name: "send-reminders", data: { name: "send-reminders", payload: {} } },
  );

  const worker = new Worker<JobData>(
    JOBS_QUEUE,
    async (job) => {
      const started = Date.now();
      const result = await handle(job);
      console.info(`[worker] ${job.data?.name ?? job.name} ok in ${Date.now() - started}ms`, result);
      return result;
    },
    { connection: connectionOptions(), prefix: QUEUE_PREFIX, concurrency: 4 },
  );

  worker.on("failed", (job, err) => {
    console.error(`[worker] ${job?.data?.name ?? job?.name} failed:`, err.message);
  });
  worker.on("ready", () =>
    console.info("[worker] ready — reauth-holds, release-holds, render-docs, send-reminders, process-stripe-event"),
  );

  const shutdown = async (signal: string) => {
    console.info(`[worker] ${signal} — draining`);
    await worker.close();
    await closeQueue();
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
