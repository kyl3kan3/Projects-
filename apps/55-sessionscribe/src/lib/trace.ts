/**
 * src/lib/trace.ts
 *
 * Source tracing: which sentence of a draft came from which part of the tape.
 *
 * Pure functions, no database — the review room is a client component and this
 * is the logic behind its highlights, in both directions.
 *
 * The honesty rules encoded here, which are the whole point of the module:
 *
 *  - A sentence the model cited spans for is **traced**.
 *  - A sentence the model produced with no citation is **unsourced**, and the UI
 *    flags it. Silently keeping it would be the exact failure mode README risk 2
 *    is about: a plausible clinical detail with nothing behind it.
 *  - A sentence that no longer matches the drafting-time map is **clinician**
 *    text — the therapist wrote or rewrote it. That is not a defect and is never
 *    flagged as one, but the product also must not claim a source for it.
 *  - When there is no transcript at all (a shorthand session), sentences are
 *    **no-transcript**: nothing to cite, nothing to flag. Shorthand is a
 *    first-class path, not a degraded one.
 */

import type { NoteSection, SourceSpan } from "@/db/schema";

export type TraceKind = "traced" | "unsourced" | "clinician" | "no-transcript";

export interface TracedSentence {
  /** Index within the section, 0-based. */
  index: number;
  text: string;
  spans: SourceSpan[];
  kind: TraceKind;
}

/** Sentence-splitter tuned for clinical prose. */
const ABBREVIATIONS = new Set([
  "dr",
  "mr",
  "mrs",
  "ms",
  "e.g",
  "i.e",
  "vs",
  "approx",
  "no",
  "hrs",
  "ph",
]);

/**
 * Split a paragraph into sentences.
 *
 * Clinical text is full of things a naive `split(".")` mangles: "4/10", "SUDs
 * 7 -> 2.", "Dr. Alvarez", "45 min." Splitting on terminal punctuation followed
 * by whitespace and a capital letter or digit, then rejoining fragments that end
 * in a known abbreviation, gets those right without a parser.
 */
export function splitSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const rough = trimmed.split(/(?<=[.!?])\s+(?=["'(]?[A-Z0-9])/);
  const out: string[] = [];
  for (const piece of rough) {
    const prev = out[out.length - 1];
    const lastWord = prev
      ?.replace(/["')\]]+$/, "")
      .split(/\s+/)
      .pop()
      ?.replace(/\.$/, "")
      .toLowerCase();
    if (prev && lastWord && ABBREVIATIONS.has(lastWord)) {
      out[out.length - 1] = `${prev} ${piece}`;
    } else {
      out.push(piece);
    }
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

/** Comparison key: whitespace collapsed, case folded, edge punctuation dropped. */
export function normalizeSentence(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[\s"'(\[]+|[\s"')\].,;:!?]+$/g, "")
    .trim();
}

export interface TraceOptions {
  /** False for shorthand sessions and for purged transcripts. */
  hasTranscript: boolean;
}

/**
 * The section's current text, sentence by sentence, each labelled with where it
 * came from. The clinician's live edits are respected: the working copy is the
 * source of truth for *what* the note says, and the drafting map only decides
 * what may claim a source.
 */
export function traceSection(
  section: NoteSection,
  opts: TraceOptions,
): TracedSentence[] {
  const sentences = splitSentences(section.text);
  if (!opts.hasTranscript) {
    return sentences.map((text, index) => ({
      index,
      text,
      spans: [],
      kind: "no-transcript" as TraceKind,
    }));
  }
  const map = new Map<string, SourceSpan[]>();
  for (const entry of section.sentences ?? []) {
    map.set(normalizeSentence(entry.text), entry.sourceSpans ?? []);
  }
  return sentences.map((text, index) => {
    const key = normalizeSentence(text);
    if (!map.has(key)) {
      return { index, text, spans: [], kind: "clinician" as TraceKind };
    }
    const spans = map.get(key) ?? [];
    return {
      index,
      text,
      spans,
      kind: (spans.length > 0 ? "traced" : "unsourced") as TraceKind,
    };
  });
}

export interface Coverage {
  sentences: number;
  traced: number;
  unsourced: number;
  clinician: number;
  /** True when at least one model sentence has no source — the review flag. */
  hasUnsourced: boolean;
}

export function coverage(
  sections: NoteSection[],
  opts: TraceOptions,
): Coverage {
  const all = sections.flatMap((s) => traceSection(s, opts));
  const count = (kind: TraceKind) => all.filter((s) => s.kind === kind).length;
  const unsourced = count("unsourced");
  return {
    sentences: all.length,
    traced: count("traced"),
    unsourced,
    clinician: count("clinician"),
    hasUnsourced: unsourced > 0,
  };
}

/* ------------------------------------------------------- span <-> segment */

export interface SegmentLike {
  startMs: number;
  endMs: number;
}

/** Do a transcript segment and a cited span overlap at all? */
export function overlaps(segment: SegmentLike, span: SourceSpan): boolean {
  return segment.startMs < span.endMs && span.startMs < segment.endMs;
}

/** Indices of the transcript segments a set of spans points at. */
export function segmentsForSpans(
  segments: SegmentLike[],
  spans: SourceSpan[],
): number[] {
  if (spans.length === 0) return [];
  const hits: number[] = [];
  segments.forEach((segment, i) => {
    if (spans.some((span) => overlaps(segment, span))) hits.push(i);
  });
  return hits;
}

/**
 * The reverse direction: for one transcript segment, which drafted sentences
 * cite it. Keyed by `${sectionKey}:${sentenceIndex}` so the note pane can find
 * them without a second pass.
 */
export function sentencesForSegment(
  sections: NoteSection[],
  segment: SegmentLike,
  opts: TraceOptions,
): string[] {
  const keys: string[] = [];
  for (const section of sections) {
    for (const sentence of traceSection(section, opts)) {
      if (sentence.spans.some((span) => overlaps(segment, span))) {
        keys.push(`${section.key}:${sentence.index}`);
      }
    }
  }
  return keys;
}

/** The union of a section's sentence spans — what `sourceSpans` stores. */
export function unionSpans(spans: SourceSpan[]): SourceSpan[] {
  if (spans.length === 0) return [];
  const sorted = [...spans].sort((a, b) => a.startMs - b.startMs);
  const out: SourceSpan[] = [{ ...sorted[0] }];
  for (const span of sorted.slice(1)) {
    const last = out[out.length - 1];
    if (span.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, span.endMs);
    } else {
      out.push({ ...span });
    }
  }
  return out;
}
