/**
 * BullMQ queues — the product's heartbeat. Delayed jobs ARE the retry
 * scheduler and the message sequencer. Shared by web (enqueue) and
 * worker (process).
 */

import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "@/lib/env";

const globalForQueue = globalThis as unknown as {
  redis?: IORedis;
  queues?: Record<string, Queue>;
};

export function redis(): IORedis {
  if (!globalForQueue.redis) {
    globalForQueue.redis = new IORedis(env.redisUrl, { maxRetriesPerRequest: null });
  }
  return globalForQueue.redis;
}

export type QueueName = "events" | "retries" | "messages" | "cron";

export function queue(name: QueueName): Queue {
  globalForQueue.queues ??= {};
  if (!globalForQueue.queues[name]) {
    globalForQueue.queues[name] = new Queue(name, {
      connection: redis(),
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
  }
  return globalForQueue.queues[name];
}

/* Job payload contracts */
export interface ProcessWebhookJob { webhookEventId: string }
export interface ExecuteRetryJob { recoveryAttemptId: string }
export interface SendMessageJob {
  organizationId: string;
  customerId: string;
  paymentFailureId: string | null;
  campaignId: string;
  stepIndex: number;
}
export interface OffScheduleRetryJob { paymentFailureId: string }
