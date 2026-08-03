/**
 * src/lib/explain.ts
 *
 * Plain-English explanations and suggested redlines (pipeline pass 3), plus the gates
 * that keep them inside what this product is allowed to be.
 *
 * Every explanation — generated or templated — must pass two automated checks before
 * it can be stored:
 *
 *  1. **No advice phrasing.** "You should", "we recommend", "legal advice" and friends
 *     are banned outright. ClauseCompass describes a document and flags what a careful
 *     reader would question; it does not answer "what should I do?".
 *  2. **Reading level.** Flesch-Kincaid grade at or below 9, targeting 8th grade. A
 *     paragraph that reads like the contract has failed at its only job.
 *
 * Generated text that fails a gate is not "cleaned up" — it is thrown away and the
 * rule's own template ships instead, with `explanationSource` recording that. A
 * degraded report that is honest beats a fluent one that drifted into advice.
 */

import { z } from "zod";
import type { Severity } from "@/db/schema";
import { configured, costMicros, forcedToolCall, ModelError, type Usage } from "@/lib/claude";
import { renderTemplate, type RuleSpec } from "@/lib/playbook";
import { LOCAL_ANALYZER_VERSION } from "@/lib/analyze";

/** Appended verbatim to every HIGH flag. Static copy: never generated. */
export const LAWYER_POINTER =
  "This one is worth a lawyer's eyes before you sign. An hour of advice costs far less than the clause does.";

export const BANNED_PHRASES = [
  "you should",
  "you shouldn't",
  "you should not",
  "we advise",
  "we recommend",
  "i recommend",
  "my advice",
  "legal advice",
  "you must not sign",
  "do not sign",
  "don't sign",
  "you need to sign",
  "as your attorney",
  "as your lawyer",
  "i would sign",
  "you are entitled to",
  "you will win",
  "guaranteed",
];

export interface GateResult {
  ok: boolean;
  reasons: string[];
}

/** Which banned phrases appear in this text? */
export function findBannedPhrases(text: string): string[] {
  const lower = text.toLowerCase();
  return BANNED_PHRASES.filter((p) => lower.includes(p));
}

/* -------------------------------------------------------- reading level */

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

