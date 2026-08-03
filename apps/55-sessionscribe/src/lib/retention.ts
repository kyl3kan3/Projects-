/**
 * src/lib/retention.ts
 *
 * Audio and transcript retention. The signed note is the durable record; the
 * tape is temporary by policy, and the policy is the clinician's to set.
 *
 * Three properties this module is responsible for:
 *
 *  - **Idempotent.** A purge that fails halfway (object store down after two of
 *    five deletions) completes cleanly on the next pass: rows are selected by
 *    `purged_at is null`, and deleting an object that is already gone is a
 *    success.
 *  - **Audited.** One `purged` event per artifact, actor `system`. The row in
 *    `audio_artifacts` survives its bytes, so the audit trail outlives the audio.
 *  - **Irreversible.** Changing the window re-stamps only artifacts that have
 *    not been purged. Nothing here can bring media back, and nothing pretends to.
 *
 * Every time comparison happens in SQL (`purge_at <= now()`), never against a
 * JavaScript `Date`: a Date is millisecond-truncated and a `timestamptz` is not,
 * which is exactly how a sweep ends up finding rows it then never claims.
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  audioArtifacts,
  clients,
  practices,
  sessions,
  transcripts,
  type Practice,
} from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { deleteObject, storageBackend } from "@/lib/storage";

/** When an artifact captured now should be purged for this practice. */
export function purgeAtFor(practice: Pick<Practice, "retentionDays">): Date {
  return new Date(Date.now() + practice.retentionDays * 86_400_000);
}

export interface PurgeResult {
  audioPurged: number;
  transcriptsPurged: number;
  errors: number;
}

/**
 * Purge everything past its window. Called by the tick (nightly on Vercel cron,
 * every poll on a long-lived worker) and by the Trust screen's "purge now".
 */
export async function purgeExpiredArtifacts(
  options: { limit?: number; practiceId?: string } = {},
): Promise<PurgeResult> {
  const db = getDb();
  const limit = options.limit ?? 200;
  const result: PurgeResult = { audioPurged: 0, transcriptsPurged: 0, errors: 0 };

  const audioRows = await db
    .select({
      id: audioArtifacts.id,
      sessionId: audioArtifacts.sessionId,
      storageKey: audioArtifacts.storageKey,
      byteSize: audioArtifacts.byteSize,
      practiceId: practices.id,
      retentionDays: practices.retentionDays,
    })
    .from(audioArtifacts)
    .innerJoin(sessions, eq(sessions.id, audioArtifacts.sessionId))
    .innerJoin(clients, eq(clients.id, sessions.clientId))
    .innerJoin(practices, eq(practices.id, clients.practiceId))
    .where(
      and(
        isNull(audioArtifacts.purgedAt),
        sql`${audioArtifacts.purgeAt} <= now()`,
        options.practiceId ? eq(clients.practiceId, options.practiceId) : undefined,
      ),
    )
    .limit(limit);

  for (const row of audioRows) {
    try {
      if (storageBackend() === "r2") await deleteObject(row.storageKey);
      await db
        .update(audioArtifacts)
        .set({ purgedAt: sql`now()`, bytes: null })
        .where(eq(audioArtifacts.id, row.id));
      result.audioPurged += 1;
      await recordAudit({
        practiceId: row.practiceId,
        actorKind: "system",
        action: "purged",
        targetKind: "audio_artifact",
        targetId: row.id,
        metadata: {
          sessionId: row.sessionId,
          artifact: "audio",
          byteSize: row.byteSize ?? 0,
          retentionDays: row.retentionDays,
        },
      });
    } catch (err) {
      result.errors += 1;
      console.error(`[retention] could not purge audio ${row.id}`, err);
    }
  }

  const transcriptRows = await db
    .select({
      id: transcripts.id,
      sessionId: transcripts.sessionId,
      wordCount: transcripts.wordCount,
      practiceId: practices.id,
      retentionDays: practices.retentionDays,
    })
    .from(transcripts)
    .innerJoin(sessions, eq(sessions.id, transcripts.sessionId))
    .innerJoin(clients, eq(clients.id, sessions.clientId))
    .innerJoin(practices, eq(practices.id, clients.practiceId))
    .where(
      and(
        isNull(transcripts.purgedAt),
        sql`${transcripts.purgeAt} <= now()`,
        options.practiceId ? eq(clients.practiceId, options.practiceId) : undefined,
      ),
    )
    .limit(limit);

  for (const row of transcriptRows) {
    try {
      // The segments are the PHI; the row stays so the audit trail can point at
      // something. An empty array, not a tombstone string — the type is honest.
      await db
        .update(transcripts)
        .set({ purgedAt: sql`now()`, segments: [] })
        .where(eq(transcripts.id, row.id));
      result.transcriptsPurged += 1;
      await recordAudit({
        practiceId: row.practiceId,
        actorKind: "system",
        action: "purged",
        targetKind: "transcript",
        targetId: row.id,
        metadata: {
          sessionId: row.sessionId,
          artifact: "transcript",
          wordCount: row.wordCount,
          retentionDays: row.retentionDays,
        },
      });
    } catch (err) {
      result.errors += 1;
      console.error(`[retention] could not purge transcript ${row.id}`, err);
    }
  }

  return result;
}

