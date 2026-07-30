/**
 * Alert dispatcher: incident events -> channels (email/Slack/Discord/webhook).
 *
 * Kept as its own process so a slow webhook can never delay a check dispatch.
 * Dedupe and per-channel isolation live in src/lib/alerts.ts — this file is
 * just the queue plumbing and a backstop sweep.
 *
 * SMS (Twilio) is a Team-tier feature in Phase 3, per README's post-MVP list.
 */

// Must be first: the workers are plain Node processes, not Next.
import "@/lib/load-env";

import { Worker, type Job } from "bullmq";
import { and, gte, isNull, sql } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { incidents, notifications } from "@/db/schema";
import { ALERTS_QUEUE, connectionOptions, QUEUE_PREFIX, type AlertJob } from "@/lib/queue";
import { dispatchAlert } from "@/lib/alerts";

const BACKSTOP_MS = 60_000;
let running = true;

const worker = new Worker<AlertJob>(
  ALERTS_QUEUE,
  async (job: Job<AlertJob>) => {
    await dispatchAlert(job.data.incidentId, job.data.edge);
  },
  {
    // Alert volume is tiny; low concurrency keeps a Slack channel readable.
    connection: connectionOptions(),
    prefix: QUEUE_PREFIX,
    concurrency: 5,
  },
);

worker.on("failed", (job, err) => {
  console.error(`[alerts] job ${job?.id} failed`, err);
});

worker.on("ready", () => console.info(`[alerts] draining ${ALERTS_QUEUE}`));

/**
 * Backstop: if Redis dropped a job, an open incident could sit un-notified —
 * the one failure mode a monitoring product cannot have. Every minute,
 * re-dispatch the "down" edge for recent open incidents that have no
 * notification rows at all. The unique index makes this a no-op once it ran.
 */
async function backstop(): Promise<void> {
  const db = getDb();
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const stranded = await db
    .select({ id: incidents.id })
    .from(incidents)
    .where(
      and(
        isNull(incidents.resolvedAt),
        gte(incidents.startedAt, since),
        sql`not exists (
          select 1 from ${notifications}
          where ${notifications.incidentId} = ${incidents.id}
        )`,
      ),
    );

  for (const incident of stranded) {
    console.warn(`[alerts] backstop re-dispatching incident ${incident.id}`);
    await dispatchAlert(incident.id, "down");
  }
}

async function backstopLoop(): Promise<void> {
  while (running) {
    try {
      await backstop();
    } catch (err) {
      console.error("[alerts] backstop failed", err);
    }
    await new Promise((resolve) => setTimeout(resolve, BACKSTOP_MS));
  }
}

async function shutdown(signal: string): Promise<void> {
  console.info(`[alerts] ${signal} — draining`);
  running = false;
  await worker.close();
  await closeDb();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

void backstopLoop();
