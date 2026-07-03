/**
 * Transcription via OpenAI Whisper (verbose_json → word-level timestamps).
 *
 * Whisper's API caps uploads at 25MB, so the worker extracts a compressed
 * mono audio track before calling this; if the resulting file is still large,
 * we chunk by time and stitch the word lists back together with offsets.
 */

import OpenAI from "openai";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { env } from "@/lib/env";
import type { TranscriptWord } from "@/db/schema";

let _client: OpenAI | null = null;
function openai(): OpenAI {
  if (!_client) _client = new OpenAI({ apiKey: env.openaiApiKey });
  return _client;
}

export interface TranscriptResult {
  language: string | undefined;
  fullText: string;
  words: TranscriptWord[];
  costCents: number;
}

const WHISPER_CENTS_PER_MINUTE = 0.6; // $0.006/min

/**
 * Transcribe a single audio file (must be <25MB). `offsetSec` shifts all
 * timestamps for chunked transcription.
 */
export async function transcribeFile(
  audioPath: string,
  offsetSec = 0,
): Promise<TranscriptResult> {
  const info = await stat(audioPath);
  if (info.size > 25 * 1024 * 1024) {
    throw new Error(
      `Audio chunk ${audioPath} is ${info.size} bytes; must be <25MB. Chunk first.`,
    );
  }

  const res = await openai().audio.transcriptions.create({
    file: createReadStream(audioPath),
    model: "whisper-1",
    response_format: "verbose_json",
    timestamp_granularities: ["word"],
  });

  const words: TranscriptWord[] =
    (res.words ?? []).map((w) => ({
      word: w.word,
      start: w.start + offsetSec,
      end: w.end + offsetSec,
    })) ?? [];

  const durationMin = (res.duration ?? 0) / 60;
  return {
    language: res.language,
    fullText: res.text,
    words,
    costCents: Math.ceil(durationMin * WHISPER_CENTS_PER_MINUTE),
  };
}

/** Merge chunked results into one transcript. */
export function mergeTranscripts(parts: TranscriptResult[]): TranscriptResult {
  return {
    language: parts[0]?.language,
    fullText: parts.map((p) => p.fullText).join(" ").trim(),
    words: parts.flatMap((p) => p.words),
    costCents: parts.reduce((n, p) => n + p.costCents, 0),
  };
}
