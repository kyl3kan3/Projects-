/**
 * Worker entrypoint. Run as a separate long-lived process (see package.json
 * `worker` script). Consumes the pipeline queue; concurrency 2 keeps ffmpeg
 * from starving CPU on a small box — scale by running more worker instances.
 */

import "dotenv/config";
import { Worker } from "bullmq";
import { PIPELINE_QUEUE, connectionOptions, type PipelineJob } from "@/lib/queue";
import { handleJob } from "./pipeline";

const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 2);

const worker = new Worker<PipelineJob>(
  PIPELINE_QUEUE,
  async (job) => {
    console.log(`[worker] ${job.name} ${job.id} starting`);
    await handleJob(job.data);
    console.log(`[worker] ${job.name} ${job.id} done`);
  },
  { connection: connectionOptions(), concurrency },
);

worker.on("failed", (job, err) => {
  console.error(`[worker] job ${job?.id} failed:`, err.message);
});

worker.on("completed", (job) => {
  console.log(`[worker] job ${job.id} completed`);
});

console.log(`ClipForge worker online (concurrency=${concurrency}). Waiting for jobs…`);

async function shutdown() {
  console.log("[worker] shutting down…");
  await worker.close();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
