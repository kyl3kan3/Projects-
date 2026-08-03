/**
 * src/lib/transcription.ts
 *
 * ASR boundary. Everything Deepgram-specific lives here, behind one function,
 * so the provider is swappable — and so the *rest* of the pipeline can be tested
 * without a provider at all.
 *
 * Two implementations:
 *
 *  - **deepgram** — Nova with diarization and word timestamps, under a BAA. The
 *    millisecond offsets it returns are what makes source tracing possible.
 *  - **fixture** — a deterministic, clearly-fictional session transcript, used
 *    automatically when `DEEPGRAM_API_KEY` is unset.
 *
 * The fixture is not a silent stand-in. It writes `provider = "fixture"` on the
 * transcript row, and every screen that renders a fixture-derived transcript or
 * note says so in plain language (`src/lib/honesty.ts`, enforced by a test). A
 * demo that looked like a real clinical draft of a real session would be the one
 * unforgivable dishonesty in a product like this.
 */

import { env, asrConfigured } from "@/lib/env";
import type { Modality } from "@/db/schema";

export type TranscriptSegment = {
  speaker: number;
  startMs: number;
  endMs: number;
  text: string;
};

export interface TranscriptionResult {
  provider: string;
  segments: TranscriptSegment[];
  wordCount: number;
  durationSeconds: number;
  /** True when the segments are fixture text rather than this audio. */
  fixture: boolean;
}

/** Terminal: the audio itself is the problem, retrying will not help. */
export class UnreadableAudioError extends Error {
  readonly terminal = true;
}

/** Retryable: the provider failed, the audio is probably fine. */
export class TranscriptionProviderError extends Error {
  readonly terminal = false;
}

export interface TranscribeInput {
  audio: Buffer;
  mime: string;
  /** Steers which fixture dialogue is used; ignored by the real provider. */
  modality: Modality;
  /** Known duration, when the client measured it. */
  durationSeconds?: number | null;
}

export async function transcribe(
  input: TranscribeInput,
): Promise<TranscriptionResult> {
  if (input.audio.byteLength < 1024) {
    throw new UnreadableAudioError(
      "the audio file is empty or truncated — re-upload it, or write shorthand instead",
    );
  }
  return asrConfigured() ? transcribeWithDeepgram(input) : fixtureTranscript(input);
}

/* --------------------------------------------------------------- deepgram */

/**
 * The real call. Unexercised in this environment (no Deepgram credential), and
 * written to fail loudly rather than fall back to the fixture: a provider error
 * that quietly produced fictional segments would be indefensible.
 */
async function transcribeWithDeepgram(
  input: TranscribeInput,
): Promise<TranscriptionResult> {
  const { createClient } = await import("@deepgram/sdk");
  const client = createClient(env.deepgramApiKey);

  let result: Awaited<
    ReturnType<typeof client.listen.prerecorded.transcribeFile>
  >;
  try {
    result = await client.listen.prerecorded.transcribeFile(input.audio, {
      model: "nova-2",
      diarize: true,
      punctuate: true,
      smart_format: true,
      utterances: true,
      language: "en-US",
      mimetype: input.mime,
    });
  } catch (err) {
    throw new TranscriptionProviderError(
      `transcription provider error: ${err instanceof Error ? err.message : "unknown"}`,
    );
  }

  if (result.error) {
    throw new TranscriptionProviderError(
      `transcription provider error: ${result.error.message ?? "unknown"}`,
    );
  }

  const utterances = result.result?.results?.utterances ?? [];
  if (utterances.length === 0) {
    throw new UnreadableAudioError(
      "no speech was found in the audio — check the microphone or write shorthand instead",
    );
  }

  const segments = normalizeSpeakers(
    utterances.map((u) => ({
      speaker: u.speaker ?? 0,
      startMs: Math.round((u.start ?? 0) * 1000),
      endMs: Math.round((u.end ?? 0) * 1000),
      text: (u.transcript ?? "").trim(),
    })).filter((s) => s.text.length > 0),
  );

  return {
    provider: "deepgram",
    segments,
    wordCount: countWords(segments),
    durationSeconds:
      Math.round(result.result?.metadata?.duration ?? 0) ||
      input.durationSeconds ||
      estimateDuration(input.audio.byteLength),
    fixture: false,
  };
}

/**
 * Speaker 0 should be the clinician.
 *
 * Deepgram numbers speakers by first appearance, which in a therapy session is
 * arbitrary. The heuristic is talk time: across a fifty-minute hour the client
 * speaks more than the clinician. It is a heuristic and the UI says so — the
 * transcript pane labels the roles as "assumed", because a mislabelled speaker
 * in a chart is worse than an unlabelled one.
 */
