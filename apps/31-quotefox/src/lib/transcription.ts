/**
 * Whisper transcription for walkthrough audio.
 *
 * Two providers behind one function, chosen by whether OPENAI_API_KEY is set:
 *
 *  - **whisper** — the real call, one per audio chunk (pause/resume produces
 *    several), stitched in sequence order with the chunk offsets carried onto the
 *    segment timings so a drafted row can cite "02:14 in the walkthrough". Trade
 *    vocabulary is fed in as the `prompt` bias, because a general transcriber
 *    writes "seer two" and "AFCI" as "sear two" and "AFC I".
 *  - **demo_fixture** — used when there is no key. It does **not** pretend to have
 *    heard the audio: it returns the tech's typed notes plus a clearly-labelled
 *    sample narration for the trade, and marks the transcript
 *    `transcriptSource = "demo_fixture"` so the walkthrough screen, the estimate
 *    and the audit log all say where the words came from.
 *
 * The failure taxonomy is deliberate. Jobsite audio is genuinely bad — attics,
 * wind, compressors — and a transcript nobody can read must fail loudly, because
 * a garbage transcript produces a confident garbage estimate.
 */

import { env, has } from "@/lib/env";
import { DEMO_NARRATION, TRADE_VOCABULARY } from "@/lib/trades";
import type { Trade, TranscriptSource } from "@/db/schema";

export interface TranscriptSegment {
  startSeconds: number;
  endSeconds: number;
  text: string;
  /** 0–1. Whisper reports avg_logprob / no_speech_prob; we fold both into this. */
  confidence: number;
}

export interface WalkthroughTranscript {
  segments: TranscriptSegment[];
  fullText: string;
  /** 0–100, stored on the walkthrough row. */
  overallConfidence: number;
  source: TranscriptSource;
  audioSeconds: number;
}

export type TranscriptionFailure =
  | "no_audio"
  | "too_short"
  | "low_confidence"
  | "api_error"
  | "unreadable_audio";

export type TranscriptionResult =
  | { ok: true; transcript: WalkthroughTranscript }
  | { ok: false; failure: TranscriptionFailure; message: string };

export interface AudioChunk {
  /** Bytes of one recorded chunk, in capture order. */
  bytes: Buffer;
  contentType: string;
  sequence: number;
  /** Recorded length, used to offset the next chunk's segment timings. */
  durationSeconds: number;
}

export interface TranscribeInput {
  trade: Trade;
  chunks: AudioChunk[];
  /** Typed notes from the capture screen. Always part of the transcript. */
  notes?: string | null;
  totalDurationSeconds: number;
}

/** Below this, the transcript is not worth drafting from. */
export const CONFIDENCE_FLOOR = 55;

export function transcriptionProvider(): "whisper" | "demo_fixture" {
  return has("OPENAI_API_KEY") ? "whisper" : "demo_fixture";
}

/* --------------------------------------------------------------- helpers --- */

function notesSegments(notes: string | null | undefined): TranscriptSegment[] {
  const text = (notes ?? "").trim();
  if (!text) return [];
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ startSeconds: 0, endSeconds: 0, text: line, confidence: 1 }));
}

function stitch(
  segments: TranscriptSegment[],
  source: TranscriptSource,
  audioSeconds: number,
): WalkthroughTranscript {
  const fullText = segments
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join(" ");
  const weighted = segments.reduce(
    (acc, segment) => {
      const weight = Math.max(1, segment.text.length);
      return { sum: acc.sum + segment.confidence * weight, weight: acc.weight + weight };
    },
    { sum: 0, weight: 0 },
  );
  const overallConfidence = weighted.weight
    ? Math.round((weighted.sum / weighted.weight) * 100)
    : 0;
  return { segments, fullText, overallConfidence, source, audioSeconds };
}

/* ------------------------------------------------------------- the fixture --- */

function demoTranscript(input: TranscribeInput): WalkthroughTranscript {
  const notes = notesSegments(input.notes);
  const narration = DEMO_NARRATION[input.trade] ?? DEMO_NARRATION.other;
  const sentences = narration
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const total = Math.max(input.totalDurationSeconds, sentences.length * 6);
  const per = total / Math.max(1, sentences.length);
  const segments: TranscriptSegment[] = sentences.map((text, i) => ({
    startSeconds: Math.round(i * per),
    endSeconds: Math.round((i + 1) * per),
    text,
    confidence: 0.92,
  }));
  // Typed notes come first: they are the contractor's actual words.
  return stitch([...notes, ...segments], "demo_fixture", input.totalDurationSeconds);
}

