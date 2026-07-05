/**
 * BullMQ queues — the meeting pipeline: transcribe -> extract -> deliver.
 * Shared by web (enqueue) and worker (process).
 */

import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "@/lib/env";

const g = globalThis as unknown as { redis?: IORedis; queues?: Record<string, Queue> };

export function redis(): IORedis {
  if (!g.redis) g.redis = new IORedis(env.redisUrl, { maxRetriesPerRequest: null });
  return g.redis;
}

export type QueueName = "pipeline" | "crm" | "slack";

export function queue(name: QueueName): Queue {
  g.queues ??= {};
  if (!g.queues[name]) {
    g.queues[name] = new Queue(name, {
      connection: redis(),
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
  }
  return g.queues[name];
}

export interface TranscribeJob { meetingId: string }
export interface ExtractJob { meetingId: string }
export interface DeliverSlackJob { meetingId: string }
export interface CrmSyncJob { meetingId: string }
export interface ApplyCrmLogJob { syncLogId: string; appliedBy: string }
