/**
 * Walkthrough capture and the drafting pipeline.
 *
 * Capture is the part that has to survive a real jobsite: a phone in a basement
 * on one bar of LTE, uploading 40-second audio chunks while the tech keeps
 * walking. So:
 *
 *  - each chunk and photo gets its own `walkthrough_media` row and its own
 *    presigned PUT, and the client retries per asset;
 *  - "End walkthrough" verifies what actually landed instead of trusting the
 *    client, marks stragglers `failed`, and proceeds with what is there;
 *  - the quota is claimed *before* any model spend, with a conditional UPDATE so
 *    two phones finishing at once cannot both take the last quote of the month;
 *  - and the pipeline is idempotent: re-running a drafted walkthrough returns the
 *    estimate it already produced rather than making a second one.
 *
 * ARCHITECTURE.md runs this on a BullMQ worker. The deployment target (Vercel +
 * Neon, see the repo's DEPLOYING.md) has no always-on process, so processing runs
 * inline in the route that completes the walkthrough, with the status machine
 * persisted at each step so the capture screen can poll it. `npm run worker` can
 * still pick up anything left in `uploaded` — same function, different trigger.
 */

import { and, asc, eq, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  estimates,
  jobs,
  organizations,
  walkthroughMedia,
  walkthroughs,
  type Job,
  type Organization,
  type Walkthrough,
  type WalkthroughMedia,
} from "@/db/schema";
import { audit, SYSTEM } from "@/lib/audit";
import { draftEstimate } from "@/lib/drafting";
import { createEstimateFromDraft, scopeSummaryFrom } from "@/lib/estimates";
import { matchableItems } from "@/lib/price-book";
import { canDraft, orgAsGatable, quoteCapacity, quoteLimitFor } from "@/lib/plans";
import { getObject, headObject, isAllowedMediaType, mediaKey, presignUpload } from "@/lib/storage";
import { segmentTranscript } from "@/lib/matching";
import { transcribeWalkthrough, transcriptionProvider, type AudioChunk } from "@/lib/transcription";

export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 12 * 1024 * 1024;

/* ------------------------------------------------------------------ create --- */

export async function startWalkthrough(
  org: Organization,
  actorId: string,
  jobId: string,
): Promise<Walkthrough> {
  const db = getDb();
  const [walkthrough] = await db
    .insert(walkthroughs)
    .values({ organizationId: org.id, jobId, recordedBy: actorId, status: "capturing" })
    .returning();
  await audit(org.id, actorId, "walkthrough_started", walkthrough.id, { jobId });
  return walkthrough;
}

export async function getWalkthrough(
  organizationId: string,
  id: string,
): Promise<{ walkthrough: Walkthrough; job: Job; media: WalkthroughMedia[] } | null> {
  const db = getDb();
  const [walkthrough] = await db
    .select()
    .from(walkthroughs)
    .where(and(eq(walkthroughs.organizationId, organizationId), eq(walkthroughs.id, id)));
  if (!walkthrough) return null;
  const [job] = await db.select().from(jobs).where(eq(jobs.id, walkthrough.jobId));
  if (!job) return null;
  const media = await db
    .select()
    .from(walkthroughMedia)
    .where(eq(walkthroughMedia.walkthroughId, id))
    .orderBy(asc(walkthroughMedia.kind), asc(walkthroughMedia.sequence));
  return { walkthrough, job, media };
}

export async function latestWalkthroughForJob(
  organizationId: string,
  jobId: string,
): Promise<Walkthrough | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(walkthroughs)
    .where(and(eq(walkthroughs.organizationId, organizationId), eq(walkthroughs.jobId, jobId)))
    .orderBy(sql`created_at desc`)
    .limit(1);
  return row ?? null;
}

/* ------------------------------------------------------------------ upload --- */

export interface RegisteredUpload {
  mediaId: string;
  key: string;
  uploadUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
}

export type RegisterResult =
  | { ok: true; upload: RegisteredUpload }
  | { ok: false; error: string };

/**
 * Register one asset and hand back a presigned PUT.
 *
 * A retry of the same (kind, sequence) reuses its row and re-presigns, because the
 * common case for a retry is an expired URL on a phone that went through a dead
 * zone — not a second distinct recording.
 */
