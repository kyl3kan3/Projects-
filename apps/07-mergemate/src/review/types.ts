/**
 * Shared types for the review pipeline.
 *
 * A finding travels through four states, and the type changes at each step so a
 * stage can't be skipped by accident:
 *
 *   RawFinding      what came back from the analysis pass (validated, unscored)
 *   ScoredFinding   + a confidence in basis points from the scoring pass
 *   GatedFinding    + the gate's verdict: post it, or drop it and why
 *   PostedFinding   + the GitHub comment id it landed on
 */

import type { Anchor } from "../diff/parse";
import type { DropReason, FindingCategory } from "../db/schema";

export interface RawFinding {
  /** Model-assigned id, used to match the scoring pass back to the finding. */
  id: string;
  category: FindingCategory;
  /** Rulebook rule this came from, when the finding is a standards violation. */
  ruleId: string | null;
  filePath: string;
  startLine: number;
  endLine: number;
  /** One line: the defect. */
  title: string;
  /** Evidence and the fix. Markdown, length-capped. */
  body: string;
  /**
   * Replacement text for the anchored lines, when a mechanical fix exists.
   * Rendered as a GitHub suggestion block. Null means "no safe fix".
   */
  suggestedPatch: string | null;
}

export interface ScoredFinding extends RawFinding {
  confidenceBp: number;
  /** The model's one-line justification for the score; dashboard only. */
  scoreReason: string;
  fingerprint: string;
  anchor: Anchor | null;
}

export interface GatedFinding extends ScoredFinding {
  posted: boolean;
  dropReason: DropReason | null;
  /** Set when dropped because a suppression matched. */
  suppressionId: string | null;
}

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
}

export const NO_USAGE: ModelUsage = { inputTokens: 0, outputTokens: 0 };

export type ModelFailureReason =
  | "timeout"
  | "invalid_output"
  | "refused"
  | "transport"
  | "no_credentials";

export interface AnalysisSuccess {
  ok: true;
  findings: RawFinding[];
  usage: ModelUsage;
  /** Findings the model returned that had to be discarded, with the reason. */
  discarded: string[];
}

export interface AnalysisFailure {
  ok: false;
  reason: ModelFailureReason;
  message: string;
  usage: ModelUsage;
}

export type AnalysisOutcome = AnalysisSuccess | AnalysisFailure;

export interface ScoreEntry {
  id: string;
  confidenceBp: number;
  reason: string;
}

export interface ScoringSuccess {
  ok: true;
  scores: ScoreEntry[];
  usage: ModelUsage;
  discarded: string[];
}

export type ScoringOutcome = ScoringSuccess | AnalysisFailure;
