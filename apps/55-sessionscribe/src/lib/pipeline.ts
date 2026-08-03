/**
 * src/lib/pipeline.ts
 *
 * The capture → transcript → draft pipeline, as a bounded pass over a Postgres
 * work ledger.
 *
 * **Why not BullMQ.** ARCHITECTURE.md specifies BullMQ on Redis with standalone
 * worker processes. The deployment target has no always-on process, and — more
 * to the point — the "queue" here would carry one field, a session id, whose
 * status column already says what needs doing. So the ledger *is* the sessions
 * table: `status` is the stage, `attempts` is the retry budget, `lease_until` is
 * the claim. That survives a Redis flush, cannot drift from the rows it
 * describes, and is inspectable with a SELECT when a clinician asks why a note
 * has not appeared.
 *
 * The same function is driven three ways, and none of them assumes the others ran:
 *
 *  - **inline after capture** (`after()` in the capture route) — the 3:00 → 3:02
 *    promise, without making the clinician wait for the response;
 *  - **`npm run worker`** — polls every few seconds on a host that has one;
 *  - **`/api/cron/tick`** — the serverless safety net, daily on Hobby cron.
 *
 * Every time comparison is made by Postgres (`lease_until < now()`), never
 * against a JS `Date`: a millisecond-truncated Date loses to a microsecond
 * `timestamptz`, and the failure mode is a row that looks due forever and is
 * never claimed.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  audioArtifacts,
  clients,
  notes,
  noteVersions,
  practices,
  sessions,
  templates,
  transcripts,
  users,
  type Session,
} from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { draftSections, DraftValidationError } from "@/lib/drafting";
import { draftReadyEmail, sendEmail } from "@/lib/email";
import { getObject, storageBackend } from "@/lib/storage";
import {
  transcribe,
  UnreadableAudioError,
  type TranscriptSegment,
} from "@/lib/transcription";
import { purgeAtFor, purgeExpiredArtifacts } from "@/lib/retention";
import { incrementUsage } from "@/lib/usage";

/** Attempts before a session is marked failed with a human-readable reason. */
export const MAX_ATTEMPTS = 3;
/** How long a claim is held. Long enough for a 50-minute file through ASR. */
const LEASE_MINUTES = 5;

export interface TickOptions {
  /** Stop claiming new work after this much wall clock. */
  budgetMs?: number;
  /** Maximum sessions per pass. */
  limit?: number;
  /** Restrict to these sessions — used by the inline kick after a capture. */
  sessionIds?: string[];
  skipPurge?: boolean;
}

export interface TickResult {
  claimed: number;
  transcribed: number;
  drafted: number;
  failed: number;
  audioPurged: number;
  transcriptsPurged: number;
  budgetHit: boolean;
  ms: number;
}

const WORKABLE = ["captured", "transcribing", "drafting"] as const;

export async function runPipelineTick(
  options: TickOptions = {},
): Promise<TickResult> {
  const started = Date.now();
  const budgetMs = options.budgetMs ?? 50_000;
  const limit = options.limit ?? 5;
  const result: TickResult = {
    claimed: 0,
    transcribed: 0,
    drafted: 0,
    failed: 0,
    audioPurged: 0,
    transcriptsPurged: 0,
    budgetHit: false,
    ms: 0,
  };

  while (Date.now() - started < budgetMs) {
    const claimed = await claimSessions(limit, options.sessionIds);
    if (claimed.length === 0) break;
    result.claimed += claimed.length;

    for (const session of claimed) {
      if (Date.now() - started >= budgetMs) {
        result.budgetHit = true;
        await releaseLease(session.id);
        break;
      }
      try {
        const advanced = await advanceSession(session);
        if (advanced.transcribed) result.transcribed += 1;
        if (advanced.drafted) result.drafted += 1;
      } catch (err) {
        const failed = await handleFailure(session, err);
        if (failed) result.failed += 1;
      }
    }
    // A targeted kick works exactly one session; do not spin.
    if (options.sessionIds) break;
  }

  if (!options.skipPurge) {
    const purged = await purgeExpiredArtifacts();
    result.audioPurged = purged.audioPurged;
    result.transcriptsPurged = purged.transcriptsPurged;
  }

  result.ms = Date.now() - started;
  return result;
}

/**
 * Claim work.
 *
 * `for update skip locked` means two runners (a worker and a cron pass) can run
 * at the same instant without both taking the same session; the lease means a
 * runner that dies mid-job releases its claim by expiry rather than wedging the
 * row forever.
 */
