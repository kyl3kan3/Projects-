/**
 * Parsing and validating what the model said.
 *
 * Everything here is defensive on purpose. The input is an LLM's response to a
 * prompt containing attacker-controlled text (a fork PR's diff and title), and
 * the output drives comments posted under our name. Three rules:
 *
 *  1. **Schema or nothing.** Anything that does not validate is discarded. A
 *     partially-valid response yields its valid findings and a list of what was
 *     thrown away; a response with no valid JSON object at all is a failure, and
 *     the run reports it rather than posting a guess.
 *  2. **Findings are data, never instructions.** No field is ever interpreted;
 *     the only things that reach GitHub are a title, a markdown body and a
 *     replacement snippet, all length-capped, with any HTML comment markers and
 *     bot-mention syntax neutralised so a diff cannot make our comment address
 *     another bot.
 *  3. **Confidence is not the model's to inflate.** The analysis pass is not
 *     allowed to return a confidence at all; scoring is a separate pass, and a
 *     finding the scorer does not mention scores zero.
 */

import { z } from "zod";
import type { FindingCategory } from "../db/schema";
import type { AnalysisOutcome, RawFinding, ScoreEntry, ScoringOutcome, ModelUsage } from "./types";

export const MAX_TITLE_LEN = 120;
export const MAX_BODY_LEN = 900;
export const MAX_PATCH_LEN = 2_000;
export const MAX_FINDINGS = 25;

const findingSchema = z
  .object({
    id: z.string().min(1).max(40),
    category: z.enum(["bug", "security", "standards"]),
    rule_id: z.string().min(1).max(64).nullish(),
    file: z.string().min(1).max(400),
    start_line: z.number().int().min(1).max(1_000_000),
    end_line: z.number().int().min(1).max(1_000_000),
    title: z.string().min(3).max(400),
    body: z.string().min(3).max(4_000),
    suggested_patch: z.string().max(8_000).nullish(),
  })
  .passthrough();

const analysisSchema = z.object({ findings: z.array(z.unknown()).max(200) }).passthrough();

const scoreSchema = z
  .object({
    id: z.string().min(1).max(40),
    confidence: z.number().min(0).max(1),
    reason: z.string().max(400).default(""),
  })
  .passthrough();

const scoringSchema = z.object({ scores: z.array(z.unknown()).max(200) }).passthrough();

/**
 * Pull the first JSON object out of a model response.
 *
 * Handles the three things that actually happen: a bare object, an object inside
 * a ```json fence, and an object preceded by a sentence of prose. Returns null
 * for a refusal or for prose with no object in it.
 */
export function extractJsonObject(text: string): unknown | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;

  const candidates: string[] = [];
  const fence = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(trimmed)) !== null) {
    if (m[1]) candidates.push(m[1].trim());
  }
  candidates.push(trimmed);

  for (const candidate of candidates) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end <= start) continue;
    const slice = candidate.slice(start, end + 1);
    try {
      return JSON.parse(slice);
    } catch {
      // Fall through: a truncated response leaves an unbalanced object, which is
      // a failure, not something to repair by guessing braces.
    }
  }
  return null;
}

