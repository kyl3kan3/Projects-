/**
 * BullMQ queue definitions shared by the web app (producer) and worker (consumer).
 */

import { Queue, type ConnectionOptions } from "bullmq";
import IORedis from "ioredis";
import { env } from "@/lib/env";

export const PIPELINE_QUEUE = "clipforge:pipeline";

export type PipelineJob =
  | { type: "process_project"; projectId: string; priority: boolean }
  | { type: "import_and_process"; projectId: string; priority: boolean }
  | { type: "render_clip"; clipId: string };

let _connection: IORedis | null = null;
let _queue: Queue<PipelineJob> | null = null;

export function connection(): IORedis {
  if (!_connection) {
    _connection = new IORedis(env.redisUrl, { maxRetriesPerRequest: null });
  }
  return _connection;
}

export function connectionOptions(): ConnectionOptions {
  return connection() as unknown as ConnectionOptions;
}

export function pipelineQueue(): Queue<PipelineJob> {
  if (!_queue) {
    _queue = new Queue<PipelineJob>(PIPELINE_QUEUE, {
      connection: connectionOptions(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 15_000 },
        removeOnComplete: 200,
        removeOnFail: 500,
      },
    });
  }
  return _queue;
}

export async function enqueuePipeline(job: PipelineJob): Promise<void> {
  // Pro/Team get the fast lane via BullMQ priority (lower = sooner).
  const priority = "priority" in job && job.priority ? 1 : 10;
  await pipelineQueue().add(job.type, job, { priority });
}
