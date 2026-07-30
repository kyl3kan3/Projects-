/**
 * Probe worker: executes checks from the queue, one instance per region.
 *
 * Deploys as the same image to every Fly region; `PROBE_REGION` decides which
 * queue it drains. It speaks only Redis — never Postgres — so no database
 * credential ever reaches an edge machine (ARCHITECTURE.md).
 *
 * TCP and ICMP ping checks are Phase 3, per README's post-MVP list.
 */

// Must be first: the workers are plain Node processes, not Next.
import "@/lib/load-env";

import { Worker, type Job } from "bullmq";
import {
  checksQueueName,
  connectionOptions,
  QUEUE_PREFIX,
  resultsQueue,
  type CheckJob,
  type CheckResultJob,
} from "@/lib/queue";
import { env } from "@/lib/env";
import { runHttpCheck } from "@/probe/checks/http";
import { runTlsCheck } from "@/probe/checks/tls";
import { registrableDomain, runWhoisCheck } from "@/probe/checks/whois";

const region = env.probeRegion;
/** Concurrency per machine. Checks are IO-bound, so this can be generous. */
const CONCURRENCY = Number(process.env.PROBE_CONCURRENCY ?? 25);

async function execute(job: CheckJob): Promise<CheckResultJob> {
  const base = { monitorId: job.monitorId, tick: job.tick, region };

  if (job.kind === "http") {
    const outcome = await runHttpCheck(job);
    return { ...base, ...outcome };
  }

  if (job.kind === "ssl") {
    const outcome = await runTlsCheck(job.target, job.timeoutMs);
    return {
      ...base,
      ok: outcome.ok,
      statusCode: null,
      latencyMs: outcome.latencyMs,
      errorKind: outcome.errorKind,
      errorDetail: outcome.errorDetail,
      expiry: {
        notAfter: outcome.notAfter?.toISOString() ?? null,
        issuer: outcome.issuer,
        subject: outcome.subject,
        registrar: null,
      },
    };
  }

  const outcome = await runWhoisCheck(registrableDomain(job.target), job.timeoutMs);
  return {
    ...base,
    ok: outcome.ok,
    statusCode: null,
    latencyMs: null,
    errorKind: outcome.errorKind,
    errorDetail: outcome.errorDetail,
    expiry: {
      notAfter: outcome.expiresAt?.toISOString() ?? null,
      issuer: null,
      subject: null,
      registrar: outcome.registrar,
    },
  };
}

const worker = new Worker<CheckJob>(
  checksQueueName(region),
  async (job: Job<CheckJob>) => {
    const result = await execute(job.data);
    // The result queue is the only way back; if this throws, BullMQ retries it.
    await resultsQueue().add("result", result);
  },
  { connection: connectionOptions(), prefix: QUEUE_PREFIX, concurrency: CONCURRENCY },
);

worker.on("failed", (job, err) => {
  console.error(`[probe:${region}] job ${job?.id} failed`, err);
});

worker.on("ready", () => {
  console.info(`[probe:${region}] draining ${checksQueueName(region)} at concurrency ${CONCURRENCY}`);
});

async function shutdown(signal: string): Promise<void> {
  console.info(`[probe:${region}] ${signal} — finishing in-flight checks`);
  await worker.close();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