/** Neutralise anything in model text that could act on GitHub when rendered. */
export function sanitiseText(input: string, maxLen: number): string {
  const collapsed = input
    .replace(/\r\n/g, "\n")
    // HTML comments can hide instructions from a human reviewer.
    .replace(/<!--/g, "&lt;!--")
    .replace(/-->/g, "--&gt;")
    // Never let a finding mention-ping a user, team or another bot.
    .replace(/(^|[^\w`])@([A-Za-z0-9][\w-]*)/g, "$1`@$2`")
    // Slash commands at the start of a line are how several bots take orders.
    .replace(/^\s*\/([a-z-]+)/gim, "`/$1`")
    .trimEnd();
  if (collapsed.length <= maxLen) return collapsed;
  return collapsed.slice(0, maxLen - 1).trimEnd() + "…";
}

/**
 * A suggestion block is inserted verbatim into a fenced code block, so the only
 * thing that must not survive is a fence that would close it early.
 */
export function sanitisePatch(input: string): string | null {
  const normalised = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (normalised.trim() === "") return null;
  if (/^\s*```/m.test(normalised)) return null;
  if (normalised.length > MAX_PATCH_LEN) return null;
  return normalised.replace(/\n+$/, "");
}

export interface ParseAnalysisOptions {
  /** Paths present in the diff; a finding about anything else is discarded. */
  allowedPaths: Set<string>;
  /** Rule ids the rulebook defines; an invented rule id is dropped to null. */
  knownRuleIds: Set<string>;
  /** Categories the rulebook has switched on. */
  categoryEnabled: (category: FindingCategory) => boolean;
}

export function parseAnalysisResponse(
  text: string,
  usage: ModelUsage,
  options: ParseAnalysisOptions,
): AnalysisOutcome {
  const doc = extractJsonObject(text);
  if (doc === null) {
    const looksLikeRefusal = /\b(cannot|can't|unable to|won't)\b/i.test(text.slice(0, 400));
    return {
      ok: false,
      reason: looksLikeRefusal ? "refused" : "invalid_output",
      message: looksLikeRefusal
        ? `model declined to produce findings: ${text.trim().slice(0, 200)}`
        : "no JSON object in model response",
      usage,
    };
  }

  const envelope = analysisSchema.safeParse(doc);
  if (!envelope.success) {
    return {
      ok: false,
      reason: "invalid_output",
      message: "model response has no `findings` array",
      usage,
    };
  }

  const findings: RawFinding[] = [];
  const discarded: string[] = [];
  const seenIds = new Set<string>();

  for (const [index, entry] of envelope.data.findings.entries()) {
    if (findings.length >= MAX_FINDINGS) {
      discarded.push(`finding #${index}: over the ${MAX_FINDINGS}-finding ceiling`);
      continue;
    }
    const parsed = findingSchema.safeParse(entry);
    if (!parsed.success) {
      discarded.push(`finding #${index}: ${parsed.error.issues[0]?.message ?? "invalid shape"}`);
      continue;
    }
    const f = parsed.data;

    if (seenIds.has(f.id)) {
      discarded.push(`finding ${f.id}: duplicate id`);
      continue;
    }
    if (f.end_line < f.start_line) {
      discarded.push(`finding ${f.id}: end_line before start_line`);
      continue;
    }
    if (!options.allowedPaths.has(normalisePath(f.file))) {
      // The single most common hallucination, and the most dangerous: a comment
      // on a file this PR never touched.
      discarded.push(`finding ${f.id}: file ${f.file} is not in this diff`);
      continue;
    }
    const category = f.category as FindingCategory;
    if (!options.categoryEnabled(category)) {
      discarded.push(`finding ${f.id}: category ${category} disabled by the rulebook`);
      continue;
    }

    const ruleId = f.rule_id ?? null;
    const resolvedRule = ruleId && options.knownRuleIds.has(ruleId) ? ruleId : null;
    if (ruleId && !resolvedRule) {
      discarded.push(`finding ${f.id}: unknown rule id ${ruleId} (kept, rule dropped)`);
    }

    const patch = f.suggested_patch == null ? null : sanitisePatch(f.suggested_patch);

    seenIds.add(f.id);
    findings.push({
      id: f.id,
      category,
      ruleId: resolvedRule,
      filePath: normalisePath(f.file),
      startLine: f.start_line,
      endLine: f.end_line,
      title: sanitiseText(f.title, MAX_TITLE_LEN),
      body: sanitiseText(f.body, MAX_BODY_LEN),
      suggestedPatch: patch,
    });
  }

  return { ok: true, findings, usage, discarded };
}

export function parseScoringResponse(text: string, usage: ModelUsage): ScoringOutcome {
  const doc = extractJsonObject(text);
  if (doc === null) {
    return { ok: false, reason: "invalid_output", message: "no JSON object in scoring response", usage };
  }
  const envelope = scoringSchema.safeParse(doc);
  if (!envelope.success) {
    return { ok: false, reason: "invalid_output", message: "scoring response has no `scores` array", usage };
  }

  const scores: ScoreEntry[] = [];
  const discarded: string[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of envelope.data.scores.entries()) {
    const parsed = scoreSchema.safeParse(entry);
    if (!parsed.success) {
      discarded.push(`score #${index}: ${parsed.error.issues[0]?.message ?? "invalid shape"}`);
      continue;
    }
    if (seen.has(parsed.data.id)) {
      discarded.push(`score ${parsed.data.id}: duplicate`);
      continue;
    }
    seen.add(parsed.data.id);
    scores.push({
      id: parsed.data.id,
      confidenceBp: Math.round(parsed.data.confidence * 10_000),
      reason: sanitiseText(parsed.data.reason, 200),
    });
  }
  return { ok: true, scores, usage, discarded };
}

function normalisePath(path: string): string {
  let p = path.trim().replace(/\\/g, "/");
  if (p.startsWith("./")) p = p.slice(2);
  if (p.startsWith("/")) p = p.slice(1);
  return p;
}
