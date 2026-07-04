/**
 * src/lib/transcription.ts
 *
 * Whisper transcription for walkthrough audio. Handles chunked recordings
 * (pause/resume produces multiple files), stitching, and quality signals
 * so unusable jobsite audio fails loudly instead of producing garbage drafts.
 *
 * TODO:
 * - [ ] transcribeWalkthrough(walkthroughId): fetch audio chunks from R2 in
 *       sequence order, call Whisper per chunk, stitch with timestamps.
 * - [ ] Confidence scoring: flag segments below threshold; overall
 *       transcript_confidence stored on the walkthrough row.
 * - [ ] Trade vocabulary prompt bias (Whisper `prompt` param): "condenser,
 *       AFCI, flashing, PEX, SEER2" etc. per org trade.
 * - [ ] Failure taxonomy: no_audio | too_short | low_confidence | api_error,
 *       stored as walkthroughs.failure_reason.
 * - [ ] DRY_RUN mode returns a canned fixture transcript for local dev.
 * - [ ] Cost accounting: record audio minutes per org for COGS metrics.
 */

export interface TranscriptSegment {
  startSeconds: number;
  endSeconds: number;
  text: string;
  confidence: number;
}

export interface WalkthroughTranscript {
  segments: TranscriptSegment[];
  fullText: string;
  overallConfidence: number;
}

export function transcribeWalkthrough(
  _walkthroughId: string,
): Promise<WalkthroughTranscript> {
  throw new Error("Not implemented");
}