/**
 * Change the window.
 *
 * Future `purge_at` values are recomputed from each artifact's own creation time,
 * so shortening the window brings deletions forward and lengthening it pushes
 * them back — for media that still exists. Purged rows are excluded, because
 * there is nothing to reschedule and implying otherwise would be a lie about
 * what the product deleted.
 */
export async function rescheduleRetention(
  practiceId: string,
  retentionDays: number,
  actorId: string,
): Promise<{ audio: number; transcripts: number }> {
  const db = getDb();
  const days = Math.max(1, Math.min(365, Math.floor(retentionDays)));

  await db
    .update(practices)
    .set({ retentionDays: days, updatedAt: new Date() })
    .where(eq(practices.id, practiceId));

  // `make_interval(days => n)` keeps the arithmetic in Postgres; the only value
  // interpolated is a bounded integer.
  const audio = await db
    .update(audioArtifacts)
    .set({ purgeAt: sql`${audioArtifacts.createdAt} + make_interval(days => ${days})` })
    .where(
      and(
        isNull(audioArtifacts.purgedAt),
        sql`${audioArtifacts.sessionId} in (
          select s.id from sessions s
          join clients c on c.id = s.client_id
          where c.practice_id = ${practiceId}
        )`,
      ),
    )
    .returning({ id: audioArtifacts.id });

  const transcriptRows = await db
    .update(transcripts)
    .set({ purgeAt: sql`${transcripts.createdAt} + make_interval(days => ${days})` })
    .where(
      and(
        isNull(transcripts.purgedAt),
        sql`${transcripts.sessionId} in (
          select s.id from sessions s
          join clients c on c.id = s.client_id
          where c.practice_id = ${practiceId}
        )`,
      ),
    )
    .returning({ id: transcripts.id });

  await recordAudit({
    practiceId,
    actorId,
    action: "settings_changed",
    targetKind: "practice",
    targetId: practiceId,
    metadata: {
      retentionDays: days,
      count: audio.length + transcriptRows.length,
      reason: "retention_window",
    },
  });

  return { audio: audio.length, transcripts: transcriptRows.length };
}

/** Artifacts due within a day — the number the Trust screen shows. */
export async function dueSoonCount(practiceId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(audioArtifacts)
    .where(
      and(
        isNull(audioArtifacts.purgedAt),
        sql`${audioArtifacts.purgeAt} <= now() + interval '1 day'`,
        sql`${audioArtifacts.sessionId} in (
          select s.id from sessions s
          join clients c on c.id = s.client_id
          where c.practice_id = ${practiceId}
        )`,
      ),
    );
  return row?.n ?? 0;
}
