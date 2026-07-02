/**
 * Media processing pipeline worker (BullMQ consumer).
 *
 * Consumes `process-upload` jobs: downloads source media from S3, runs the
 * full repurposing pipeline, writes results back to S3 + Postgres.
 *
 * TODO:
 * - [ ] ffmpeg: extract audio track, normalize loudness
 * - [ ] Whisper transcription with word-level timestamps
 * - [ ] LLM pass 1: identify 5-15 high-engagement clip candidates from transcript
 * - [ ] ffmpeg: cut clips, burn animated captions, export 9:16 + 1:1 + 16:9
 * - [ ] LLM pass 2: generate tweet thread, LinkedIn post, newsletter draft
 * - [ ] progress events -> Postgres so the UI can show a live pipeline view
 * - [ ] failure handling: partial results are kept, job retried from last stage
 */
export interface ProcessUploadJob {
  uploadId: string;
  userId: string;
  sourceKey: string; // S3 key of the raw upload
}
