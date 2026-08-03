/**
 * src/lib/queue.ts
 *
 * BullMQ queues shared by the app (producer) and the worker (consumer).
 *
 * Every queue here maps to a row in ARCHITECTURE.md's Queue & Worker Jobs
 * table. The connection is a single lazily-created ioredis client cached on
 * globalThis, with `maxRetriesPerRequest: null` — BullMQ's blocking commands
 * require it, and without it a Redis blip kills the worker instead of
 * reconnecting.
 *
 * When `REDIS_URL` is unset the whole module degrades to no-ops and `enqueue()`
 * returns false. That is not a failure mode: it is the Vercel deployment shape,
 * where `/api/cron/tick` runs the same job bodies inline. Callers treat a false
 * return as "it will be picked up by the next tick", never as an error.
 */

import type { Queue } from "bullmq";
import type { Redis } from "ioredis";
import { env } from "@/lib/env";
import { hasQueue } from "@/lib/runtime";

export const QUEUE_PREFIX = "rfpradar";

export const QUEUES = {
  pollSources: "poll-sources",
  scoreMatches: "score-matches",
  morningScan: "morning-scan",
  deadlineReminders: "deadline-reminders",
  refreshStaleness: "refresh-staleness",
  stripeEvents: "process-stripe-event",
  dead: "dead-letter",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export interface PollSourcesJob {
  sourceId?: string;
}
export interface ScoreMatchesJob {
  profileId?: string;
  opportunityIds?: string[];
}
export interface MorningScanJob {
  firmId?: string;
}
export interface StripeEventJob {
  webhookEventId: string;
}

const globalForQueue = globalThis as unknown as {
  __rfpradarRedis?: Redis;
  __rfpradarQueues?: Map<string, Queue>;
};

export async function getConnection(): Promise<Redis | null> {
  if (!hasQueue()) return null;
  if (!globalForQueue.__rfpradarRedis) {
    const { default: IORedis } = await import("ioredis");
    globalForQueue.__rfpradarRedis = new IORedis(env.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      // Keep retrying with backoff rather than dying: a worker that survives a
      // Redis reconnect is a requirement, not a nicety (BUILD.md).
      retryStrategy: (attempt) => Math.min(attempt * 500, 10_000),
    });
    globalForQueue.__rfpradarRedis.on("error", (error) => {
      console.error("[queue] redis error:", error.message);
    });
  }
  return globalForQueue.__rfpradarRedis;
}

export async function getQueue(name: QueueName): Promise<Queue | null> {
  const connection = await getConnection();
  if (!connection) return null;
  if (!globalForQueue.__rfpradarQueues) globalForQueue.__rfpradarQueues = new Map();
  const existing = globalForQueue.__rfpradarQueues.get(name);
  if (existing) return existing;

  const { Queue: BullQueue } = await import("bullmq");
  const queue = new BullQueue(name, {
    connection,
    prefix: QUEUE_PREFIX,
    defaultJobOptions: {
      attempts: 4,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: { age: 3_600, count: 500 },
      removeOnFail: { age: 86_400 * 7 },
    },
  });
  globalForQueue.__rfpradarQueues.set(name, queue);
  return queue;
}

/**
 * Enqueue a job. Returns false when there is no queue configured — the caller
 * relies on the cron tick instead, and must not treat that as an error.
 */
export async function enqueue(
  name: QueueName,
  jobName: string,
  data: Record<string, unknown>,
): Promise<boolean> {
  try {
    const queue = await getQueue(name);
    if (!queue) return false;
    await queue.add(jobName, data);
    return true;
  } catch (error) {
    console.error(`[queue] failed to enqueue ${name}/${jobName}:`, error);
    return false;
  }
}

export async function closeQueues(): Promise<void> {
  for (const queue of globalForQueue.__rfpradarQueues?.values() ?? []) {
    await queue.close();
  }
  globalForQueue.__rfpradarQueues?.clear();
  await globalForQueue.__rfpradarRedis?.quit().catch(() => undefined);
  globalForQueue.__rfpradarRedis = undefined;
}
