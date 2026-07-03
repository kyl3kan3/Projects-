/**
 * LLM layer — clip selection and grounded copy generation via the Claude API.
 *
 * Both calls force JSON output through a tool schema and validate with zod, so
 * the pipeline never has to parse free-form model text. Copy is generated with
 * mandatory transcript citations to kill the "generic AI slop" objection.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { env } from "@/lib/env";
import type { TranscriptWord } from "@/db/schema";

let _client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!_client) _client = new Anthropic({ apiKey: env.anthropicApiKey });
  return _client;
}

// ---------- Clip selection ----------

const candidateSchema = z.object({
  title: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  hookScore: z.number().int().min(0).max(100),
  selfContainmentScore: z.number().int().min(0).max(100),
  rationale: z.string(),
  transcriptExcerpt: z.string(),
});
const candidatesSchema = z.object({ clips: z.array(candidateSchema) });
export type SelectedClip = z.infer<typeof candidateSchema>;

const SELECTION_TOOL: Anthropic.Tool = {
  name: "return_clips",
  description: "Return the selected clip candidates as structured data.",
  input_schema: {
    type: "object",
    properties: {
      clips: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Punchy 3–7 word title" },
            startMs: { type: "integer", description: "Clip start in ms" },
            endMs: { type: "integer", description: "Clip end in ms" },
            hookScore: { type: "integer" },
            selfContainmentScore: { type: "integer" },
            rationale: { type: "string" },
            transcriptExcerpt: { type: "string" },
          },
          required: [
            "title",
            "startMs",
            "endMs",
            "hookScore",
            "selfContainmentScore",
            "rationale",
            "transcriptExcerpt",
          ],
        },
      },
    },
    required: ["clips"],
  },
};

/** Compact the word list into a timestamped transcript the model can reason over. */
export function renderTimedTranscript(words: TranscriptWord[]): string {
  // Group into ~5s lines with a leading [mm:ss] stamp to keep tokens reasonable.
  const lines: string[] = [];
  let bucketStart = words[0]?.start ?? 0;
  let buf: string[] = [];
  for (const w of words) {
    if (w.start - bucketStart >= 5 && buf.length) {
      lines.push(`[${fmt(bucketStart)}] ${buf.join(" ")}`);
      buf = [];
      bucketStart = w.start;
    }
    buf.push(w.word);
  }
  if (buf.length) lines.push(`[${fmt(bucketStart)}] ${buf.join(" ")}`);
  return lines.join("\n");
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export async function selectClips(
  words: TranscriptWord[],
  opts: { maxClips?: number } = {},
): Promise<SelectedClip[]> {
  const maxClips = opts.maxClips ?? 8;
  const transcript = renderTimedTranscript(words);

  const res = await anthropic().messages.create({
    model: env.selectionModel,
    max_tokens: 4000,
    tools: [SELECTION_TOOL],
    tool_choice: { type: "tool", name: "return_clips" },
    messages: [
      {
        role: "user",
        content: `You are a senior short-form video editor. From the transcript below, pick the ${maxClips} best standalone clip moments for TikTok/Reels/Shorts.

Selection criteria, in priority order:
1. HOOK: opens with tension, a bold claim, a surprising number, or a question. First 2 seconds must stop the scroll.
2. SELF-CONTAINMENT: understandable with zero prior context; a complete thought with a beginning and payoff.
3. QUOTABILITY: contains a line worth sharing.

Rules:
- Each clip must be 15–75 seconds long.
- startMs/endMs must fall on natural sentence boundaries within the transcript's time range.
- Score hookScore and selfContainmentScore 0–100 honestly; do not inflate.
- transcriptExcerpt must be the actual words spoken in that window (verbatim).
- Return clips ranked best-first.

Transcript (timestamps are [m:ss]):
${transcript}`,
      },
    ],
  });

  const tool = res.content.find(
    (c): c is Anthropic.ToolUseBlock => c.type === "tool_use",
  );
  if (!tool) throw new Error("Claude did not return clip selection");
  const parsed = candidatesSchema.parse(tool.input);
  return parsed.clips
    .filter((c) => c.endMs > c.startMs)
    .slice(0, maxClips);
}

// ---------- Copy generation ----------

const citationSchema = z.object({
  quote: z.string(),
  timestampMs: z.number().int().nonnegative(),
});
const copySchema = z.object({
  tweetThread: z.object({
    tweets: z.array(z.string()).min(3),
    citations: z.array(citationSchema),
  }),
  linkedinNarrative: z.object({
    body: z.string(),
    citations: z.array(citationSchema),
  }),
  linkedinListicle: z.object({
    body: z.string(),
    citations: z.array(citationSchema),
  }),
  newsletter: z.object({
    markdown: z.string(),
    citations: z.array(citationSchema),
  }),
});
export type GeneratedCopy = z.infer<typeof copySchema>;

const COPY_TOOL: Anthropic.Tool = {
  name: "return_copy",
  description: "Return all repurposed text assets as structured data.",
  input_schema: {
    type: "object",
    properties: {
      tweetThread: {
        type: "object",
        properties: {
          tweets: { type: "array", items: { type: "string" } },
          citations: { type: "array", items: citationJson() },
        },
        required: ["tweets", "citations"],
      },
      linkedinNarrative: linkedinJson(),
      linkedinListicle: linkedinJson(),
      newsletter: {
        type: "object",
        properties: {
          markdown: { type: "string" },
          citations: { type: "array", items: citationJson() },
        },
        required: ["markdown", "citations"],
      },
    },
    required: ["tweetThread", "linkedinNarrative", "linkedinListicle", "newsletter"],
  },
};

function citationJson() {
  return {
    type: "object" as const,
    properties: {
      quote: { type: "string" as const },
      timestampMs: { type: "integer" as const },
    },
    required: ["quote", "timestampMs"],
  };
}
function linkedinJson() {
  return {
    type: "object" as const,
    properties: {
      body: { type: "string" as const },
      citations: { type: "array" as const, items: citationJson() },
    },
    required: ["body", "citations"],
  };
}

export async function generateCopy(
  words: TranscriptWord[],
): Promise<{ copy: GeneratedCopy; tokensUsed: number }> {
  const transcript = renderTimedTranscript(words);

  const res = await anthropic().messages.create({
    model: env.selectionModel,
    max_tokens: 4000,
    tools: [COPY_TOOL],
    tool_choice: { type: "tool", name: "return_copy" },
    messages: [
      {
        role: "user",
        content: `You are a B2B content writer. From the podcast/video transcript below, produce repurposed written assets. EVERY asset must be grounded in what was actually said — include a citations array of real verbatim quotes (with their timestampMs) that back the claims. Do not invent facts or quotes.

Produce:
1. tweetThread: a hook tweet + 5–8 body tweets. The hook must earn the click; each tweet ≤ 270 chars; no hashtags spam.
2. linkedinNarrative: a first-person story-shaped LinkedIn post (~120–180 words) with line breaks.
3. linkedinListicle: a scannable "N lessons/takeaways" LinkedIn post.
4. newsletter: a 300–500 word markdown section with a heading and at least one blockquote pull-quote.

Transcript (timestamps [m:ss]):
${transcript}`,
      },
    ],
  });

  const tool = res.content.find(
    (c): c is Anthropic.ToolUseBlock => c.type === "tool_use",
  );
  if (!tool) throw new Error("Claude did not return copy");
  const copy = copySchema.parse(tool.input);
  const tokensUsed = res.usage.input_tokens + res.usage.output_tokens;
  return { copy, tokensUsed };
}
