/**
 * BullMQ queues, per ARCHITECTURE.md's job table. The producer is the app; the
 * consumer is `npm run worker`.
 *
 * **Enqueueing is best-effort by design.** Every job here has a synchronous or
 * next-tick fallback: documents render inline in the request that needs them, and
 * everything date-driven is recomputed by `runTick` from database state. Redis
 * being unreachable therefore slows UnitKeeper down; it does not lose a move-in or
 * skip a statutory step. On Vercel there is no worker at all and this module never
 * enqueues anything.
 */

import type { Queue } from "bullmq";
import { hasQueue } from "@/lib/runtime";

export const QUEUE_PREFIX = "unitkeeper";

/** BullMQ reserves ":" in queue names, so namespacing goes through `prefix`. */
export const QUEUES = {
  runAutopay: "run-autopay",
  lateLadder: "late-ladder",
  advanceLiens: "advance-liens",
  renderDocs: "render-docs",
  processStripeEvent: "process-stripe-event",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export interface RunAutopayJob {
  tenancyId?: string;
}
export interface LateLadderJob {
  ownerId?: string;
}
export interface AdvanceLiensJob {
  lienCaseId?: string;
}
export interface RenderDocsJob {
  kind: "lease" | "statement" | "packet";
  tenancyId?: string;
  lienCaseId?: string;
}
export interface ProcessStripeEventJob {
  externalId: string;
}

export interface JobPayloads {
  "run-autopay": RunAutopayJob;
  "late-ladder": LateLadderJob;
  "advance-liens": AdvanceLiensJob;
  "render-docs": RenderDocsJob;
  "process-stripe-event": ProcessStripeEventJob;
}

const ATTEMPTS: Record<QueueName, number> = {
  "run-autopay": 3,
  // The ladder is keyed by a unique index, so a retry is safe but rarely useful.
  "late-ladder": 2,
  "advance-liens": 2,
  "render-docs": 3,
  "process-stripe-event": 5,
};

let connection: unknown = null;
const queues = new Map<QueueName, Queue>();

export async function redisConnection(): Promise<unknown> {
  if (connection) return connection;
  const { default: IORedis } = await import("ioredis");
  connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
    // Reconnect with backoff rather than dying: a Redis restart should be a gap in
    // throughput, not a dead worker.
    retryStrategy: (times: number) => Math.min(times * 200, 5_000),
  });
  return connection;
}

async function queueFor(name: QueueName): Promise<Queue | null> {
  if (!hasQueue()) return null;
  const existing = queues.get(name);
  if (existing) return existing;
  const { Queue: BullQueue } = await import("bullmq");
  const queue = new BullQueue(name, {
    connection: (await redisConnection()) as never,
    prefix: QUEUE_PREFIX,
    defaultJobOptions: {
      attempts: ATTEMPTS[name],
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: 200,
      removeOnFail: 500,
    },
  });
  queues.set(name, queue);
  return queue;
}

/** Fire and forget. Returns false when the job could not be queued. */
export async function enqueue<N extends QueueName>(
  name: N,
  payload: JobPayloads[N],
): Promise<boolean> {
  try {
    const queue = await queueFor(name);
    if (!queue) return false;
    await queue.add(name, payload);
    return true;
  } catch (err) {
    console.error("[queue] enqueue failed — the inline path will cover it", { name, err });
    return false;
  }
}

export async function closeQueues(): Promise<void> {
  for (const queue of queues.values()) await queue.close().catch(() => {});
  queues.clear();
  const conn = connection as { quit?: () => Promise<unknown> } | null;
  await conn?.quit?.().catch(() => {});
  connection = null;
}
