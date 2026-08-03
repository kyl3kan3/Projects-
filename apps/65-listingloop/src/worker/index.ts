/**
 * src/worker/index.ts — `npm run worker`
 *
 * The standalone worker from ARCHITECTURE.md. Registers all four jobs:
 *
 *   send-reminders        nightly (repeatable) + on demand
 *   recompute-dates       after an anchor edit is applied
 *   build-packet          deal closed / requested
 *   process-stripe-event  after the webhook acks
 *
 * It is optional. On Vercel there is no always-on process, so `/api/cron/tick`
 * runs the same `runTick()` and recomputes happen inline in the server action.
 * The worker exists for a deployment that has Redis and wants the work off the
 * request path.
 *
 * Redis reconnects are BullMQ's job: `maxRetriesPerRequest: null` keeps commands
 * queued across a restart instead of throwing, and a job whose lock lapsed while
 * Redis was away becomes stalled and is retried. The process does not exit on a
 * connection error — it logs and waits.
 */

import "@/lib/load-env";
import type { Job } from "bullmq";
import { closeDb, getDb } from "@/db";
import { accounts, deals } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { logActivity } from "@/lib/activity";
import { processWebhookEvent } from "@/lib/billing";
import { applyAnchorChange, anchorsOf, loadDealFile } from "@/lib/deals";
import { dealActivityAsc } from "@/lib/deals";
import { buildPacket } from "@/lib/packet";
import { QUEUE_NAMES, closeQueues, getQueue, queueConnection } from "@/lib/queue";
import { runFanOut } from "@/lib/reminders";
import { hasQueue } from "@/lib/runtime";
import { runTick } from "@/lib/tick";

async function handleSendReminders(job: Job<{ accountId?: string; today?: string }>): Promise<unknown> {
  if (!job.data.accountId) return runTick({ today: job.data.today });
  const db = getDb();
  const [account] = await db.select().from(accounts).where(eq(accounts.id, job.data.accountId));
  if (!account) return { skipped: "no such account" };
  return runFanOut(account, { today: job.data.today });
}

/**
 * Re-run the engine for a deal against its own stored anchors. This is the
 * repair path — a holiday table update, or a template rule edit — not the
 * coordinator's anchor edit, which is applied synchronously behind its diff
 * preview because the coordinator is standing there waiting for it.
 */
async function handleRecomputeDates(job: Job<{ dealId: string }>): Promise<unknown> {
  const db = getDb();
  const [deal] = await db.select().from(deals).where(eq(deals.id, job.data.dealId));
  if (!deal) return { skipped: "no such deal" };
  const [account] = await db.select().from(accounts).where(eq(accounts.id, deal.accountId));
  if (!account) return { skipped: "no such account" };
  const result = await applyAnchorChange(
    deal.id,
    deal.accountId,
    anchorsOf(deal),
    // A system recompute has no user behind it.
    (await firstUserId(deal.accountId)) ?? "",
    "ListingLoop (scheduled recompute)",
    account.state,
    account.timezone,
    account.settings,
  );
  return result ?? { skipped: "deal not visible" };
}

async function firstUserId(accountId: string): Promise<string | null> {
  const db = getDb();
  const rows = await db.query.users.findMany({
    where: (u, { eq: e }) => e(u.accountId, accountId),
    limit: 1,
  });
  return rows[0]?.id ?? null;
}

async function handleBuildPacket(job: Job<{ dealId: string; requestedBy: string }>): Promise<unknown> {
  const db = getDb();
  const [deal] = await db.select().from(deals).where(eq(deals.id, job.data.dealId));
  if (!deal) return { skipped: "no such deal" };
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, deal.accountId)));
  if (!account) return { skipped: "no such account" };
  const file = await loadDealFile(deal.id, deal.accountId, account.timezone, account.state, account.settings);
  if (!file) return { skipped: "deal not visible" };
  const activity = await dealActivityAsc(deal.id);
  const zip = await buildPacket({ file, activity });
  await logActivity({
    dealId: deal.id,
    actor: job.data.requestedBy,
    action: "packet_exported",
    target: "Closing packet",
    metadata: { detail: `Closing packet built — ${Math.round(zip.length / 1024)} KB`, bytes: zip.length },
  });
  // The zip is not persisted: the console downloads it straight from
  // /api/deals/[id]/packet, and keeping a stale copy in a bucket is a way to
  // hand somebody yesterday's file.
  return { bytes: zip.length };
}

async function handleStripeEvent(job: Job<{ webhookEventId: string }>): Promise<unknown> {
  return processWebhookEvent(job.data.webhookEventId);
}

async function main(): Promise<void> {
  if (!hasQueue()) {
    console.error(
      "[worker] REDIS_URL is not set. This deployment runs its scheduled work from /api/cron/tick instead; nothing to do.",
    );
    process.exit(1);
  }

  const { Worker } = await import("bullmq");
  const connection = await queueConnection();
  connection.on("error", (err: Error) => {
    // Never fatal: ioredis reconnects, and exiting here would take the worker
    // down every time Redis restarts.
    console.error("[worker] redis error (will reconnect):", err.message);
  });
  connection.on("reconnecting", () => console.warn("[worker] redis reconnecting…"));
  connection.on("ready", () => console.log("[worker] redis ready"));

  const handlers: Record<string, (job: Job) => Promise<unknown>> = {
    [QUEUE_NAMES.sendReminders]: (job) => handleSendReminders(job as Job<{ accountId?: string; today?: string }>),
    [QUEUE_NAMES.recomputeDates]: (job) => handleRecomputeDates(job as Job<{ dealId: string }>),
    [QUEUE_NAMES.buildPacket]: (job) =>
      handleBuildPacket(job as Job<{ dealId: string; requestedBy: string }>),
    [QUEUE_NAMES.processStripeEvent]: (job) => handleStripeEvent(job as Job<{ webhookEventId: string }>),
  };

  const workers = Object.entries(handlers).map(([name, handler]) => {
    const worker = new Worker(name, handler, { connection, concurrency: 4 });
    worker.on("completed", (job) => console.log(`[worker] ${name} ${job.id} completed`));
    worker.on("failed", (job, err) =>
      console.error(`[worker] ${name} ${job?.id} failed (attempt ${job?.attemptsMade}):`, err.message),
    );
    return worker;
  });

  // The nightly sweep. Repeatable jobs live in Redis, so re-registering the same
  // key on every boot is a no-op rather than a duplicate.
  const remindersQueue = await getQueue(QUEUE_NAMES.sendReminders);
  await remindersQueue?.add(
    QUEUE_NAMES.sendReminders,
    {},
    { repeat: { pattern: "0 13 * * *" }, jobId: "nightly-reminders" },
  );

  console.log(`[worker] registered: ${Object.keys(handlers).join(", ")}`);
  console.log("[worker] nightly send-reminders scheduled at 13:00 UTC");

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[worker] ${signal} — finishing in-flight jobs`);
    await Promise.all(workers.map((w) => w.close()));
    await closeQueues();
    await closeDb();
    await connection.quit().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