async function claimSessions(
  limit: number,
  sessionIds?: string[],
): Promise<Session[]> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const candidates = await tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          inArray(sessions.status, [...WORKABLE]),
          sql`(${sessions.leaseUntil} is null or ${sessions.leaseUntil} < now())`,
          sessionIds?.length ? inArray(sessions.id, sessionIds) : undefined,
        ),
      )
      .orderBy(sessions.heldAt)
      .limit(limit)
      .for("update", { skipLocked: true });

    if (candidates.length === 0) return [];

    return tx
      .update(sessions)
      .set({
        leaseUntil: sql`now() + make_interval(mins => ${LEASE_MINUTES})`,
        attempts: sql`${sessions.attempts} + 1`,
        updatedAt: new Date(),
      })
      .where(
        inArray(
          sessions.id,
          candidates.map((c) => c.id),
        ),
      )
      .returning();
  });
}

async function releaseLease(sessionId: string): Promise<void> {
  await getDb()
    .update(sessions)
    .set({ leaseUntil: null, attempts: sql`greatest(${sessions.attempts} - 1, 0)` })
    .where(eq(sessions.id, sessionId));
}

interface AdvanceResult {
  transcribed: boolean;
  drafted: boolean;
}

/**
 * Move one session as far as it can go this pass: transcribe if it has audio and
 * no transcript, then draft. Written to be resumable — a session that died after
 * transcription picks up at drafting, because the work already done is in the
 * database rather than in a job payload.
 */
async function advanceSession(session: Session): Promise<AdvanceResult> {
  const db = getDb();
  const out: AdvanceResult = { transcribed: false, drafted: false };

  const [ctx] = await db
    .select({
      client: clients,
      practice: practices,
      note: notes,
      template: templates,
    })
    .from(sessions)
    .innerJoin(clients, eq(clients.id, sessions.clientId))
    .innerJoin(practices, eq(practices.id, clients.practiceId))
    .innerJoin(notes, eq(notes.sessionId, sessions.id))
    .innerJoin(templates, eq(templates.id, notes.templateId))
    .where(eq(sessions.id, session.id));
  if (!ctx) throw new Error("session is missing its note or client");

  let segments: TranscriptSegment[] = [];

  if (session.captureKind !== "shorthand") {
    const [existing] = await db
      .select()
      .from(transcripts)
      .where(eq(transcripts.sessionId, session.id))
      .limit(1);

    if (existing && !existing.purgedAt) {
      segments = existing.segments;
    } else if (existing?.purgedAt) {
      // The tape went before the draft did. Nothing to do but say so.
      throw new UnreadableAudioError(
        "the transcript was purged before the draft was written — write shorthand for this session",
      );
    } else {
      await db
        .update(sessions)
        .set({ status: "transcribing", updatedAt: new Date() })
        .where(eq(sessions.id, session.id));

      const [artifact] = await db
        .select()
        .from(audioArtifacts)
        .where(eq(audioArtifacts.sessionId, session.id))
        .limit(1);
      if (!artifact) {
        throw new UnreadableAudioError(
          "no audio was uploaded for this session — re-record, or write shorthand instead",
        );
      }
      if (artifact.purgedAt) {
        throw new UnreadableAudioError(
          "the audio was purged before it could be transcribed — write shorthand for this session",
        );
      }

      const audio =
        storageBackend() === "r2"
          ? await getObject(artifact.storageKey)
          : artifact.bytes
            ? Buffer.from(artifact.bytes)
            : null;
      if (!audio) {
        throw new UnreadableAudioError(
          "the audio upload did not complete — re-record, or write shorthand instead",
        );
      }

      const transcription = await transcribe({
        audio,
        mime: artifact.mime,
        modality: ctx.client.modality,
        durationSeconds: artifact.durationSeconds,
      });

      await db.insert(transcripts).values({
        sessionId: session.id,
        provider: transcription.provider,
        segments: transcription.segments,
        wordCount: transcription.wordCount,
        purgeAt: purgeAtFor(ctx.practice),
      });
      if (!artifact.durationSeconds && transcription.durationSeconds) {
        await db
          .update(audioArtifacts)
          .set({ durationSeconds: transcription.durationSeconds })
          .where(eq(audioArtifacts.id, artifact.id));
        await db
          .update(sessions)
          .set({
            durationMinutes: Math.max(
              1,
              Math.round(transcription.durationSeconds / 60),
            ),
          })
          .where(eq(sessions.id, session.id));
      }

      segments = transcription.segments;
      out.transcribed = true;

      await recordAudit({
        practiceId: ctx.practice.id,
        actorKind: "system",
        action: "created",
        targetKind: "transcript",
        targetId: session.id,
        metadata: {
          sessionId: session.id,
          provider: transcription.provider,
          fixture: transcription.fixture,
          wordCount: transcription.wordCount,
        },
      });
    }
  }

  await db
    .update(sessions)
    .set({ status: "drafting", updatedAt: new Date() })
    .where(eq(sessions.id, session.id));

  const draft = await draftSections({
    sections: ctx.template.sections,
    format: ctx.note.format,
    modality: ctx.template.modality,
    segments,
    shorthandText: session.shorthandText,
    durationMinutes: session.durationMinutes,
  });

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(notes)
      .set({
        sections: draft.sections,
        status: "draft",
        model: draft.model,
        draftGeneratedAt: now,
        currentVersion: 1,
        inputTokens: draft.inputTokens,
        outputTokens: draft.outputTokens,
        costMicros: draft.costMicros,
        updatedAt: now,
      })
      .where(eq(notes.id, ctx.note.id));

    // Version 1 is the pristine machine draft, kept immutably so an audit can
    // always compare what the model wrote against what the clinician signed.
    await tx
      .insert(noteVersions)
      .values({
        noteId: ctx.note.id,
        version: 1,
        sections: draft.sections,
        reason: "draft",
        createdBy: null,
      })
      .onConflictDoNothing();

    await tx
      .update(sessions)
      .set({
        status: "ready",
        failureReason: null,
        leaseUntil: null,
        updatedAt: now,
      })
      .where(eq(sessions.id, session.id));
  });

  await incrementUsage(ctx.practice.id, ctx.practice.timezone, now);
  out.drafted = true;

  const traced = draft.sections.reduce(
    (n, s) => n + (s.sentences?.filter((x) => x.sourceSpans.length > 0).length ?? 0),
    0,
  );
  const untraced = draft.sections.reduce(
    (n, s) => n + (s.sentences?.filter((x) => x.sourceSpans.length === 0).length ?? 0),
    0,
  );

  await recordAudit({
    practiceId: ctx.practice.id,
    actorKind: "system",
    action: "drafted",
    targetKind: "note",
    targetId: ctx.note.id,
    metadata: {
      sessionId: session.id,
      model: draft.model,
      fixture: draft.fixture,
      sectionCount: draft.sections.length,
      tracedSentences: traced,
      untracedSentences: untraced,
      costMicros: draft.costMicros,
      inputTokens: draft.inputTokens,
      outputTokens: draft.outputTokens,
    },
  });

  if (ctx.practice.settings?.notifyOnDraftReady !== false) {
    const [clinician] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, ctx.note.clinicianId))
      .limit(1);
    if (clinician?.email) await sendEmail(draftReadyEmail(clinician.email, 1));
  }

  return out;
}

