/**
 * LensCRM worker — long-lived Node process. Two responsibilities:
 *   images — sharp derivatives (thumb/web/full), quota rollup
 *   cron   — automation scheduler: claim due runs, render, send via Resend
 *
 * Webhook/route handlers stay fast; all heavy work lands here with retries.
 */
import { Worker, type Job } from "bullmq";
import { and, eq, lte } from "drizzle-orm";
import { Resend } from "resend";
import { db, schema } from "@/db";
import { addBytes, galleryHasQuota } from "@/lib/galleries";
import { mergeContract } from "@/lib/contracts";
import { env } from "@/lib/env";
import { queue, redis, type ProcessImageJob, type SendEmailJob } from "@/lib/queue";

/* ---- image processing ---- */
async function processImage(job: Job<ProcessImageJob>) {
  const image = await db.query.galleryImages.findFirst({ where: eq(schema.galleryImages.id, job.data.galleryImageId) });
  if (!image || image.processStatus === "ready") return;
  const gallery = await db.query.galleries.findFirst({ where: eq(schema.galleries.id, image.galleryId) });
  if (!gallery) return;

  // Quota gate: reject if the account is over its tier limit.
  if (!(await galleryHasQuota(gallery.accountId, image.sizeBytes))) {
    await db.update(schema.galleryImages).set({ processStatus: "failed" }).where(eq(schema.galleryImages.id, image.id));
    return;
  }

  if (env.dryRun) {
    await db.update(schema.galleryImages).set({ processStatus: "ready", derivatives: { thumb: image.originalKey, web: image.originalKey, full: image.originalKey } }).where(eq(schema.galleryImages.id, image.id));
    await addBytes(gallery.accountId, gallery.id, image.sizeBytes);
    return;
  }

  // Real pipeline: download original from R2, emit derivatives with sharp,
  // write content-hashed keys, roll up bytes. (sharp import kept dynamic so
  // the web build never bundles it.)
  const { presignGet, s3 } = await import("@/lib/storage");
  const sharp = (await import("sharp")).default;
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");

  const url = await presignGet(image.originalKey);
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  const sizes = { thumb: 400, web: 1600, full: 2560 } as const;
  const derivatives: Record<string, string> = {};
  for (const [name, w] of Object.entries(sizes)) {
    let pipeline = sharp(buf).rotate().resize({ width: w, withoutEnlargement: true }).jpeg({ quality: name === "thumb" ? 72 : 82 });
    if (gallery.watermarkEnabled && name !== "thumb") pipeline = pipeline; // watermark compositing is a fast-follow
    const out = await pipeline.toBuffer();
    const key = `galleries/${gallery.id}/${name}/${image.id}.jpg`;
    await s3().send(new PutObjectCommand({ Bucket: env.r2Bucket, Key: key, Body: out, ContentType: "image/jpeg", CacheControl: "public, max-age=31536000, immutable" }));
    derivatives[name] = key;
  }
  const meta = await sharp(buf).metadata();
  await db.update(schema.galleryImages).set({ processStatus: "ready", derivatives, width: meta.width, height: meta.height }).where(eq(schema.galleryImages.id, image.id));
  await addBytes(gallery.accountId, gallery.id, image.sizeBytes);
}

/* ---- email send ---- */
let _resend: Resend | null = null;
function resendClient(): Resend { if (!_resend) _resend = new Resend(env.resendApiKey); return _resend; }

async function sendEmail(job: Job<SendEmailJob>) {
  if (job.data.automationRunId) {
    const run = await db.query.automationRuns.findFirst({ where: eq(schema.automationRuns.id, job.data.automationRunId) });
    if (!run || run.status !== "scheduled") return;
  }
  if (env.dryRun) {
    if (job.data.automationRunId) await db.update(schema.automationRuns).set({ status: "sent", sentAt: new Date(), resendMessageId: "dry-run" }).where(eq(schema.automationRuns.id, job.data.automationRunId));
    return;
  }
  const sent = await resendClient().emails.send({ from: env.emailFrom, to: job.data.to, subject: job.data.subject, html: job.data.html });
  if (job.data.automationRunId) {
    await db.update(schema.automationRuns).set({ status: sent.error ? "failed" : "sent", sentAt: new Date(), resendMessageId: sent.data?.id ?? null, error: sent.error?.message ?? null }).where(eq(schema.automationRuns.id, job.data.automationRunId));
  }
}

/* ---- automation scheduler: claim due runs every 5 min ---- */
async function scanAutomations() {
  const due = await db.query.automationRuns.findMany({
    where: and(eq(schema.automationRuns.status, "scheduled"), lte(schema.automationRuns.scheduledFor, new Date())),
    limit: 100,
  });
  for (const run of due) {
    const automation = await db.query.emailAutomations.findFirst({ where: eq(schema.emailAutomations.id, run.automationId) });
    const client = run.clientId ? await db.query.clients.findFirst({ where: eq(schema.clients.id, run.clientId) }) : null;
    const session = run.sessionId ? await db.query.sessions.findFirst({ where: eq(schema.sessions.id, run.sessionId) }) : null;
    const account = await db.query.accounts.findFirst({ where: eq(schema.accounts.id, run.accountId) });
    if (!automation || !client?.email || !account) {
      await db.update(schema.automationRuns).set({ status: "skipped" }).where(eq(schema.automationRuns.id, run.id));
      continue;
    }
    // Re-validate: session still confirmed and in the future for reminders.
    if (automation.trigger === "session_scheduled" && (!session || session.status !== "confirmed" || session.startsAt.getTime() < Date.now())) {
      await db.update(schema.automationRuns).set({ status: "skipped" }).where(eq(schema.automationRuns.id, run.id));
      continue;
    }
    const data = {
      client: { name: client.name, email: client.email, partnerName: client.partnerName ?? "" },
      session: session ? { date: session.startsAt.toLocaleDateString("en-US", { dateStyle: "long" }), location: session.location ?? "" } : undefined,
      studio: { name: account.name },
    };
    const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1b1b19;max-width:520px;margin:0 auto;padding:24px;">${mergeContract(automation.body, data).replace(/\n/g, "<br/>")}</div>`;
    await queue("email").add("send", { to: client.email, subject: mergeContract(automation.subject, data), html, automationRunId: run.id } satisfies SendEmailJob);
  }
}

function boot() {
  const connection = redis();
  const opts = { connection, concurrency: 4 };
  new Worker("images", async (job) => processImage(job as Job<ProcessImageJob>), opts);
  new Worker("email", async (job) => sendEmail(job as Job<SendEmailJob>), opts);
  new Worker("cron", async (job) => { if (job.name === "scan-automations") return scanAutomations(); }, opts);
  void queue("cron").add("scan-automations", {}, { repeat: { every: 5 * 60_000 }, jobId: "automation-scan" });
  console.log("[lenscrm-worker] queues live: images, email, cron");
}
boot();

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => { console.log(`[lenscrm-worker] ${sig} — shutting down`); process.exit(0); });
}
