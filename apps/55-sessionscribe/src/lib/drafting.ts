/**
 * src/lib/drafting.ts
 *
 * The drafting boundary: transcript (or typed shorthand) in, structured note
 * sections out, one section at a time so a weak section can be regenerated
 * without touching the clinician's edits elsewhere.
 *
 * Two implementations behind one function, chosen by whether a key is present:
 *
 *  - **Anthropic** (`claude-sonnet-5` by default) — one call per section, the
 *    template's own guidance as the instruction, and a tool schema so the model
 *    returns sentences with cited transcript spans rather than prose we then have
 *    to parse. Output is zod-validated and every cited span is checked against
 *    the real transcript; a span that points at nothing is dropped and its
 *    sentence is marked unsourced. **This path is unexercised in this
 *    environment — there is no API key here.**
 *  - **fixture** — deterministic and *extractive*: it quotes the transcript
 *    instead of composing from it, so its citations are true by construction.
 *    Labelled everywhere it appears (see src/lib/honesty.ts).
 *
 * Three rules the whole module exists to enforce:
 *
 *  1. **A parse failure is never a confident answer.** If the model returns
 *     something that does not validate, the section fails and the session says
 *     so. There is no "best effort" path that keeps half a sentence.
 *  2. **A citation is checked, not trusted.** Models hallucinate offsets as
 *     readily as facts. Spans that do not overlap a real segment are discarded.
 *  3. **Shorthand cites nothing and is flagged for nothing.** There is no tape,
 *     so there is nothing to trace — that is a property of the capture, not a
 *     defect in the draft.
 *
 * No `temperature` is sent: current Claude models reject non-default sampling
 * parameters outright. Conservatism comes from the prompt and from the schema.
 */

import { z } from "zod";
import { env, llmConfigured } from "@/lib/env";
import type {
  Modality,
  NoteFormat,
  NoteSection,
  SourceSpan,
  TemplateSection,
} from "@/db/schema";
import type { TranscriptSegment } from "@/lib/transcription";
import { splitSentences } from "@/lib/trace";
import { unionSpans } from "@/lib/trace";

/** The model's draft of one section, before it becomes a NoteSection. */
export interface DraftedSection extends NoteSection {
  sentences: { text: string; sourceSpans: SourceSpan[] }[];
}

export interface DraftInput {
  sections: TemplateSection[];
  format: NoteFormat;
  modality: Modality;
  /** Empty for a shorthand capture. */
  segments: TranscriptSegment[];
  shorthandText?: string | null;
  durationMinutes?: number | null;
  /** Restrict to these section keys (per-section regeneration). */
  onlyKeys?: string[];
}

export interface DraftResult {
  sections: DraftedSection[];
  model: string;
  fixture: boolean;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
}

/** The model returned something we could not trust. Retryable, then terminal. */
export class DraftValidationError extends Error {
  readonly terminal = false;
}

/* ----------------------------------------------------------------- pricing */

/** $ per million tokens, for the per-note COGS telemetry. */
const PRICES: Record<string, { inPerMTok: number; outPerMTok: number }> = {
  "claude-opus-5": { inPerMTok: 5, outPerMTok: 25 },
  "claude-sonnet-5": { inPerMTok: 3, outPerMTok: 15 },
  "claude-haiku-4-5": { inPerMTok: 1, outPerMTok: 5 },
};

export function costMicrosFor(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = PRICES[model];
  if (!price) return 0;
  const dollars =
    (inputTokens / 1_000_000) * price.inPerMTok +
    (outputTokens / 1_000_000) * price.outPerMTok;
  return Math.round(dollars * 1_000_000);
}

/* ------------------------------------------------------------------ prompt */

const SYSTEM_PROMPT = `You are drafting one section of a clinical progress note for a licensed psychotherapist, who will review, edit and sign it. You are not the author of record.

Rules, in order of importance:
1. Write only what the session material supports. Never infer a diagnosis, a risk level, a medication, or a client history detail that is not in the material.
2. Cite your sources. Every sentence you produce must list the transcript spans (start and end offsets in milliseconds) it came from. If a sentence cannot be traced to a span, do not write it.
3. Write in the clinician's register: third person, past tense, specific, unhedged where the material is clear and explicitly uncertain where it is not.
4. Never invent numbers. Ratings, SUDs, VOC values and durations appear only if the material states them. If the section's guidance asks for a value the session did not record, say plainly that it was not recorded.
5. Stay inside this section. Do not restate other sections' content.`;