export function normalizeSpeakers(segments: TranscriptSegment[]): TranscriptSegment[] {
  const talk = new Map<number, number>();
  for (const s of segments) {
    talk.set(s.speaker, (talk.get(s.speaker) ?? 0) + (s.endMs - s.startMs));
  }
  if (talk.size < 2) return segments;
  const ordered = [...talk.entries()].sort((a, b) => a[1] - b[1]).map(([k]) => k);
  const remap = new Map(ordered.map((old, i) => [old, i]));
  return segments.map((s) => ({ ...s, speaker: remap.get(s.speaker) ?? s.speaker }));
}

function countWords(segments: TranscriptSegment[]): number {
  return segments.reduce(
    (n, s) => n + s.text.trim().split(/\s+/).filter(Boolean).length,
    0,
  );
}

/** ~1 minute of speech per 240KB at typical webm/opus rates. Rough, and only used
 *  when neither the client nor the provider reported a duration. */
function estimateDuration(bytes: number): number {
  return Math.max(60, Math.round((bytes / 240_000) * 60));
}

/* ---------------------------------------------------------------- fixture */

/**
 * Fixture dialogues, one per MVP modality. Written as plausible clinical
 * exchanges with obviously fictional client labels, because DESIGN.md forbids
 * placeholder text and because a drafting pipeline tested against lorem ipsum
 * proves nothing about a drafting pipeline.
 */
const FIXTURES: Record<string, { speaker: number; text: string }[]> = {
  general: [
    { speaker: 0, text: "Good to see you. How has the week been since we last met?" },
    { speaker: 1, text: "Honestly, mixed. Monday and Tuesday were fine, and then Wednesday I had the review with my manager and it knocked me sideways." },
    { speaker: 0, text: "Knocked you sideways how?" },
    { speaker: 1, text: "I couldn't sleep after it. I was up until two, maybe three, going over everything I said. My chest was tight the whole next day." },
    { speaker: 0, text: "So sleep dropped off, and the physical symptoms came back with it. Where would you put the anxiety at its worst, on that nought to ten scale we've been using?" },
    { speaker: 1, text: "Thursday morning it was an eight. It's about a four now, sitting here." },
    { speaker: 0, text: "And the breathing practice we set up last session — were you able to use it at all?" },
    { speaker: 1, text: "Twice. It helped the second time. The first time I gave up after about thirty seconds because I felt like it wasn't working fast enough." },
    { speaker: 0, text: "That's useful information rather than a failure. Thirty seconds is about when it feels worse before it feels better." },
    { speaker: 1, text: "That's reassuring, actually. I thought I was doing it wrong." },
    { speaker: 0, text: "You weren't. Let's look at what the review actually said, because I noticed you moved straight to what you might have said badly." },
    { speaker: 1, text: "She said the work was strong and that I needed to speak up more in the planning meetings. That's it. That's the whole thing." },
    { speaker: 0, text: "And the two nights of lost sleep were about the second half of that sentence." },
    { speaker: 1, text: "When you say it like that it sounds ridiculous." },
    { speaker: 0, text: "Not ridiculous — familiar. It's the same pattern we mapped in the first few sessions. For this week, would you be willing to keep the thought record when the chest tightness starts, rather than after?" },
    { speaker: 1, text: "I can do that. And I'll try the breathing for the full two minutes before I judge it." },
    { speaker: 0, text: "Good. Same time next week, and we'll look at the planning meeting specifically." },
  ],
  cbt: [
    { speaker: 0, text: "Last week you took home the exposure hierarchy. How far up the list did you get?" },
    { speaker: 1, text: "I did step three twice — driving to the shopping centre and sitting in the car park without going in." },
    { speaker: 0, text: "And the anxiety while you were sitting there?" },
    { speaker: 1, text: "It started at a seven. After about ten minutes it came down to a four, which surprised me. I stayed twenty minutes both times." },
    { speaker: 0, text: "That drop is the whole point of the exercise. What went through your mind at the seven?" },
    { speaker: 1, text: "That I'd have a panic attack in the car and nobody would notice, and I'd be stuck there." },
    { speaker: 0, text: "Let's put that on a thought record. What's the evidence that you'd be stuck?" },
    { speaker: 1, text: "There isn't any, really. I've never actually been unable to drive home. I've felt like I couldn't, but I always have." },
    { speaker: 0, text: "So the prediction has been tested about how many times now?" },
    { speaker: 1, text: "Dozens. It's never once come true." },
    { speaker: 0, text: "What's a more balanced version of that thought, in your own words?" },
    { speaker: 1, text: "Something like — this feels unbearable but it passes, and I've always driven home." },
    { speaker: 0, text: "Hold onto that phrasing. For homework, I'd like step four: park and walk to the entrance without going in. Twice this week, with a thought record each time." },
    { speaker: 1, text: "Twice feels doable. I'll do Tuesday and Saturday." },
    { speaker: 0, text: "And rate the anxiety at the start, at ten minutes, and when you leave." },
  ],
  emdr: [
    { speaker: 0, text: "Before we start any processing — how has the week been for containment?" },
    { speaker: 1, text: "Better than last time. I used the container exercise twice and it worked. No nightmares since Tuesday." },
    { speaker: 0, text: "Good. We were working the memory of the accident, with the negative cognition 'I'm not safe'. Is that still where you'd like to work today?" },
    { speaker: 1, text: "Yes. It's still the one that comes up." },
    { speaker: 0, text: "Bringing up the image, the words 'I'm not safe', and noticing where you feel it — where are the SUDs right now, nought to ten?" },
    { speaker: 1, text: "Seven. It's in my throat and my hands." },
    { speaker: 0, text: "And the positive cognition we identified, 'I am safe now' — how true does that feel, one to seven?" },
    { speaker: 1, text: "Two. Maybe a three." },
    { speaker: 0, text: "Follow my fingers. Just notice whatever comes." },
    { speaker: 1, text: "I keep seeing the headlights. And then it shifts — I'm on the pavement afterwards and someone's asking if I'm alright." },
    { speaker: 0, text: "Go with that." },
    { speaker: 1, text: "It's quieter now. The person on the pavement is clearer than the headlights." },
    { speaker: 0, text: "And the SUDs now?" },
    { speaker: 1, text: "Four. It dropped when the pavement came in." },
    { speaker: 0, text: "We'll do two more sets and then check again." },
    { speaker: 1, text: "Okay." },
    { speaker: 0, text: "Where are the SUDs after those sets?" },
    { speaker: 1, text: "Two. And 'I am safe now' feels like a five." },
    { speaker: 0, text: "We're close to the end of our time, so this target is incomplete and we'll return to it. Let's install what we have and do the container exercise before you leave." },
    { speaker: 1, text: "That's fine. I feel steadier than when I came in." },
    { speaker: 0, text: "Body scan first — anywhere still holding it?" },
    { speaker: 1, text: "My hands are fine now. Throat's a little tight but much less." },
  ],
  couples: [
    { speaker: 0, text: "Let's start with the week. What happened after our last session?" },
    { speaker: 1, text: "We had the argument about the weekend on Friday and didn't speak properly until Sunday." },
    { speaker: 2, text: "That's not how I'd put it. I asked a question about the plans and got a lecture, so I stopped asking." },
    { speaker: 0, text: "So one of you experienced Friday as an argument, and one of you experienced it as a lecture followed by silence." },
    { speaker: 1, text: "I don't think I lectured. I explained why I'd already booked it." },
    { speaker: 2, text: "For twenty minutes." },
    { speaker: 0, text: "I want to slow this down, because I think we're in the pattern right now. When the explaining gets longer, what happens for you?" },
    { speaker: 2, text: "I go quiet. There's no point once it's got to that stage." },
    { speaker: 0, text: "And when the quiet arrives, what happens for you?" },
    { speaker: 1, text: "I explain more. Because I think if I can just make it clear enough we'll be alright." },
    { speaker: 0, text: "So one of you pursues by explaining, and the other withdraws by going quiet, and each move makes the other one stronger. That's the cycle, and neither of you invented it on Friday." },
    { speaker: 2, text: "I did try to come back to it on Saturday morning." },
    { speaker: 1, text: "You did. I was still angry and I didn't take it." },
    { speaker: 0, text: "That's a repair attempt, and it's worth naming that it was made and that it didn't land. Those are the moments we want more of." },
    { speaker: 2, text: "It felt like it just bounced off." },
    { speaker: 0, text: "This week I'd like a twenty-minute structured conversation, once, about the calendar and nothing else — with a rule that either of you can call a pause." },
    { speaker: 1, text: "We can try Wednesday evening." },
    { speaker: 2, text: "Wednesday works. I'd rather have the rule than not." },
  ],
};