export async function registerUpload(args: {
  org: Organization;
  walkthroughId: string;
  kind: "audio" | "photo";
  sequence: number;
  contentType: string;
  sizeBytes?: number;
}): Promise<RegisterResult> {
  if (!isAllowedMediaType(args.kind, args.contentType)) {
    return { ok: false, error: `${args.contentType} is not a valid ${args.kind} type.` };
  }
  const maxBytes = args.kind === "audio" ? MAX_AUDIO_BYTES : MAX_PHOTO_BYTES;
  if (args.sizeBytes && args.sizeBytes > maxBytes) {
    return {
      ok: false,
      error: `That ${args.kind} is ${(args.sizeBytes / 1_048_576).toFixed(1)}MB; the limit is ${Math.round(maxBytes / 1_048_576)}MB.`,
    };
  }

  const db = getDb();
  const found = await getWalkthrough(args.org.id, args.walkthroughId);
  if (!found) return { ok: false, error: "That walkthrough no longer exists." };

  const key = mediaKey({
    organizationId: args.org.id,
    walkthroughId: args.walkthroughId,
    kind: args.kind,
    sequence: args.sequence,
    contentType: args.contentType,
  });

  const existing = found.media.find(
    (media) => media.kind === args.kind && media.sequence === args.sequence,
  );
  let mediaId = existing?.id;
  if (existing) {
    await db
      .update(walkthroughMedia)
      .set({
        storageKey: key,
        contentType: args.contentType,
        uploadStatus: "pending",
        uploadAttempts: existing.uploadAttempts + 1,
      })
      .where(eq(walkthroughMedia.id, existing.id));
  } else {
    const [inserted] = await db
      .insert(walkthroughMedia)
      .values({
        organizationId: args.org.id,
        walkthroughId: args.walkthroughId,
        kind: args.kind,
        storageKey: key,
        contentType: args.contentType,
        sequence: args.sequence,
        sizeBytes: args.sizeBytes ?? 0,
      })
      .returning();
    mediaId = inserted.id;
  }

  const presigned = await presignUpload({ key, contentType: args.contentType, maxBytes });
  return {
    ok: true,
    upload: {
      mediaId: mediaId as string,
      key: presigned.key,
      uploadUrl: presigned.uploadUrl,
      method: presigned.method,
      headers: presigned.headers,
      expiresAt: presigned.expiresAt,
    },
  };
}

/**
 * Confirm an upload by looking at the object store, not by believing the client.
 * A phone that says "done" while the PUT actually 403'd is exactly how a
 * walkthrough silently loses half its audio.
 */
export async function confirmUpload(
  organizationId: string,
  mediaId: string,
  caption?: string | null,
): Promise<{ ok: boolean; sizeBytes: number }> {
  const db = getDb();
  const [media] = await db
    .select()
    .from(walkthroughMedia)
    .where(
      and(eq(walkthroughMedia.organizationId, organizationId), eq(walkthroughMedia.id, mediaId)),
    );
  if (!media) return { ok: false, sizeBytes: 0 };

  const head = await headObject(media.storageKey);
  if (!head || head.sizeBytes <= 0) {
    await db
      .update(walkthroughMedia)
      .set({ uploadStatus: "failed" })
      .where(eq(walkthroughMedia.id, mediaId));
    return { ok: false, sizeBytes: 0 };
  }
  await db
    .update(walkthroughMedia)
    .set({
      uploadStatus: "complete",
      sizeBytes: head.sizeBytes,
      caption: caption === undefined ? media.caption : caption?.trim() || null,
    })
    .where(eq(walkthroughMedia.id, mediaId));
  return { ok: true, sizeBytes: head.sizeBytes };
}

/* --------------------------------------------------------------- metering --- */

export type QuotaClaim =
  | { ok: true; used: number; limit: number }
  | { ok: false; code: "PLAN_LIMIT" | "READ_ONLY"; message: string };

/**
 * Claim one AI quote against the period's allowance.
 *
 * The increment is a single conditional UPDATE (`... where quote_count < limit`),
 * so it is atomic: two walkthroughs completing in the same second cannot both take
 * the 25th quote on Solo. Nothing is refunded on failure — the counter reflects
 * model spend, and a failed draft still cost tokens.
 */
