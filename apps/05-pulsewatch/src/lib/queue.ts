/**
 * BullMQ queues shared by the scheduler (producer), the regional probes, and
 * the alert dispatcher.
 *
 * Probes only ever touch Redis: they pop from `checks:{region}` and push onto
 * `results`, so no database credentials ever reach an edge machine
 * (ARCHITECTURE.md).
 */

import { Queue, type ConnectionOptions } from "bullmq";
import IORedis from "ioredis";
import { env } from "@/lib/env";

/**
 * BullMQ reserves ":" for its own Redis key structure and rejects it in queue
 * names, so namespacing goes through `prefix` instead.
 */
export const QUEUE_PREFIX = "pulsewatch";
export const RESULTS_QUEUE = "results";
export const ALERTS_QUEUE = "alerts";
export const checksQueueName = (region: string) => `checks-${region}`;

/** What the scheduler hands a probe. Deliberately self-contained — no DB reads. */
export interface CheckJob {
  monitorId: string;
  /** Distinguishes this dispatch cycle, so retries can't double-count. */
  tick: number;
  kind: "http" | "ssl" | "domain";
  target: string;
  timeoutMs: number;
  expectedStatusCodes: number[];
  keyword: string | null;
  keywordInvert: boolean;
  followRedirects: boolean;
  requestHeaders: Record<string, string> | null;
}

/** What a probe hands back. */
export interface CheckResultJob {
  monitorId: string;
  tick: number;
  region: string;
  ok: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  errorKind: string | null;
  errorDetail: string | null;
  /** Populated by ssl/domain checks. */
  expiry?: {
    notAfter: string | null;
    issuer: string | null;
    subject: string | null;
    registrar: string | null;
  };
}

export interface AlertJob {
  incidentId: string;
  /** "down" | "recovery" | "ssl:14" — also the notification dedupe key. */
  edge: string;
}

let _connection: IORedis | null = null;
const _queues = new Map<string, Queue>();

export function connection(): IORedis {
  if (!_connection) {
    _connection = new IORedis(env.redisUrl, { maxRetriesPerRequest: null });
  }
  return _connection;
}

export function connectionOptions(): ConnectionOptions {
  return connection() as unknown as ConnectionOptions;
}

function queue<T>(name: string, attempts: number): Queue<T> {
  let q = _queues.get(name) as Queue<T> | undefined;
  if (!q) {
    q = new Queue<T>(name, {
      connection: connectionOptions(),
      prefix: QUEUE_PREFIX,
      defaultJobOptions: {
        attempts,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: 500,
        removeOnFail: 1_000,
      },
    });
    _queues.set(name, q as Queue);
  }
  return q;
}

export function checksQueue(region: string): Queue<CheckJob> {
  // A check is never retried: the next tick is the retry, and a stale result is
  // worse than no result when you are deciding whether to page someone.
  return queue<CheckJob>(checksQueueName(region), 1);
}

export function resultsQueue(): Queue<CheckResultJob> {
  return queue<CheckResultJob>(RESULTS_QUEUE, 3);
}

export function alertsQueue(): Queue<AlertJob> {
  return queue<AlertJob>(ALERTS_QUEUE, 5);
}

export async function closeQueues(): Promise<void> {
  await Promise.all([..._queues.values()].map((q) => q.close()));
  _queues.clear();
  await _connection?.quit();
  _connection = null;
}