/* ---------------------------------------------------------------- whisper --- */

interface WhisperSegment {
  start?: number;
  end?: number;
  text?: string;
  avg_logprob?: number;
  no_speech_prob?: number;
}

/**
 * Whisper's avg_logprob is a log probability (roughly −1.5 … 0) and
 * no_speech_prob is a probability. Fold them into one 0–1 confidence, clamped:
 * a segment the model itself thinks is probably not speech should drag the
 * transcript below the floor rather than being averaged away.
 */
function segmentConfidence(segment: WhisperSegment): number {
  const logprob = typeof segment.avg_logprob === "number" ? segment.avg_logprob : -0.4;
  const noSpeech = typeof segment.no_speech_prob === "number" ? segment.no_speech_prob : 0;
  const fromLogprob = Math.min(1, Math.max(0, 1 + logprob / 1.5));
  return Math.min(1, Math.max(0, fromLogprob * (1 - noSpeech)));
}

async function whisperTranscript(input: TranscribeInput): Promise<TranscriptionResult> {
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: env.openaiApiKey });
  const prompt = (TRADE_VOCABULARY[input.trade] ?? []).join(", ");

  const segments: TranscriptSegment[] = [];
  let offset = 0;
  for (const chunk of [...input.chunks].sort((a, b) => a.sequence - b.sequence)) {
    try {
      const file = new File([new Uint8Array(chunk.bytes)], `chunk-${chunk.sequence}.webm`, {
        type: chunk.contentType,
      });
      const response = (await client.audio.transcriptions.create({
        file,
        model: env.transcribeModel,
        prompt,
        response_format: "verbose_json",
      })) as unknown as { text?: string; segments?: WhisperSegment[]; duration?: number };

      const chunkSegments = response.segments ?? [];
      if (chunkSegments.length) {
        for (const segment of chunkSegments) {
          const text = (segment.text ?? "").trim();
          if (!text) continue;
          segments.push({
            startSeconds: Math.round(offset + (segment.start ?? 0)),
            endSeconds: Math.round(offset + (segment.end ?? 0)),
            text,
            confidence: segmentConfidence(segment),
          });
        }
      } else if (response.text?.trim()) {
        segments.push({
          startSeconds: Math.round(offset),
          endSeconds: Math.round(offset + chunk.durationSeconds),
          text: response.text.trim(),
          confidence: 0.8,
        });
      }
      offset += Number(response.duration ?? chunk.durationSeconds) || chunk.durationSeconds;
    } catch (err) {
      return {
        ok: false,
        failure: "api_error",
        message: err instanceof Error ? err.message : "Transcription failed",
      };
    }
  }

  const all = [...notesSegments(input.notes), ...segments];
  if (!all.length) {
    return {
      ok: false,
      failure: "unreadable_audio",
      message:
        "Nothing intelligible came back from the recording. Add photo captions or notes, or re-record closer to the equipment.",
    };
  }
  const transcript = stitch(all, "whisper", input.totalDurationSeconds);
  if (transcript.overallConfidence < CONFIDENCE_FLOOR) {
    return {
      ok: false,
      failure: "low_confidence",
      message: `The audio came back at ${transcript.overallConfidence}% confidence — too noisy to price from. Re-record away from the equipment, or type the scope in notes.`,
    };
  }
  return { ok: true, transcript };
}

/* ------------------------------------------------------------------ entry --- */

/**
 * Transcribe one walkthrough. Never throws: every failure is a typed result the
 * UI turns into a re-run or "write it manually" choice.
 */
export async function transcribeWalkthrough(
  input: TranscribeInput,
): Promise<TranscriptionResult> {
  const hasNotes = Boolean((input.notes ?? "").trim());
  if (!input.chunks.length && !hasNotes) {
    return {
      ok: false,
      failure: "no_audio",
      message:
        "This walkthrough has no audio and no notes, so there is nothing to draft from. Record a pass or type the scope.",
    };
  }
  if (input.chunks.length && input.totalDurationSeconds < 5 && !hasNotes) {
    return {
      ok: false,
      failure: "too_short",
      message: "That recording is under five seconds. Walk the job and narrate what you see.",
    };
  }

  if (transcriptionProvider() === "demo_fixture") {
    return { ok: true, transcript: demoTranscript(input) };
  }
  return whisperTranscript(input);
}

// The citation formatter is pure and shared with client components.
export { formatOffset } from "@/lib/item-fields";
