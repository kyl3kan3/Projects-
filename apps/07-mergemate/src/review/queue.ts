/**
 * The review queue.
 *
 * Webhook load is spiky and analysis is slow, so the handler's job is to ack in
 * milliseconds and enqueue. Three properties are worth calling out:
 *
 *  - **Idempotent job ids.** The id is (installation, repo, pr, head sha,
 *    trigger). GitHub redelivers webhooks; BullMQ drops a duplicate id, and the
 *    unique index on `review_runs` catches anything that gets past it.
 *  - **Per-installation concurrency.** A monorepo push can fan out dozens of
 *    events at once, and one noisy installation must not starve every other
 *    tenant. Slots are counted in Redis; a job that cannot get one is put back as
 *    delayed rather than failed, so it keeps its attempts.
 *  - **No Redis, no queue.** With REDIS_URL unset the webhook handler runs the
 *    review inline. That is the right behaviour for a single-tenant self-host and
 *    it is what makes local verification possible without a broker.
 */

import { Queue, Worker, type ConnectionOptions, type Job } from "bullmq";
import IORedis from "ioredis";
import { env } from "../lib/env";
import type { ReviewJobData } from "./run";

export const QUEUE_PREFIX = "mergemate";
export const REVIEW_QUEUE = "review";

/** Priority lane for Business installations (lower number = sooner). */
export const PRIORITY_BUSINESS = 1;
export const PRIORITY_STANDARD = 5;

let _connection: IORedis | null = null;
let _queue: Queue<ReviewJobData> | null = null;

export function queueEnabled(): boolean {
  return env.redisUrl.trim() !== "";
}

export function connection(): IORedis {
  if (!_connection) {
    _connection = new IORedis(env.redisUrl, { maxRetriesPerRequest: null });
  }
  return _connection;
}

function connectionOptions(): ConnectionOptions {
  return connection() as unknown as ConnectionOptions;
}

export function reviewQueue(): Queue<ReviewJobData> {
  if (!_queue) {
    _queue = new Queue<ReviewJobData>(REVIEW_QUEUE, {
      connection: connectionOptions(),
      prefix: QUEUE_PREFIX,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 10_000 },
        removeOnComplete: 500,
        removeOnFail: 1_000,
      },
    });
  }
  return _queue;
}

export function jobIdFor(job: ReviewJobData): string {
  return [
    job.githubInstallationId,
    job.githubRepoId,
    job.prNumber,
    job.headSha,
    job.trigger,
  ].join("-");
}

export async function enqueueReview(
  job: ReviewJobData,
  options: { priority?: number } = {},
): Promise<string | null> {
  const queue = reviewQueue();
  const added = await queue.add(REVIEW_QUEUE, job, {
    jobId: jobIdFor(job),
    priority: options.priority ?? PRIORITY_STANDARD,
  });
  return added.id ?? null;
}

export function makeWorker(
  process_: (job: Job<ReviewJobData>) => Promise<void>,
  options: { concurrency?: number } = {},
): Worker<ReviewJobData> {
  return new Worker<ReviewJobData>(REVIEW_QUEUE, process_, {
    connection: connectionOptions(),
    prefix: QUEUE_PREFIX,
    concurrency: options.concurrency ?? env.maxReviewConcurrency,
    // A stalled job is reclaimed once; a review that hangs twice is a bug, not
    // something to keep retrying against a paid API.
    maxStalledCount: 1,
    lockDuration: 300_000,
  });
}

/* ------------------------------------------------- per-installation slots --- */

const SLOT_TTL_SECONDS = 600;

function slotKey(installationId: number): string {
  return `${QUEUE_PREFIX}:slots:${installationId}`;
}

/**
 * Take an in-flight slot for an installation, or report that it is full.
 *
 * INCR then EXPIRE, so a worker that dies without releasing cannot wedge a tenant
 * for longer than the TTL. Deliberately not a Lua script: at these rates the
 * race window costs at most one extra concurrent review.
 */
export async function acquireSlot(installationId: number, max: number): Promise<boolean> {
  const redis = connection();
  const key = slotKey(installationId);
  const count = await redis.incr(key);
  await redis.expire(key, SLOT_TTL_SECONDS);
  if (count > max) {
    await redis.decr(key);
    return false;
  }
  return true;
}

export async function releaseSlot(installationId: number): Promise<void> {
  const redis = connection();
  const key = slotKey(installationId);
  const count = await redis.decr(key);
  if (count <= 0) await redis.del(key);
}

export async function queueDepth(): Promise<{ waiting: number; active: number; failed: number; delayed: number }> {
  const queue = reviewQueue();
  const [waiting, active, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);
  return { waiting, active, failed, delayed };
}

export async function closeQueue(): Promise<void> {
  await _queue?.close();
  _queue = null;
  await _connection?.quit();
  _connection = null;
}