/**
 * Retry with backoff, then fail loudly.
 *
 * A terminal error (unreadable audio) fails immediately — retrying a corrupt
 * file three times just delays the clinician learning about it. Everything else
 * gets the remaining attempts with a widening lease, and the final failure
 * carries a reason written for the clinician, not for a log.
 */
async function handleFailure(session: Session, err: unknown): Promise<boolean> {
  const db = getDb();
  const terminal =
    err instanceof UnreadableAudioError ||
    (err instanceof DraftValidationError && session.attempts >= MAX_ATTEMPTS);
  const reason =
    err instanceof Error ? err.message : "the pipeline failed for an unknown reason";

  if (terminal || session.attempts >= MAX_ATTEMPTS) {
    await db
      .update(sessions)
      .set({
        status: "failed",
        failureReason: reason,
        leaseUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, session.id));

    const [ctx] = await db
      .select({ practiceId: clients.practiceId })
      .from(sessions)
      .innerJoin(clients, eq(clients.id, sessions.clientId))
      .where(eq(sessions.id, session.id));
    if (ctx) {
      await recordAudit({
        practiceId: ctx.practiceId,
        actorKind: "system",
        action: "failed",
        targetKind: "session",
        targetId: session.id,
        metadata: { attempt: session.attempts, reason },
      });
    }
    console.error(`[pipeline] session ${session.id} failed terminally: ${reason}`);
    return true;
  }

  // Not terminal: hold the row back with exponential-ish backoff.
  const backoffMinutes = Math.min(30, 2 ** session.attempts);
  await db
    .update(sessions)
    .set({
      leaseUntil: sql`now() + make_interval(mins => ${backoffMinutes})`,
      updatedAt: new Date(),
    })
    .where(eq(sessions.id, session.id));
  console.warn(
    `[pipeline] session ${session.id} attempt ${session.attempts} failed, retrying in ${backoffMinutes}m: ${reason}`,
  );
  return false;
}

/** Sessions still in flight for a practice — the Today view's live indicator. */
export async function inFlightCount(practiceId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(sessions)
    .innerJoin(clients, eq(clients.id, sessions.clientId))
    .where(and(eq(clients.practiceId, practiceId), inArray(sessions.status, [...WORKABLE])));
  return row?.n ?? 0;
}
