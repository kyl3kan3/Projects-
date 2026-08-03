/**
 * src/worker/index.ts — the standalone worker (`npm run worker`).
 *
 * Registers every job in ARCHITECTURE.md's queue table plus one repeatable job
 * that drives the nightly pass. It survives a Redis restart: ioredis reconnects
 * with backoff (lib/queue.ts) and BullMQ resumes, so a dropped connection is a gap
 * in throughput rather than a dead process.
 *
 * On Vercel there is no always-on process, and this file is simply not deployed —
 * `/api/cron/tick` runs the same `runTick`, and uploads parse inline. Nothing in
 * the domain layer knows which shape it is running in.
 */

import "@/lib/load-env";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { orgs, webhookEvents } from "@/db/schema";
import { parseCertificate } from "@/lib/certificates";
import { persistEvaluations, persistForVendor, engagementViews } from "@/lib/verdicts";
import { runTick, runTickForOrg } from "@/lib/tick";
import { buildBinder } from "@/lib/binder";
import { binderKey, putBinder } from "@/lib/storage";
import { QUEUES, QUEUE_PREFIX, closeQueues, redisConnection } from "@/lib/queue";
import { handleStripeEvent, markWebhookProcessed } from "@/lib/billing";
import { appendAudit } from "@/lib/audit";
import { hasQueue } from "@/lib/runtime";
import type { Worker } from "bullmq";

const CONCURRENCY = 4;
/** Drive the nightly pass every ten minutes; runTick is safe at any frequency. */
const TICK_EVERY_MS = 10 * 60 * 1000;

async function orgById(orgId: string) {
  const db = getDb();
  const [org] = await db.select().from(orgs).where(eq(orgs.id, orgId));
  return org ?? null;
}

async function main(): Promise<void> {
  if (!hasQueue()) {
    console.error(
      "[worker] REDIS_URL is not set. This deployment has no queue — the app parses inline and /api/cron/tick runs the nightly pass. Nothing to do here.",
    );
    process.exit(1);
  }

  const { Worker: BullWorker, Queue } = await import("bullmq");
  const connection = (await redisConnection()) as never;
  const base = { connection, prefix: QUEUE_PREFIX, concurrency: CONCURRENCY };
  const workers: Worker[] = [];

  workers.push(
    new BullWorker(
      QUEUES.parseCertificate,
      async (job) => {
        const { certificateId } = job.data as { certificateId: string };
        const outcome = await parseCertificate(certificateId);
        return outcome;
      },
      base,
    ),
  );

  workers.push(
    new BullWorker(
      QUEUES.evaluateCompliance,
      async (job) => {
        const { orgId, vendorId } = job.data as { orgId: string; vendorId?: string };
        const org = await orgById(orgId);
        if (!org) return { written: 0 };
        return vendorId ? persistForVendor(org, vendorId) : persistEvaluations(org);
      },
      base,
    ),
  );

  workers.push(
    new BullWorker(
      QUEUES.runChases,
      async (job) => {
        const { orgId } = (job.data ?? {}) as { orgId?: string };
        if (!orgId) return runTick();
        const org = await orgById(orgId);
        if (!org) return null;
        return runTickForOrg(org);
      },
      // One chase pass at a time: two concurrent passes over the same org would
      // both be correct (the ledger's unique key stops double sends) but would
      // waste a round of claims.
      { ...base, concurrency: 1 },
    ),
  );

  workers.push(
    new BullWorker(
      QUEUES.exportBinder,
      async (job) => {
        const { orgId, propertyId, requestedBy } = job.data as {
          orgId: string;
          propertyId: string;
          requestedBy: string | null;
        };
        const org = await orgById(orgId);
        if (!org) return null;
        const db = getDb();
        const { properties, binderExports } = await import("@/db/schema");
        const [property] = await db
          .select()
          .from(properties)
          .where(eq(properties.id, propertyId));
        if (!property) return null;
        const views = await engagementViews(org, { propertyId });
        const at = new Date();
        const binder = await buildBinder(org, property, views, at);
        const key = binderKey(org.id, property.id, at);
        await putBinder(key, binder.bytes);
        await db.insert(binderExports).values({
          orgId: org.id,
          propertyId: property.id,
          r2Key: key,
          requestedBy,
          exportedAt: at,
        });
        await appendAudit({
          orgId: org.id,
          actor: "system (binder worker)",
          action: "binder.exported",
          target: property.name,
          metadata: { key, certificates: binder.certificateCount, omitted: binder.omitted.length },
        });
        return { key, certificates: binder.certificateCount };
      },
      base,
    ),
  );

  workers.push(
    new BullWorker(
      QUEUES.processStripeEvent,
      async (job) => {
        const { externalId } = job.data as { externalId: string };
        const db = getDb();
        const [row] = await db
          .select()
          .from(webhookEvents)
          .where(eq(webhookEvents.externalId, externalId));
        if (!row) return null;
        if (row.processedAt) return { skipped: "already processed" };
        await handleStripeEvent(row.payload as never);
        await markWebhookProcessed(externalId);
        return { processed: externalId };
      },
      base,
    ),
  );

  for (const worker of workers) {
    worker.on("failed", (job, err) => {
      console.error(`[worker] ${worker.name} job ${job?.id} failed:`, err?.message);
    });
    worker.on("completed", (job) => {
      console.log(`[worker] ${worker.name} job ${job.id} done`);
    });
    worker.on("error", (err) => {
      // Connection errors arrive here during a Redis restart. Log and stay up.
      console.error(`[worker] ${worker.name} error:`, err.message);
    });
  }

  // The repeatable nightly pass. Registered idempotently by job id, so restarting
  // the worker does not accumulate schedules.
  const tickQueue = new Queue(QUEUES.runChases, { connection, prefix: QUEUE_PREFIX });
  await tickQueue.add(
    QUEUES.runChases,
    {},
    { repeat: { every: TICK_EVERY_MS }, jobId: "certshield-tick" },
  );

  console.log(
    `[worker] up. queues: ${Object.values(QUEUES).join(", ")} · tick every ${TICK_EVERY_MS / 60000}m`,
  );

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[worker] ${signal} — draining`);
    await Promise.all(workers.map((w) => w.close()));
    await tickQueue.close();
    await closeQueues();
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