export async function claimQuote(org: Organization): Promise<QuotaClaim> {
  const gate = canDraft(orgAsGatable(org));
  if (!gate.ok) return { ok: false, code: gate.code, message: gate.message };

  const db = getDb();
  const limit = quoteLimitFor(orgAsGatable(org));
  const [updated] = await db
    .update(organizations)
    .set({
      quoteCountCurrentPeriod: sql`${organizations.quoteCountCurrentPeriod} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(eq(organizations.id, org.id), lt(organizations.quoteCountCurrentPeriod, limit)),
    )
    .returning();

  if (!updated) {
    // Someone else took the last quote between the gate check and the update.
    const atLimit = canDraft({ ...orgAsGatable(org), quoteCountCurrentPeriod: limit });
    return {
      ok: false,
      code: "PLAN_LIMIT",
      message: atLimit.ok ? "You are out of AI quotes for this period." : atLimit.message,
    };
  }
  return { ok: true, used: updated.quoteCountCurrentPeriod, limit };
}

/**
 * Reset the meter at the start of a billing period. Called from the
 * `invoice.paid` webhook, and defensively by the daily sweep for trials, which
 * have no invoices. The comparison is done in SQL so Postgres decides what "a
 * month ago" means.
 */
export async function resetQuoteMeter(organizationId: string): Promise<void> {
  const db = getDb();
  await db
    .update(organizations)
    .set({ quoteCountCurrentPeriod: 0, periodStartedAt: sql`now()`, updatedAt: new Date() })
    .where(eq(organizations.id, organizationId));
}

/* --------------------------------------------------------------- pipeline --- */

export type CompleteResult =
  | { ok: true; estimateId: string; walkthroughId: string; degraded: boolean; notice: string | null }
  | {
      ok: false;
      code: "PLAN_LIMIT" | "READ_ONLY" | "TRANSCRIPTION" | "NO_PRICE_BOOK" | "NOT_FOUND";
      message: string;
      walkthroughId?: string;
    };

export interface CompleteOptions {
  durationSeconds?: number;
  notes?: string | null;
}

/**
 * End a walkthrough and draft its estimate.
 *
 * The status machine is persisted at each step (uploaded → transcribing →
 * drafting → drafted | failed) so the capture screen can poll and show what is
 * happening, and so a crash halfway leaves a walkthrough that says what it was
 * doing rather than one stuck on "capturing".
 */
export async function completeWalkthrough(
  org: Organization,
  actorId: string,
  walkthroughId: string,
  options: CompleteOptions = {},
): Promise<CompleteResult> {
  const db = getDb();
  const found = await getWalkthrough(org.id, walkthroughId);
  if (!found) return { ok: false, code: "NOT_FOUND", message: "That walkthrough no longer exists." };

  // Idempotency: a second "end walkthrough" (double tap, retried request) must
  // not produce a second estimate or spend a second quote.
  if (found.walkthrough.status === "drafted") {
    const [existing] = await db
      .select()
      .from(estimates)
      .where(eq(estimates.walkthroughId, walkthroughId))
      .orderBy(asc(estimates.version))
      .limit(1);
    if (existing) {
      return {
        ok: true,
        estimateId: existing.id,
        walkthroughId,
        degraded: false,
        notice: null,
      };
    }
  }

  if (options.notes !== undefined) {
    await db
      .update(walkthroughs)
      .set({ notes: options.notes?.trim() || null, updatedAt: new Date() })
      .where(eq(walkthroughs.id, walkthroughId));
  }

  // Verify what actually landed. Anything still pending is marked failed so the
  // capture screen can show it, and drafting proceeds with the rest.
  const pending = found.media.filter((media) => media.uploadStatus !== "complete");
  let complete = found.media.filter((media) => media.uploadStatus === "complete");
  for (const media of pending) {
    const head = await headObject(media.storageKey);
    if (head && head.sizeBytes > 0) {
      await db
        .update(walkthroughMedia)
        .set({ uploadStatus: "complete", sizeBytes: head.sizeBytes })
        .where(eq(walkthroughMedia.id, media.id));
      complete.push({ ...media, uploadStatus: "complete", sizeBytes: head.sizeBytes });
    } else {
      await db
        .update(walkthroughMedia)
        .set({ uploadStatus: "failed" })
        .where(eq(walkthroughMedia.id, media.id));
    }
  }
  complete = complete.filter((media) => media.sizeBytes > 0);

  const durationSeconds = Math.max(
    0,
    Math.round(options.durationSeconds ?? found.walkthrough.durationSeconds),
  );
  await db
    .update(walkthroughs)
    .set({
      status: "uploaded",
      durationSeconds,
      audioSeconds: durationSeconds,
      startedProcessingAt: new Date(),
      failureReason: null,
      updatedAt: new Date(),
    })
    .where(eq(walkthroughs.id, walkthroughId));

  const items = await matchableItems(org.id);
  if (!items.length) {
    await failWalkthrough(walkthroughId, "no_price_book");
    return {
      ok: false,
      code: "NO_PRICE_BOOK",
      message:
        "Your price book is empty, so there is nothing to price this job from. Seed a starter book or import your rate sheet, then re-run the draft.",
      walkthroughId,
    };
  }

  // The quota is claimed before any model spend, and capture is never blocked:
  // by the time we are here the audio and photos are already saved.
  const claim = await claimQuote(org);
  if (!claim.ok) {
    await failWalkthrough(walkthroughId, claim.code === "PLAN_LIMIT" ? "plan_limit" : "read_only");
    await audit(org.id, actorId, "draft_blocked", walkthroughId, { code: claim.code });
    return { ok: false, code: claim.code, message: claim.message, walkthroughId };
  }

  await db
    .update(walkthroughs)
    .set({ status: "transcribing", updatedAt: new Date() })
    .where(eq(walkthroughs.id, walkthroughId));

  const audio = complete.filter((media) => media.kind === "audio");
  const chunks: AudioChunk[] = [];
  for (const media of audio.sort((a, b) => a.sequence - b.sequence)) {
    const bytes = transcriptionProvider() === "whisper" ? await getObject(media.storageKey) : null;
    chunks.push({
      bytes: bytes ?? Buffer.alloc(0),
      contentType: media.contentType,
      sequence: media.sequence,
      durationSeconds: audio.length ? durationSeconds / audio.length : durationSeconds,
    });
  }

  const [fresh] = await db.select().from(walkthroughs).where(eq(walkthroughs.id, walkthroughId));
  const transcription = await transcribeWalkthrough({
    trade: found.job.trade,
    chunks,
    notes: fresh?.notes ?? found.walkthrough.notes,
    totalDurationSeconds: durationSeconds,
  });

  if (!transcription.ok) {
    await failWalkthrough(walkthroughId, transcription.failure);
    await audit(org.id, SYSTEM, "walkthrough_failed", walkthroughId, {
      failure: transcription.failure,
    });
    return { ok: false, code: "TRANSCRIPTION", message: transcription.message, walkthroughId };
  }

  const transcript = transcription.transcript;
  await db
    .update(walkthroughs)
    .set({
      status: "drafting",
      transcript: transcript.fullText,
      transcriptSource: transcript.source,
      transcriptConfidence: transcript.overallConfidence,
      updatedAt: new Date(),
    })
    .where(eq(walkthroughs.id, walkthroughId));

  const captions = complete
    .filter((media) => media.kind === "photo" && media.caption)
    .map((media) => media.caption as string);

  const segments = transcript.segments.length
    ? transcript.segments.map((segment, index) => ({
        index,
        startSeconds: segment.startSeconds,
        text: segment.text,
      }))
    : segmentTranscript(transcript.fullText, durationSeconds);

  const draft = await draftEstimate({
    trade: found.job.trade,
    segments,
    photoCaptions: captions,
    items,
    defaultMarkupPct: org.defaultMarkupPct,
    jobTitle: found.job.title,
    address: found.job.address,
  });

  const estimate = await createEstimateFromDraft({
    org,
    job: found.job,
    walkthroughId,
    rows: draft.rows,
    meta: draft.meta,
    scopeSummary: scopeSummaryFrom(draft.rows, found.job.title),
  });

  await db
    .update(walkthroughs)
    .set({ status: "drafted", draftedAt: new Date(), updatedAt: new Date() })
    .where(eq(walkthroughs.id, walkthroughId));
  await audit(org.id, actorId, "walkthrough_completed", walkthroughId, {
    estimateId: estimate.id,
    rows: draft.rows.length,
    needsPricing: draft.needsPricingCount,
    transcriptSource: transcript.source,
    quotesUsed: claim.used,
    quoteLimit: claim.limit,
  });

  return {
    ok: true,
    estimateId: estimate.id,
    walkthroughId,
    degraded: draft.meta.degraded,
    notice: draft.meta.notice,
  };
}

async function failWalkthrough(walkthroughId: string, reason: string): Promise<void> {
  const db = getDb();
  await db
    .update(walkthroughs)
    .set({ status: "failed", failureReason: reason, updatedAt: new Date() })
    .where(eq(walkthroughs.id, walkthroughId));
}

/** Human wording for a failure reason, for the capture and job screens. */
export function describeFailure(reason: string | null): string {
  const map: Record<string, string> = {
    no_audio: "No audio or notes were captured, so there was nothing to draft from.",
    too_short: "The recording was too short to draft from.",
    low_confidence: "The audio was too noisy to price from.",
    unreadable_audio: "Nothing intelligible came back from the recording.",
    api_error: "The transcription service could not be reached.",
    plan_limit: "You are out of AI quotes for this period.",
    read_only: "This account is read-only, so drafting is paused.",
    no_price_book: "Your price book is empty, so there was nothing to price from.",
  };
  return reason ? (map[reason] ?? reason.replace(/_/g, " ")) : "Something went wrong.";
}

/** Quota, for the capture screen's footer. */
export function quotaLine(org: Organization): string {
  const capacity = quoteCapacity(orgAsGatable(org));
  if (capacity.unlimitedish) return "Unlimited AI quotes (fair use)";
  return `${capacity.used} of ${capacity.limit} AI quotes used this period`;
}

/** Walkthroughs left mid-flight — what `npm run worker` picks up. */
export async function stalledWalkthroughs(limit = 20): Promise<Walkthrough[]> {
  const db = getDb();
  return db
    .select()
    .from(walkthroughs)
    .where(inArray(walkthroughs.status, ["uploaded", "transcribing", "drafting"]))
    .orderBy(asc(walkthroughs.updatedAt))
    .limit(limit);
}