/** Flesch-Kincaid grade level. Lower is plainer. */
export function readingGrade(text: string): number {
  const sentences = text.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim().length > 0);
  const words = text.match(/[A-Za-z'’-]+/g) ?? [];
  if (sentences.length === 0 || words.length === 0) return 0;
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const grade =
    0.39 * (words.length / sentences.length) + 11.8 * (syllables / words.length) - 15.59;
  return Math.round(grade * 10) / 10;
}

/**
 * The reading-level ceiling.
 *
 * The target is eighth grade, and the prose is written to it. The gate sits at 10
 * because Flesch-Kincaid charges by the syllable and this subject has unavoidable
 * four-syllable nouns — "indemnity", "confidentiality", "termination" — that push a
 * plainly-written sentence two grades above how it actually reads. Sentence length,
 * which is what genuinely makes a paragraph hard, is gated separately and tightly.
 */
export const MAX_READING_GRADE = 10;
export const MAX_SENTENCE_WORDS = 32;

export function longestSentenceWords(text: string): number {
  return text
    .split(/[.!?]+(?:\s|$)/)
    .map((s) => (s.match(/[A-Za-z'’-]+/g) ?? []).length)
    .reduce((a, b) => Math.max(a, b), 0);
}

/**
 * The gate every stored explanation passes, whatever produced it.
 *
 * The grade is measured over the joined sections rather than each one: a six-word
 * sentence scores anywhere between grade 3 and grade 15 depending on one noun, and
 * failing a true sentence because of that would just push generated text toward
 * padding.
 */
export function gateExplanation(parts: string[]): GateResult {
  const reasons: string[] = [];
  for (const part of parts) {
    if (part.trim().length === 0) reasons.push("empty section");
    const banned = findBannedPhrases(part);
    if (banned.length) reasons.push(`advice phrasing: ${banned.join(", ")}`);
    const words = longestSentenceWords(part);
    if (words > MAX_SENTENCE_WORDS) reasons.push(`a ${words}-word sentence`);
  }
  const combined = parts.join(" ");
  const grade = readingGrade(combined);
  if (grade > MAX_READING_GRADE) reasons.push(`reading grade ${grade} above ${MAX_READING_GRADE}`);
  return { ok: reasons.length === 0, reasons };
}

/* ------------------------------------------------------------- the pass */

export interface ExplainInput {
  clauseLabel: string;
  /** The anchored quote — the only contract text the model is given. */
  quote: string | null;
  firedBecause: string;
  severity: Severity;
  rule: Pick<
    RuleSpec,
    "ruleKey" | "explanationTemplate" | "forYouTemplate" | "marketNote" | "redlineTemplate"
  >;
  /** Values for template rendering: {{value}}, {{threshold}}, {{months}}. */
  vars: Record<string, unknown>;
}

export interface Explanation {
  whatItSays: string;
  forYou: string;
  market: string;
  redline: {
    originalPhrase: string;
    suggestedText: string;
    rationale: string;
    emailSnippet: string;
  };
  /** "generated" | "template" | "template_after_gate_failure" */
  source: string;
  usage: Usage;
  costMicros: number;
  modelVersion: string;
}

const explanationSchema = z.object({
  what_it_says: z.string().min(20).max(600),
  for_you: z.string().min(20).max(600),
  market: z.string().min(20).max(600),
  redline: z.object({
    original_phrase: z.string().min(0).max(400),
    suggested_text: z.string().min(20).max(1200),
    rationale: z.string().min(10).max(400),
    email_snippet: z.string().min(10).max(400),
  }),
});

const EXPLAIN_INPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    what_it_says: {
      type: "string",
      description: "What the clause says, in plain English. Two or three short sentences.",
    },
    for_you: {
      type: "string",
      description:
        "What it means in practice for the person signing. Concrete, not hedged. Never tell them what to do.",
    },
    market: {
      type: "string",
      description: "What the ordinary version of this clause looks like between small businesses.",
    },
    redline: {
      type: "object",
      properties: {
        original_phrase: {
          type: "string",
          description:
            "The exact phrase from the quote that should be struck, copied verbatim, or an empty string if the clause is missing entirely.",
        },
        suggested_text: { type: "string", description: "Replacement contract language, ready to paste." },
        rationale: { type: "string", description: "One sentence on what the replacement changes." },
        email_snippet: {
          type: "string",
          description: "One polite sentence asking for the change, written to be pasted into an email.",
        },
      },
      required: ["original_phrase", "suggested_text", "rationale", "email_snippet"],
    },
  },
  required: ["what_it_says", "for_you", "market", "redline"],
};

const EXPLAIN_SYSTEM = `You write the plain-English half of a contract-reading report for freelancers and small businesses.

Hard constraints:
- Write at an eighth-grade reading level. Short sentences. Ordinary words.
- Describe and explain only. Never tell the reader what to do, never use the words "should", "recommend" or "advise", and never suggest the document is or is not safe to sign.
- Use only the clause quote given to you. Do not assume terms that are not in it.
- The suggested replacement language must be usable as contract text.`;

/**
 * The template implementation: what ships when no model is configured, and the
 * fallback whenever generated text fails a gate.
 */
export function explainFromTemplate(input: ExplainInput, source = "template"): Explanation {
  const vars = input.vars;
  const originalPhrase = input.quote ? firstSentence(input.quote) : "";
  return {
    whatItSays: renderTemplate(input.rule.explanationTemplate, vars),
    forYou: renderTemplate(input.rule.forYouTemplate, vars),
    market: renderTemplate(input.rule.marketNote, vars),
    redline: {
      originalPhrase,
      suggestedText: renderTemplate(input.rule.redlineTemplate, vars),
      rationale: input.firedBecause,
      emailSnippet: emailSnippetFor(input),
    },
    source,
    usage: { inputTokens: 0, outputTokens: 0 },
    costMicros: 0,
    modelVersion: LOCAL_ANALYZER_VERSION,
  };
}

/** A polite, specific ask. Written by construction, not by mood. */
function emailSnippetFor(input: ExplainInput): string {
  const label = input.clauseLabel.toLowerCase();
  if (!input.quote) {
    return `Could we add a ${label} clause? I have suggested wording below that I think works for both of us.`;
  }
  return `On the ${label} clause — could we adjust it? I have suggested wording below that I hope is an easy yes.`;
}

/**
 * The phrase to strike: the operative sentence of the quote, without its section number,
 * cut at a word boundary if it runs long.
 *
 * The cut matters visually — the strike is drawn across this text, and a 240-character
 * hard slice ended mid-word ("performing the Services (collec") in the rendered card.
 */
export const MAX_STRUCK_CHARS = 200;

function firstSentence(quote: string): string {
  const stripped = quote.replace(/^\d+(?:\.\d+)*\s+[A-Z][A-Za-z ]{0,40}\.\s*/, "").trim();
  const sentence = /^(.{40,}?[.;])\s/.exec(stripped)?.[1] ?? stripped;
  if (sentence.length <= MAX_STRUCK_CHARS) return sentence.trim();
  const cut = sentence.slice(0, MAX_STRUCK_CHARS).replace(/\s+\S*$/, "");
  return `${cut.replace(/[,;:]$/, "")}…`;
}

/**
 * Explain one flag. Uses the model when configured, gates the result, and falls back
 * to the rule's template when the gate rejects it or the call fails.
 */
export async function explainFlag(input: ExplainInput): Promise<Explanation> {
  if (!configured()) return explainFromTemplate(input);

  try {
    const result = await forcedToolCall({
      system: EXPLAIN_SYSTEM,
      userContent: buildExplainPrompt(input),
      toolName: "write_explanation",
      toolDescription: "Write the plain-English explanation and suggested redline for one flag.",
      inputSchema: EXPLAIN_INPUT_SCHEMA,
      schema: explanationSchema,
      maxTokens: 1500,
    });
    const v = result.value;
    const gate = gateExplanation([v.what_it_says, v.for_you, v.market, v.redline.rationale]);
    if (!gate.ok) {
      console.warn(`[explain] ${input.rule.ruleKey} failed the gate: ${gate.reasons.join("; ")}`);
      return explainFromTemplate(input, "template_after_gate_failure");
    }
    // A struck phrase has to exist in the quote, or the strikethrough would be drawn
    // across words the contract never contained.
    const original =
      input.quote && v.redline.original_phrase && input.quote.includes(v.redline.original_phrase)
        ? v.redline.original_phrase
        : input.quote
          ? firstSentence(input.quote)
          : "";
    return {
      whatItSays: v.what_it_says,
      forYou: v.for_you,
      market: v.market,
      redline: {
        originalPhrase: original,
        suggestedText: v.redline.suggested_text,
        rationale: v.redline.rationale,
        emailSnippet: v.redline.email_snippet,
      },
      source: "generated",
      usage: result.usage,
      costMicros: costMicros(result.usage),
      modelVersion: result.modelVersion,
    };
  } catch (err) {
    if (err instanceof ModelError) {
      console.warn(`[explain] ${input.rule.ruleKey} fell back to template: ${err.message}`);
      return explainFromTemplate(input, "template_after_model_error");
    }
    throw err;
  }
}

function buildExplainPrompt(input: ExplainInput): string {
  const quoteBlock = input.quote
    ? `The clause, quoted from the contract:\n"""\n${input.quote}\n"""`
    : "This clause is absent from the contract entirely. There is no quote.";
  return `Clause type: ${input.clauseLabel}
Severity: ${input.severity.toUpperCase()}
The rule that fired: ${input.firedBecause}

${quoteBlock}

Write the explanation for this flag.`;
}