const FIXTURE_ALIASES: Record<string, string> = {
  general: "general",
  cbt: "cbt",
  emdr: "emdr",
  couples: "couples",
  play: "general",
  sfbt: "general",
};

/**
 * A deterministic transcript, timed across the session's real duration so the
 * span offsets the review room highlights land somewhere plausible.
 */
export function fixtureTranscript(input: TranscribeInput): TranscriptionResult {
  const key = FIXTURE_ALIASES[input.modality] ?? "general";
  const lines = FIXTURES[key];
  const duration =
    input.durationSeconds && input.durationSeconds > 60
      ? input.durationSeconds
      : estimateDuration(input.audio.byteLength);
  const totalMs = duration * 1000;
  // Weight each line's airtime by its length, so a long reply occupies more of
  // the tape than a two-word one.
  const weights = lines.map((l) => Math.max(20, l.text.length));
  const weightTotal = weights.reduce((a, b) => a + b, 0);
  let cursor = 0;
  const segments: TranscriptSegment[] = lines.map((line, i) => {
    const span = Math.round((weights[i] / weightTotal) * totalMs);
    const startMs = cursor;
    cursor += span;
    return {
      speaker: line.speaker,
      startMs,
      endMs: Math.max(startMs + 1000, cursor - 400),
      text: line.text,
    };
  });

  return {
    provider: "fixture",
    segments,
    wordCount: countWords(segments),
    durationSeconds: duration,
    fixture: true,
  };
}
