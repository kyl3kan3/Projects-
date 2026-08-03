/**
 * src/lib/queue.ts
 *
 * BullMQ queues, lazily constructed, per ARCHITECTURE.md's job table.
 *
 * The queue is optional. On Vercel there is no always-on process, so with no
 * REDIS_URL every enqueue becomes a no-op and the work runs either inline (a
 * recompute, which the coordinator is waiting for anyway) or from
 * `/api/cron/tick`. Callers never branch on it — they call `enqueue` and it
 * returns whether the job was queued.
 */

import type { Queue } from "bullmq";
import { hasQueue } from "@/lib/runtime";

export const QUEUE_NAMES = {
  sendReminders: "send-reminders",
  recomputeDates: "recompute-dates",
  buildPacket: "build-packet",
  processStripeEvent: "process-stripe-event",
} as const;

export type JobName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export interface JobPayloads {
  "send-reminders": { accountId?: string; today?: string };
  "recompute-dates": { dealId: string };
  "build-packet": { dealId: string; requestedBy: string };
  "process-stripe-event": { webhookEventId: string };
}

const queues = new Map<string, Queue>();

async function connection() {
  const { default: IORedis } = await import("ioredis");
  return new IORedis(process.env.REDIS_URL as string, {
    maxRetriesPerRequest: null,
    // The worker survives a Redis restart rather than exiting; BullMQ reconnects
    // and the jobs it had claimed become stalled and are retried.
    enableReadyCheck: false,
  });
}

export async function getQueue(name: JobName): Promise<Queue | null> {
  if (!hasQueue()) return null;
  const existing = queues.get(name);
  if (existing) return existing;
  const { Queue: BullQueue } = await import("bullmq");
  const queue = new BullQueue(name, {
    connection: await connection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: 200,
      removeOnFail: 500,
    },
  });
  queues.set(name, queue);
  return queue;
}

export async function enqueue<N extends JobName>(
  name: N,
  payload: JobPayloads[N],
  options: { jobId?: string } = {},
): Promise<boolean> {
  const queue = await getQueue(name);
  if (!queue) return false;
  await queue.add(name, payload, { jobId: options.jobId });
  return true;
}

export async function closeQueues(): Promise<void> {
  for (const queue of queues.values()) {
    await queue.close();
  }
  queues.clear();
}

export { connection as queueConnection };
