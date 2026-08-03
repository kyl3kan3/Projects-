/**
 * src/lib/queue.ts
 *
 * BullMQ on Redis when `REDIS_URL` is set; direct execution when it is not.
 *
 * Both modes are real deployments, not a fallback and a hack:
 *
 *  - **With Redis** (Upstash + a worker on Fly or Railway) jobs get retries,
 *    backoff and a dead-letter queue, and a webhook can ack in milliseconds.
 *  - **Without** — the shape a Vercel-only deployment takes — the job runs in
 *    the request. Slower, and the caller waits, but the alternative is a job
 *    that vanishes when the function freezes. Periodic work is not run this way
 *    at all: it comes from `/api/cron/tick`.
 *
 * `enqueue` never throws into a caller whose own work already succeeded. A
 * failed enqueue is logged and reported, because "the load was created but the
 * parse never ran" must be visible, not silent.
 */

import type { JobName, JobPayloads } from "@/lib/jobs";
import { env, features } from "@/lib/env";
import { runJob } from "@/lib/jobs";

export const QUEUE_NAME = "dispatchdeck";
export const DEAD_LETTER_QUEUE = "dispatchdeck-dead";

type QueueModule = typeof import("bullmq");
type Queue = InstanceType<QueueModule["Queue"]>;
type Redis = InstanceType<typeof import("ioredis").Redis>;

const cache = globalThis as unknown as {
  __dispatchdeckQueue?: Queue;
  __dispatchdeckRedis?: Redis;
};

/**
 * One shared ioredis connection. `maxRetriesPerRequest: null` is required by
 * BullMQ's blocking commands, and `enableReadyCheck: false` keeps a reconnect
 * from throwing at every in-flight command while the socket comes back.
 */
export async function redisConnection(): Promise<Redis> {
  if (!cache.__dispatchdeckRedis) {
    const { Redis } = await import("ioredis");
    const connection = new Redis(env.redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: (attempt) => Math.min(attempt * 500, 10_000),
    });
    connection.on("error", (error) => console.error("[redis]", error.message));
    connection.on("reconnecting", () => console.warn("[redis] reconnecting"));
    cache.__dispatchdeckRedis = connection;
  }
  return cache.__dispatchdeckRedis;
}

export async function queue(): Promise<Queue> {
  if (!cache.__dispatchdeckQueue) {
    const { Queue } = await import("bullmq");
    cache.__dispatchdeckQueue = new Queue(QUEUE_NAME, {
      connection: await redisConnection(),
      defaultJobOptions: {
        attempts: 4,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 500 },
      },
    });
  }
  return cache.__dispatchdeckQueue;
}

export interface EnqueueResult {
  mode: "queued" | "inline";
  ok: boolean;
  /** Present when the job ran inline and threw, or the enqueue failed. */
  error: string | null;
}

export async function enqueue<K extends JobName>(
  name: K,
  payload: JobPayloads[K],
  opts: { jobId?: string; delayMs?: number } = {},
): Promise<EnqueueResult> {
  if (features.redis) {
    try {
      const q = await queue();
      await q.add(name, payload, { jobId: opts.jobId, delay: opts.delayMs });
      return { mode: "queued", ok: true, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[queue] could not enqueue ${name}:`, message);
      return { mode: "queued", ok: false, error: message };
    }
  }

  try {
    await runJob(name, payload);
    return { mode: "inline", ok: true, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[queue] inline ${name} failed:`, message);
    return { mode: "inline", ok: false, error: message };
  }
}

export async function closeQueue(): Promise<void> {
  await cache.__dispatchdeckQueue?.close();
  cache.__dispatchdeckQueue = undefined;
  cache.__dispatchdeckRedis?.disconnect();
  cache.__dispatchdeckRedis = undefined;
}
