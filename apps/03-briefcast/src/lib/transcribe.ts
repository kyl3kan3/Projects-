/**
 * Transcription via Deepgram nova (primary). Returns diarized segments the
 * worker persists. Whisper fallback is a post-MVP swap behind the same shape.
 */

import { createClient } from "@deepgram/sdk";
import { env } from "@/lib/env";

export interface Segment {
  idx: number;
  speakerLabel: string;
  startMs: number;
  endMs: number;
  text: string;
}

export interface TranscriptionResult {
  segments: Segment[];
  durationSeconds: number;
  wordCount: number;
  language: string;
}

export async function transcribeUrl(mediaUrl: string): Promise<TranscriptionResult> {
  const dg = createClient(env.deepgramApiKey);
  const { result, error } = await dg.listen.prerecorded.transcribeUrl(
    { url: mediaUrl },
    { model: "nova-2", diarize: true, punctuate: true, paragraphs: true, utterances: true },
  );
  if (error) throw new Error(`Deepgram: ${error}`);

  const utterances = result?.results?.utterances ?? [];
  const segments: Segment[] = utterances.map((u, i) => ({
    idx: i,
    speakerLabel: `Speaker ${u.speaker ?? 0}`,
    startMs: Math.round((u.start ?? 0) * 1000),
    endMs: Math.round((u.end ?? 0) * 1000),
    text: u.transcript ?? "",
  }));

  const durationSeconds = Math.round(result?.metadata?.duration ?? 0);
  const wordCount = segments.reduce((n, s) => n + s.text.split(/\s+/).filter(Boolean).length, 0);

  return { segments, durationSeconds, wordCount, language: "en" };
}
