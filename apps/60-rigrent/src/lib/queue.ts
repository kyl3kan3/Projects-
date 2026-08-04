/**
 * src/lib/queue.ts
 *
 * BullMQ queues, for the deployment shape that has a worker host.
 *
 * Only reachable when REDIS_URL is set. On Vercel it is not, and
 * `/api/cron/tick` runs the same functions inline — see lib/runtime.ts. Nothing
 * in the app enqueues unconditionally: `enqueue()` is a no-op without Redis, so
 * one code path serves both shapes.
 */

import { Queue, type ConnectionOptions } from "bullmq";
import IORedis from "ioredis";
import { env } from "@/lib/env";
import { hasQueue } from "@/lib/runtime";

/** BullMQ reserves ":" for its own key structure, so namespacing goes through `prefix`. */
export const QUEUE_PREFIX = "rigrent";
export const JOBS_QUEUE = "jobs";

export type JobName =
  | "reauth-holds"
  | "release-holds"
  | "render-docs"
  | "send-reminders"
  | "process-stripe-event";

export interface JobPayloads {
  "reauth-holds": { today?: string };
  "release-holds": { accountId: string; orderId: string; actor: string };
  "render-docs": { kind: "runsheet"; accountId: string; runId: string };
  "send-reminders": { today?: string };
  "process-stripe-event": { externalId: string };
}

export type JobData = { name: JobName; payload: unknown };

let _connection: IORedis | null = null;
let _queue: Queue<JobData> | null = null;

export function connection(): IORedis {
  if (!_connection) {
    _connection = new IORedis(env.redisUrl, { maxRetriesPerRequest: null });
  }
  return _connection;
}

export function connectionOptions(): ConnectionOptions {
  return connection() as unknown as ConnectionOptions;
}

export function queue(): Queue<JobData> {
  if (!_queue) {
    _queue = new Queue<JobData>(JOBS_QUEUE, {
      connection: connectionOptions(),
      prefix: QUEUE_PREFIX,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: 500,
        // Failures stay: a job that could not release a hold is something a
        // person has to see, and a queue that deletes its own failures is a
        // queue with no dead-letter.
        removeOnFail: 5_000,
      },
    });
  }
  return _queue;
}

/**
 * Enqueue a job when Redis is configured; do nothing when it is not. Callers
 * treat background work as best-effort and the cron tick picks it up either way,
 * so a missing Redis degrades to "slightly later" rather than "never".
 */
export async function enqueue<N extends JobName>(
  name: N,
  payload: JobPayloads[N],
): Promise<boolean> {
  if (!hasQueue()) return false;
  await queue().add(name, { name, payload });
  return true;
}

export async function closeQueue(): Promise<void> {
  await _queue?.close();
  _queue = null;
  await _connection?.quit();
  _connection = null;
}
