/**
 * Briefcast worker — long-lived Node process. The meeting pipeline:
 *
 *   transcribe -> extract-insights -> deliver-slack
 *                                  -> compose + (auto) apply CRM sync
 *
 * Webhook handlers return fast; every heavy step (media fetch, Deepgram,
 * Claude, CRM writes) happens here, retried with exponential backoff.
 */

import { Worker, type Job } from "bullmq";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { applySyncLog, composeSyncLogs } from "@/lib/crm/sync";
import { env } from "@/lib/env";
import { extractInsights } from "@/lib/extract";
import { postBriefToSlack } from "@/lib/slack";
import { fmtMeta } from "@/lib/format";
import {
  queue,
  redis,
  type CrmSyncJob,
  type DeliverSlackJob,
  type ExtractJob,
  type TranscribeJob,
} from "@/lib/queue";
import { getRecording } from "@/lib/recall";
import { transcribeUrl } from "@/lib/transcribe";

/* ---- 1. transcribe ---- */
async function transcribe(job: Job<TranscribeJob>) {
  const meeting = await db.query.meetings.findFirst({ where: eq(schema.meetings.id, job.data.meetingId) });
  if (!meeting) return;
  const bot = await db.query.bots.findFirst({ where: eq(schema.bots.meetingId, meeting.id) });
  if (!bot?.recallBotId) throw new Error("No bot for meeting");

  await db.update(schema.meetings).set({ status: "processing" }).where(eq(schema.meetings.id, meeting.id));

  const rec = await getRecording(bot.recallBotId);
  if (!rec.recordingUrl) throw new Error("Recording not ready");
  await db
    .update(schema.bots)
    .set({ recordingUrl: rec.recordingUrl, mediaExpiresAt: rec.mediaExpiresAt })
    .where(eq(schema.bots.id, bot.id));

  const result = await transcribeUrl(rec.recordingUrl);
  const [t] = await db
    .insert(schema.transcripts)
    .values({
      meetingId: meeting.id,
      provider: "deepgram",
      durationSeconds: result.durationSeconds,
      wordCount: result.wordCount,
      language: result.language,
      status: "ready",
    })
    .returning();
  if (result.segments.length) {
    await db.insert(schema.transcriptSegments).values(
      result.segments.map((s) => ({
        transcriptId: t.id,
        idx: s.idx,
        speakerLabel: s.speakerLabel,
        startMs: s.startMs,
        endMs: s.endMs,
        text: s.text,
      })),
    );
  }
  await db
    .update(schema.meetings)
    .set({ durationSeconds: result.durationSeconds })
    .where(eq(schema.meetings.id, meeting.id));

  await queue("pipeline").add("extract", { meetingId: meeting.id } satisfies ExtractJob);
}

/* ---- 2. extract-insights ---- */
async function extract(job: Job<ExtractJob>) {
  const meeting = await db.query.meetings.findFirst({ where: eq(schema.meetings.id, job.data.meetingId) });
  if (!meeting) return;

  const transcript = await db.query.transcripts.findFirst({ where: eq(schema.transcripts.meetingId, meeting.id) });
  if (!transcript) throw new Error("No transcript");
  const segments = await db.query.transcriptSegments.findMany({
    where: eq(schema.transcriptSegments.transcriptId, transcript.id),
  });

  const link = await db.query.meetingDealLinks.findFirst({ where: eq(schema.meetingDealLinks.meetingId, meeting.id) });
  const deal = link ? await db.query.deals.findFirst({ where: eq(schema.deals.id, link.dealId) }) : null;

  const { extraction, usage } = await extractInsights({
    title: meeting.title,
    segments: segments.map((s) => ({ idx: s.idx, speakerLabel: s.speakerLabel ?? "", startMs: s.startMs, endMs: s.endMs, text: s.text })),
    attendees: meeting.attendees,
    deal: deal
      ? {
          name: deal.name,
          stage: deal.stage,
          amount: deal.amountCents ? `$${(deal.amountCents / 100).toLocaleString()}` : null,
          closeDate: deal.closeDate,
        }
      : null,
  });

  await db.insert(schema.summaries).values({
    meetingId: meeting.id,
    model: env.extractionModel,
    overview: extraction.overview,
    decisions: extraction.decisions,
    risks: extraction.risks,
    nextSteps: extraction.nextSteps,
    crmFieldProposals: extraction.crmFieldProposals,
    tokenUsage: usage,
  });

  if (extraction.actionItems.length) {
    await db.insert(schema.actionItems).values(
      extraction.actionItems.map((a) => ({
        meetingId: meeting.id,
        text: a.text,
        ownerName: a.ownerName,
        dueDate: a.dueDate,
        sourceSegmentIdx: a.sourceSegmentIdx,
        status: "open" as const,
      })),
    );
  }

  await db.update(schema.meetings).set({ status: "ready" }).where(eq(schema.meetings.id, meeting.id));

  await queue("slack").add("deliver-slack", { meetingId: meeting.id } satisfies DeliverSlackJob);
  await queue("crm").add("sync-crm", { meetingId: meeting.id } satisfies CrmSyncJob);
}

