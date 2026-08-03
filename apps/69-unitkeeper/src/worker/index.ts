/**
 * src/worker/index.ts — the standalone worker (`npm run worker`).
 *
 * Registers every job in ARCHITECTURE.md's queue table plus one repeatable job
 * that drives the nightly pass. It survives a Redis restart: ioredis reconnects
 * with backoff (lib/queue.ts) and BullMQ resumes, so a dropped connection is a gap
 * in throughput rather than a dead process.
 *
 * On Vercel there is no always-on process and this file is simply not deployed —
 * `/api/cron/tick` runs the same `runTick`, and documents render inline in the
 * request that needs them. Nothing in the domain layer knows which shape it is
 * running in.
 */

import "@/lib/load-env";
import { eq } from "drizzle-orm";
import type { Worker } from "bullmq";
import { closeDb, getDb } from "@/db";
import { lienCases, tenancies } from "@/db/schema";
import { handleStripeEvent } from "@/lib/billing";
import { delinquentRows, runLadderFor } from "@/lib/ladder-run";
import { isoDateOf } from "@/lib/money";
import { QUEUES, QUEUE_PREFIX, closeQueues, redisConnection } from "@/lib/queue";
import { hasQueue } from "@/lib/runtime";
import { advanceLienCases, runTick } from "@/lib/tick";
import { ownedTenancy } from "@/lib/tenancy";
import { defaultStatementWindow, renderLienPacket, renderStatement } from "@/lib/docs";
import { caseById, packOfRow } from "@/lib/lien";
import { owners } from "@/db/schema";

const CONCURRENCY = 4;
/** Drive the periodic pass every ten minutes; runTick is safe at any frequency. */
const TICK_EVERY_MS = 10 * 60 * 1000;

async function main(): Promise<void> {
  if (!hasQueue()) {
    console.error(
      "[worker] REDIS_URL is not set. This deployment has no queue — documents render inline and " +
        "/api/cron/tick runs the periodic pass. Nothing to do here.",
    );
    process.exit(1);
  }

  const { Worker: BullWorker, Queue } = await import("bullmq");
  const connection = (await redisConnection()) as never;
  const base = { connection, prefix: QUEUE_PREFIX, concurrency: CONCURRENCY };
  const workers: Worker[] = [];

  workers.push(
    new BullWorker(
      QUEUES.runAutopay,
      async () => {
        const result = await runTick(new Date());
        return result;
      },
      base,
    ),
  );

  workers.push(
    new BullWorker(
      QUEUES.lateLadder,
      async (job) => {
        const asOf = isoDateOf(new Date());
        const { ownerId } = job.data as { ownerId?: string };
        const ids = ownerId
          ? [ownerId]
          : (await getDb().select({ id: owners.id }).from(owners)).map((o) => o.id);
        let rungs = 0;
        for (const id of ids) {
          for (const row of await delinquentRows(id, asOf)) {
            rungs += (await runLadderFor(row, asOf)).length;
          }
        }
        return { rungs };
      },
      base,
    ),
  );

  workers.push(
    new BullWorker(
      QUEUES.advanceLiens,
      async () => ({ advanced: await advanceLienCases(isoDateOf(new Date())) }),
      base,
    ),
  );

  workers.push(
    new BullWorker(
      QUEUES.renderDocs,
      async (job) => {
        const data = job.data as { kind: string; tenancyId?: string; lienCaseId?: string };
        if (data.kind === "statement" && data.tenancyId) {
          const [row] = await getDb()
            .select({ id: tenancies.id })
            .from(tenancies)
            .where(eq(tenancies.id, data.tenancyId));
          if (!row) return { skipped: "no tenancy" };
          const ctx = await contextFor(data.tenancyId);
          if (!ctx) return { skipped: "no context" };
          const window = defaultStatementWindow(isoDateOf(new Date()));
          return renderStatement(ctx, window.from, window.to);
        }
        if (data.kind === "packet" && data.lienCaseId) {
          const found = await caseById(data.lienCaseId);
          if (!found) return { skipped: "no case" };
          const [caseRow] = await getDb()
            .select({ tenancyId: lienCases.tenancyId })
            .from(lienCases)
            .where(eq(lienCases.id, data.lienCaseId));
          const ctx = caseRow ? await contextFor(caseRow.tenancyId) : null;
          if (!ctx) return { skipped: "no context" };
          return renderLienPacket(ctx, found.lienCase, packOfRow(found.rule));
        }
        return { skipped: `unsupported kind ${data.kind}` };
      },
      base,
    ),
  );

  workers.push(
    new BullWorker(
      QUEUES.processStripeEvent,
      async (job) => {
        const { externalId } = job.data as { externalId: string };
        return handleStripeEvent(externalId);
      },
      base,
    ),
  );

  for (const worker of workers) {
    worker.on("failed", (job, err) => {
      console.error(`[worker] ${worker.name} job ${job?.id} failed`, err);
    });
    worker.on("completed", (job) => {
      console.info(`[worker] ${worker.name} job ${job.id} done`);
    });
  }

  // The repeatable job that stands in for cron on a host that has a process.
  const tickQueue = new Queue(QUEUES.runAutopay, { connection, prefix: QUEUE_PREFIX });
  await tickQueue.add(
    "periodic",
    {},
    { repeat: { every: TICK_EVERY_MS }, jobId: "unitkeeper-periodic" },
  );

  console.info(
    `[worker] up. queues: ${Object.values(QUEUES).join(", ")}. tick every ${TICK_EVERY_MS / 60000}m.`,
  );

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info(`[worker] ${signal} — draining`);
    await Promise.all(workers.map((w) => w.close()));
    await tickQueue.close().catch(() => {});
    await closeQueues();
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

async function contextFor(tenancyId: string) {
  const [row] = await getDb()
    .select({ id: tenancies.id })
    .from(tenancies)
    .where(eq(tenancies.id, tenancyId));
  if (!row) return null;
  const { tenancyContext } = await import("@/lib/tenancy");
  return tenancyContext(tenancyId);
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
