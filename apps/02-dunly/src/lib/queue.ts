import { Queue, type JobsOptions, type QueueOptions } from "bullmq";
import { serverEnv } from "./env";

export type DunlyJobName = "process-webhook" | "schedule-retry" | "send-message" | "pre-dunning";

export interface DunlyJobData {
  organizationId?: string;
  stripeAccountId?: string;
  paymentFailureId?: string;
  stripeEventId?: string;
  messageId?: string;
  idempotencyKey: string;
  payload?: Record<string, unknown>;
}

let queue: Queue | null = null;

function getQueueOptions(): QueueOptions | null {
  if (!serverEnv.redisUrl) return null;

  const url = new URL(serverEnv.redisUrl);
  return {
    connection: {
      host: url.hostname,
      port: Number(url.port || 6379),
      username: url.username ? decodeURIComponent(url.username) : undefined,
      password: url.password ? decodeURIComponent(url.password) : undefined,
      db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
      tls: url.protocol === "rediss:" ? {} : undefined,
      maxRetriesPerRequest: null,
    },
  };
}

export function getDunlyQueue() {
  const options = getQueueOptions();
  if (!options) return null;

  if (!queue) {
    queue = new Queue("dunly-recovery", options);
  }

  return queue;
}

export async function enqueueDunlyJob(name: DunlyJobName, data: DunlyJobData, options: JobsOptions = {}) {
  const recoveryQueue = getDunlyQueue();
  if (!recoveryQueue) {
    return {
      queued: false,
      jobId: `dry_${name}_${data.idempotencyKey}`,
    };
  }

  const job = await recoveryQueue.add(name, data, {
    jobId: data.idempotencyKey,
    removeOnComplete: 1000,
    removeOnFail: 5000,
    ...options,
  });

  return {
    queued: true,
    jobId: String(job.id),
  };
}
