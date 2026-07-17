/**
 * src/lib/transcription.ts
 *
 * ASR boundary: everything Deepgram-specific lives here so the provider is
 * swappable. Consumes audio from R2, produces diarized, millisecond-offset
 * segments — the offsets power source-traceable drafting in the review room.
 *
 * TODO:
 * - [ ] transcribeAudio(): stream the R2 object to Deepgram (Nova, BAA'd)
 *       with diarization + word timestamps; map to TranscriptSegment[].
 * - [ ] Normalize speaker labels (0 = clinician heuristic via talk-time,
 *       overridable later).
 * - [ ] Stamp purge_at from the practice's retention window on persist.
 * - [ ] DRY_RUN=1 returns a fixture transcript, never calls the API.
 * - [ ] Errors: distinguish unreadable-audio (terminal, user-facing reason)
 *       from provider errors (retryable).
 */

import type { transcripts } from "@/db/schema";

export type TranscriptSegment = {
  speaker: number;
  startMs: number;
  endMs: number;
  text: string;
};

/**
 * Transcribe a session's audio artifact and persist the transcript row.
 * Called only from the worker (`transcribe-session` job).
 */
export async function transcribeAudio(
  _sessionId: string,
): Promise<typeof transcripts.$inferSelect> {
  // TODO: implement per ARCHITECTURE.md key flow 1
  throw new Error("Not implemented");
}
