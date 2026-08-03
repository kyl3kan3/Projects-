/**
 * src/lib/queue.ts
 *
 * BullMQ queues, per ARCHITECTURE.md's job table. Producers are the app; the
 * consumer is `npm run worker`.
 *
 * Enqueueing is **best-effort by design**. Every job here has a synchronous
 * fallback (`parse` runs inline on upload, the nightly work runs from
 * `/api/cron/tick`), so Redis being down slows the product rather than breaking it.
 * The alternative — refusing an upload because a queue is unreachable — loses the
 * document, and losing the document is the one unforgivable failure.
 */

import type { Queue } from "bullmq";
import { hasQueue } from "@/lib/runtime";

export const QUEUE_PREFIX = "certshield";

/** BullMQ reserves ":" in queue names, so namespacing goes through `prefix`. */
export const QUEUES = {
  parseCertificate: "parse-certificate",
  evaluateCompliance: "evaluate-compliance",
  runChases: "run-chases",
  exportBinder: "export-binder",
  processStripeEvent: "process-stripe-event",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export interface ParseCertificateJob {
  certificateId: string;
}
export interface EvaluateComplianceJob {
  orgId: string;
  vendorId?: string;
}
export interface RunChasesJob {
  orgId?: string;
}
export interface ExportBinderJob {
  orgId: string;
  propertyId: string;
  requestedBy: string | null;
}
export interface ProcessStripeEventJob {
  externalId: string;
}

export interface JobPayloads {
  "parse-certificate": ParseCertificateJob;
  "evaluate-compliance": EvaluateComplianceJob;
  "run-chases": RunChasesJob;
  "export-binder": ExportBinderJob;
  "process-stripe-event": ProcessStripeEventJob;
}

const ATTEMPTS: Record<QueueName, number> = {
  "parse-certificate": 3,
  "evaluate-compliance": 3,
  // A chase is never retried by BullMQ: the ledger's unique key means a retry
  // cannot re-send, so a retry would only re-run the claim and log noise. The next
  // nightly pass is the retry.
  "run-chases": 1,
  "export-binder": 2,
  "process-stripe-event": 5,
};

let _connection: import("ioredis").Redis | null = null;
const _queues = new Map<string, Queue>();

async function connection(): Promise<import("ioredis").Redis> {
  if (!_connection) {
    const { default: IORedis } = await import("ioredis");
    const { env } = await import("@/lib/env");
    _connection = new IORedis(env.redisUrl, {
      maxRetriesPerRequest: null,
      // The worker must survive a Redis restart rather than exiting: BullMQ
      // reconnects on its own once ioredis does.
      retryStrategy: (attempt) => Math.min(attempt * 500, 10_000),
    });
    _connection.on("error", (err) => console.error("[redis]", err.message));
  }
  return _connection;
}

export async function queueFor<N extends QueueName>(name: N): Promise<Queue<JobPayloads[N]>> {
  const existing = _queues.get(name) as Queue<JobPayloads[N]> | undefined;
  if (existing) return existing;
  const { Queue: BullQueue } = await import("bullmq");
  const q = new BullQueue<JobPayloads[N]>(name, {
    connection: (await connection()) as never,
    prefix: QUEUE_PREFIX,
    defaultJobOptions: {
      attempts: ATTEMPTS[name],
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: 500,
      removeOnFail: 1_000,
    },
  });
  _queues.set(name, q as unknown as Queue);
  return q;
}

/**
 * Enqueue a job if a queue exists. Returns false when there is none (or Redis is
 * unreachable), which tells the caller to do the work inline.
 */
export async function enqueue<N extends QueueName>(
  name: N,
  payload: JobPayloads[N],
  opts?: { jobId?: string },
): Promise<boolean> {
  if (!hasQueue()) return false;
  try {
    // BullMQ derives the job-name and data types from the queue's own generic
    // parameters, which a caller-side mapped type cannot satisfy. The mapping is
    // enforced by `JobPayloads` at this function's boundary instead.
    const q = (await queueFor(name)) as unknown as Queue;
    await q.add(name, payload, opts?.jobId ? { jobId: opts.jobId } : undefined);
    return true;
  } catch (err) {
    console.error(`[queue] could not enqueue ${name}:`, err instanceof Error ? err.message : err);
    return false;
  }
}

export async function closeQueues(): Promise<void> {
  await Promise.all([..._queues.values()].map((q) => q.close()));
  _queues.clear();
  await _connection?.quit().catch(() => undefined);
  _connection = null;
}

export { connection as redisConnection };
