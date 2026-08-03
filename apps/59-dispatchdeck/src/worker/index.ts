/**
 * src/worker/index.ts
 *
 * The standalone worker (`npm run worker`). Consumes every job in
 * ARCHITECTURE.md's queue table off one BullMQ queue, plus two repeatables:
 * the five-minute detention sweep and the nightly broker-stats rollup.
 *
 * Deployment note: this is for a host that runs processes — Fly, Railway, a VPS.
 * On Vercel there is nothing to run it, so periodic work also has a
 * `CRON_SECRET`-gated route (`/api/cron/tick`) calling the same handlers, and
 * request-triggered work runs inline (see `queue.ts`). Running both is harmless:
 * every handler is idempotent.
 *
 * Survives a Redis restart: ioredis reconnects with backoff and BullMQ resumes
 * consuming. SIGTERM stops new work and waits for what is in flight.
 */

import "./load-env";
import { closeDb } from "@/db";
import { env, features } from "@/lib/env";
import { JOB_NAMES, runJob, type JobName, type JobPayloads } from "@/lib/jobs";
import { DEAD_LETTER_QUEUE, QUEUE_NAME, closeQueue, queue, redisConnection } from "@/lib/queue";

const DETENTION_EVERY_MS = 5 * 60 * 1000;

async function main(): Promise<void> {
  if (!features.redis) {
    console.error(
      "[worker] REDIS_URL is not set. This process consumes a BullMQ queue and has nothing to\n" +
        "         connect to. Either set REDIS_URL, or run without a worker: with no Redis the app\n" +
        "         executes request-triggered jobs inline and periodic work comes from\n" +
        "         GET /api/cron/tick with CRON_SECRET.",
    );
    process.exit(1);
  }

  const { Worker, Queue } = await import("bullmq");
  const connection = await redisConnection();
  const dead = new Queue(DEAD_LETTER_QUEUE, { connection });

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const name = job.name as JobName;
      if (!JOB_NAMES.includes(name)) throw new Error(`Unknown job ${job.name}`);
      const started = Date.now();
      const result = await runJob(name, job.data as JobPayloads[JobName]);
      console.log(`[worker] ${name} ok in ${Date.now() - started}ms`, summarise(result));
      return result;
    },
    { connection, concurrency: 4 },
  );

  worker.on("failed", async (job, error) => {
    console.error(`[worker] ${job?.name} failed (attempt ${job?.attemptsMade}):`, error.message);
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      // Out of retries: park it where a human can see it rather than losing it.
      await dead.add(
        job.name,
        { data: job.data, error: error.message, failedAt: new Date().toISOString() },
        { removeOnComplete: false },
      );
      if (env.sentryDsn) {
        console.error(`[worker] would report to Sentry: ${job.name} ${error.message}`);
      }
    }
  });

  worker.on("ready", () => console.log("[worker] connected to Redis and consuming"));
  worker.on("error", (error) => console.error("[worker]", error.message));

  // Repeatables. Registered by a stable key so restarting the worker does not
  // create a second schedule.
  const q = await queue();
  await q.add(
    "detention-tick",
    {},
    { repeat: { every: DETENTION_EVERY_MS }, jobId: "repeat:detention-tick" },
  );
  await q.add(
    "rollup-broker-stats",
    {},
    { repeat: { pattern: "17 4 * * *" }, jobId: "repeat:rollup-broker-stats" },
  );

  console.log(
    `[worker] registered ${JOB_NAMES.length} job types: ${JOB_NAMES.join(", ")}\n` +
      `[worker] detention sweep every ${DETENTION_EVERY_MS / 60000}m, broker rollup nightly at 04:17 UTC`,
  );

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[worker] ${signal} — draining active jobs`);
    try {
      await worker.close();
      await dead.close();
      await closeQueue();
      await closeDb();
    } catch (error) {
      console.error("[worker] shutdown problem:", error);
    }
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

function summarise(result: unknown): string {
  if (result === null || result === undefined) return "";
  if (typeof result === "object") return JSON.stringify(result).slice(0, 200);
  return String(result);
}

main().catch((error) => {
  console.error("[worker] fatal:", error);
  process.exit(1);
});