const SHORTHAND_SYSTEM_PROMPT = `You are expanding a psychotherapist's own shorthand notes into one section of a clinical progress note, which they will review, edit and sign. You are not the author of record.

Rules, in order of importance:
1. Expand only what the shorthand says. Do not add clinical content the clinician did not write, and never invent a rating, a diagnosis, a risk statement, or a history detail.
2. There is no recording, so cite nothing.
3. Write in the clinician's register: third person, past tense, specific.
4. If the section's guidance asks for something the shorthand does not cover, say plainly that it was not recorded this session.
5. Stay inside this section.`;

/** The transcript as the model sees it: offsets first, so citation is easy. */
export function renderTranscript(segments: TranscriptSegment[]): string {
  return segments
    .map(
      (s) =>
        `[${s.startMs}-${s.endMs}] ${s.speaker === 0 ? "CLINICIAN" : `CLIENT${s.speaker > 1 ? ` ${s.speaker}` : ""}`}: ${s.text}`,
    )
    .join("\n");
}

export function buildSectionPrompt(
  input: DraftInput,
  section: TemplateSection,
): { system: string; user: string } {
  const modalityLine = `Modality: ${input.modality.toUpperCase()}. Format: ${input.format.toUpperCase()}.`;
  const duration = input.durationMinutes
    ? `Session length: ${input.durationMinutes} minutes.`
    : "";
  if (input.segments.length === 0) {
    return {
      system: SHORTHAND_SYSTEM_PROMPT,
      user: [
        modalityLine,
        duration,
        `Section: ${section.label.toUpperCase()}`,
        `Guidance for this section: ${section.guidance}`,
        "",
        "The clinician's shorthand:",
        (input.shorthandText ?? "").trim(),
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }
  return {
    system: SYSTEM_PROMPT,
    user: [
      modalityLine,
      duration,
      `Section: ${section.label.toUpperCase()}`,
      `Guidance for this section: ${section.guidance}`,
      "",
      "Transcript (offsets in milliseconds; speaker labels are provider-assigned and may be wrong):",
      renderTranscript(input.segments),
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/* --------------------------------------------------------------- validation */

const spanSchema = z.object({
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
});

const sectionOutputSchema = z.object({
  sentences: z
    .array(
      z.object({
        text: z.string().trim().min(1),
        spans: z.array(spanSchema).default([]),
      }),
    )
    .min(1),
});

export type SectionOutput = z.infer<typeof sectionOutputSchema>;

/** The tool schema the model fills in. Structure enforced at the API boundary. */
const SECTION_TOOL = {
  name: "record_section",
  description:
    "Record the drafted section, sentence by sentence, with the transcript spans each sentence came from.",
  input_schema: {
    type: "object" as const,
    properties: {
      sentences: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          properties: {
            text: {
              type: "string",
              description: "One complete sentence of the drafted section.",
            },
            spans: {
              type: "array",
              description:
                "Transcript spans this sentence came from. Empty only when there is no transcript.",
              items: {
                type: "object",
                properties: {
                  startMs: { type: "integer" },
                  endMs: { type: "integer" },
                },
                required: ["startMs", "endMs"],
                additionalProperties: false,
              },
            },
          },
          required: ["text", "spans"],
          additionalProperties: false,
        },
      },
    },
    required: ["sentences"],
    additionalProperties: false,
  },
};

/**
 * Turn raw model output into a section, checking every claim it makes about the
 * tape. A span survives only if it overlaps a real segment; a sentence whose
 * spans all fail keeps its text and loses its citation, which the review room
 * renders as UNSOURCED.
 */
export function validateSection(
  raw: unknown,
  section: TemplateSection,
  segments: TranscriptSegment[],
): DraftedSection {
  const parsed = sectionOutputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new DraftValidationError(
      `the model's ${section.label} section did not match the expected shape`,
    );
  }

  const hasTranscript = segments.length > 0;
  const sentences = parsed.data.sentences.map((s) => {
    const spans = hasTranscript
      ? s.spans
          .map((span) => ({
            startMs: Math.min(span.startMs, span.endMs),
            endMs: Math.max(span.startMs, span.endMs),
          }))
          .filter((span) =>
            segments.some(
              (seg) => seg.startMs < span.endMs && span.startMs < seg.endMs,
            ),
          )
      : [];
    return { text: s.text.trim(), sourceSpans: spans };
  });

  const text = sentences.map((s) => s.text).join(" ");
  return {
    key: section.key,
    text,
    sourceSpans: unionSpans(sentences.flatMap((s) => s.sourceSpans)),
    sentences,
  };
}

/* ------------------------------------------------------------------- draft */

export async function draftSections(input: DraftInput): Promise<DraftResult> {
  const wanted = input.onlyKeys
    ? input.sections.filter((s) => input.onlyKeys!.includes(s.key))
    : input.sections;
  if (wanted.length === 0) {
    throw new DraftValidationError("no sections were requested");
  }
  return llmConfigured()
    ? draftWithAnthropic({ ...input, sections: wanted })
    : fixtureDraft({ ...input, sections: wanted });
}

async function draftWithAnthropic(input: DraftInput): Promise<DraftResult> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: env.anthropicApiKey });
  const model = env.draftModel;

  const sections: DraftedSection[] = [];
  let inputTokens = 0;
  let outputTokens = 0;

  for (const section of input.sections) {
    const { system, user } = buildSectionPrompt(input, section);
    let response;
    try {
      response = await client.messages.create({
        model,
        max_tokens: 2000,
        system,
        tools: [SECTION_TOOL],
        tool_choice: { type: "tool", name: SECTION_TOOL.name },
        messages: [{ role: "user", content: user }],
      });
    } catch (err) {
      throw new DraftValidationError(
        `the drafting provider failed on ${section.label}: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    }

    inputTokens += response.usage?.input_tokens ?? 0;
    outputTokens += response.usage?.output_tokens ?? 0;

    const toolUse = response.content.find(
      (block): block is Extract<typeof block, { type: "tool_use" }> =>
        block.type === "tool_use",
    );
    if (!toolUse) {
      // A refusal or a plain-text answer both land here. Neither is a draft.
      throw new DraftValidationError(
        `the model did not return a ${section.label} section — regenerate, or write shorthand instead`,
      );
    }
    sections.push(validateSection(toolUse.input, section, input.segments));
  }

  return {
    sections,
    model,
    fixture: false,
    inputTokens,
    outputTokens,
    costMicros: costMicrosFor(model, inputTokens, outputTokens),
  };
}

/* ----------------------------------------------------------------- fixture */

/** Section-relevance keywords. Crude on purpose: it is a demo drafter. */
const SECTION_KEYWORDS: Record<string, string[]> = {
  subjective: ["week", "felt", "feel", "sleep", "i was", "i had", "honestly", "worse", "better"],
  data: ["week", "felt", "feel", "sleep", "rated", "suds", "i was", "i had"],
  objective: [
    "scale",
    "rate",
    "suds",
    "voc",
    "practice",
    "exercise",
    "record",
    "hierarchy",
    "sets",
    "follow my fingers",
    "body scan",
    "container",
    "pattern",
    "cycle",
    "repair",
  ],
  assessment: [
    "pattern",
    "familiar",
    "progress",
    "dropped",
    "came down",
    "surprised",
    "incomplete",
    "evidence",
    "prediction",
    "cycle",
  ],
  plan: [
    "homework",
    "next week",
    "this week",
    "for homework",
    "i'd like",
    "would you be willing",
    "same time",
    "before you leave",
    "we'll",
  ],
};

const LEAD_IN: Record<string, (speakerIsClinician: boolean) => string> = {
  subjective: (c) => (c ? "In response to the clinician's question" : "Client reported"),
  data: (c) => (c ? "Clinician noted" : "Client reported"),
  objective: (c) => (c ? "Clinician" : "Client"),
  assessment: (c) => (c ? "Clinical observation in session" : "Client's own account"),
  plan: (c) => (c ? "Agreed next step" : "Client agreed"),
};

function matchesSection(text: string, key: string): boolean {
  const keywords = SECTION_KEYWORDS[key] ?? [];
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k));
}

/**
 * The built-in drafter: extractive quotation with real spans.
 *
 * Deterministic (same session, same draft), honest by construction (it cannot
 * cite what it did not quote), and labelled wherever it is rendered. It exists
 * so the pipeline, the review room, the tracing and the signing gate can all be
 * exercised end to end without a model credential — not to imitate one.
 */
export function fixtureDraft(input: DraftInput): DraftResult {
  const sections: DraftedSection[] = input.sections.map((section, index) => {
    if (input.segments.length === 0) {
      return fixtureShorthandSection(section, input.shorthandText ?? "", index, input.sections.length);
    }
    const relevant = input.segments.filter((s) => matchesSection(s.text, section.key));
    // Nothing matched: take an even slice of the session so the section is never
    // silently empty. A blank section in a chart is worse than a rough one.
    const chosen = (relevant.length >= 2 ? relevant : evenSlice(input.segments, index, input.sections.length))
      .slice(0, 3);

    const sentences = chosen.map((seg) => {
      const clinician = seg.speaker === 0;
      const lead = (LEAD_IN[section.key] ?? LEAD_IN.data)(clinician);
      const quote = seg.text.replace(/\s+/g, " ").trim();
      return {
        text: `${lead}: "${quote}"`,
        sourceSpans: [{ startMs: seg.startMs, endMs: seg.endMs }],
      };
    });

    const ratings = extractRatings(chosen);
    if (ratings.length > 0) {
      sentences.push({
        text: `Ratings recorded this session: ${ratings.map((r) => r.label).join("; ")}.`,
        sourceSpans: ratings.map((r) => r.span),
      });
    }

    return {
      key: section.key,
      text: sentences.map((s) => s.text).join(" "),
      sourceSpans: unionSpans(sentences.flatMap((s) => s.sourceSpans)),
      sentences,
    };
  });

  return {
    sections,
    model: "fixture-extractive/1",
    fixture: true,
    inputTokens: 0,
    outputTokens: 0,
    costMicros: 0,
  };
}

function evenSlice(
  segments: TranscriptSegment[],
  index: number,
  total: number,
): TranscriptSegment[] {
  const size = Math.max(1, Math.ceil(segments.length / total));
  const start = Math.min(index * size, Math.max(0, segments.length - size));
  return segments.slice(start, start + size);
}

/** "8/10", "SUDs seven", "a five" next to a VOC mention. Spans preserved. */
function extractRatings(
  segments: TranscriptSegment[],
): { label: string; span: SourceSpan }[] {
  const out: { label: string; span: SourceSpan }[] = [];
  for (const seg of segments) {
    const numeric = seg.text.match(/\b(\d{1,2})\s*(?:\/|out of)\s*(7|10)\b/i);
    if (numeric) {
      out.push({
        label: `${numeric[1]}/${numeric[2]}`,
        span: { startMs: seg.startMs, endMs: seg.endMs },
      });
      continue;
    }
    const suds = seg.text.match(/\bSUDs?\b[^.]*?\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\b/i);
    if (suds) {
      out.push({
        label: `SUDs ${suds[1].toLowerCase()}`,
        span: { startMs: seg.startMs, endMs: seg.endMs },
      });
    }
  }
  return out;
}

/**
 * Shorthand has no tape, so the fixture drafter distributes the clinician's own
 * sentences across the template's sections and cites nothing. It never adds
 * clinical content — the words are the clinician's.
 */
function fixtureShorthandSection(
  section: TemplateSection,
  shorthand: string,
  index: number,
  total: number,
): DraftedSection {
  const parts = splitSentences(shorthand.replace(/\s*[;\n]+\s*/g, ". "));
  const chunk = parts.length
    ? evenSliceStrings(parts, index, total)
    : [];
  const sentences = chunk.map((text) => ({
    text: text.endsWith(".") ? text : `${text}.`,
    sourceSpans: [] as SourceSpan[],
  }));
  if (sentences.length === 0) {
    sentences.push({
      text: `Not recorded in the clinician's shorthand for this session; complete before signing.`,
      sourceSpans: [],
    });
  }
  return {
    key: section.key,
    text: sentences.map((s) => s.text).join(" "),
    sourceSpans: [],
    sentences,
  };
}

function evenSliceStrings(items: string[], index: number, total: number): string[] {
  const size = Math.max(1, Math.ceil(items.length / total));
  const start = Math.min(index * size, Math.max(0, items.length - 1));
  return items.slice(start, start + size);
}