/* ---- 3. deliver-slack ---- */
async function deliverSlack(job: Job<DeliverSlackJob>) {
  const meeting = await db.query.meetings.findFirst({ where: eq(schema.meetings.id, job.data.meetingId) });
  if (!meeting?.organizerUserId) return;
  const organizer = await db.query.users.findFirst({ where: eq(schema.users.id, meeting.organizerUserId) });
  if (!organizer?.slackUserId) return; // Slack not linked — skip silently

  const summary = await db.query.summaries.findFirst({ where: eq(schema.summaries.meetingId, meeting.id) });
  const items = await db.query.actionItems.findMany({ where: eq(schema.actionItems.meetingId, meeting.id) });
  const pending = await db.query.crmSyncLogs.findMany({
    where: and(eq(schema.crmSyncLogs.meetingId, meeting.id), eq(schema.crmSyncLogs.status, "pending")),
  });

  const botToken = process.env.SLACK_BOT_TOKEN ?? "";
  if (!botToken && !env.dryRun) return;

  await postBriefToSlack({
    botToken,
    slackUserId: organizer.slackUserId,
    title: meeting.title,
    meta: fmtMeta(meeting.startsAt, meeting.durationSeconds, meeting.platform),
    overview: summary?.overview ?? "",
    actionItems: items.map((a) => ({ text: a.text, owner: a.ownerName, due: a.dueDate })),
    pendingProposals: pending.filter((p) => p.operation === "update_field").length,
    meetingUrl: `${env.appUrl}/meetings/${meeting.id}`,
  });
}

/* ---- 4. compose + maybe auto-apply CRM sync ---- */
async function syncCrm(job: Job<CrmSyncJob>) {
  const meeting = await db.query.meetings.findFirst({ where: eq(schema.meetings.id, job.data.meetingId) });
  if (!meeting) return;

  const count = await composeSyncLogs(meeting.id);
  if (count === 0) return;

  const conn = await db.query.crmConnections.findFirst({
    where: and(eq(schema.crmConnections.orgId, meeting.orgId), eq(schema.crmConnections.status, "active")),
  });
  if (!conn) return;

  // Auto mode: apply high-confidence field updates immediately; everything
  // else waits for a human. Review mode (default): all wait.
  if (conn.writeMode === "auto") {
    const pending = await db.query.crmSyncLogs.findMany({
      where: and(eq(schema.crmSyncLogs.meetingId, meeting.id), eq(schema.crmSyncLogs.status, "pending")),
    });
    for (const log of pending) {
      const highConfidence = (log.confidence ?? 100) >= 85;
      if (log.operation !== "update_field" || highConfidence) {
        await applySyncLog(log.id, "system").catch(() => {});
      }
    }
  }
}

/* ---- boot ---- */
function boot() {
  const connection = redis();
  const opts = { connection, concurrency: 4 };

  new Worker(
    "pipeline",
    async (job) => {
      if (job.name === "transcribe") return transcribe(job as Job<TranscribeJob>);
      if (job.name === "extract") return extract(job as Job<ExtractJob>);
    },
    opts,
  );
  new Worker("slack", async (job) => deliverSlack(job as Job<DeliverSlackJob>), opts);
  new Worker("crm", async (job) => syncCrm(job as Job<CrmSyncJob>), opts);

  console.log("[briefcast-worker] queues live: pipeline, slack, crm");
}

boot();

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.log(`[briefcast-worker] ${sig} — shutting down`);
    process.exit(0);
  });
}

