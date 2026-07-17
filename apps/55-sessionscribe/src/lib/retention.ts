/**
 * src/lib/retention.ts
 *
 * Audio/transcript retention: purge_at stamping and the nightly purge.
 * The signed note is the durable record; the tape is temporary by policy.
 *
 * TODO:
 * - [ ] purgeAtFor(practice): now + practice.retention_days.
 * - [ ] purgeExpiredArtifacts(): find audio_artifacts/transcripts past
 *       purge_at and not yet purged; delete from R2; stamp purged_at;
 *       write one audit event per purge (actor: system). Idempotent —
 *       a re-run after a partial failure completes cleanly.
 * - [ ] rescheduleRetention(): when a practice changes retention_days,
 *       re-stamp future purge_at values only; never resurrect purged media.
 * - [ ] Purged renders: helper for the UI's "source audio purged per your
 *       30-day retention policy" line.
 */

export async function purgeExpiredArtifacts(): Promise<{
  audioPurged: number;
  transcriptsPurged: number;
}> {
  // TODO: implement per ARCHITECTURE.md key flow 3
  throw new Error("Not implemented");
}
