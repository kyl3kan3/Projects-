/**
 * The model boundary.
 *
 * Everything expensive to get right — prompt assembly, output validation, the
 * confidence gate, cost accounting, what happens when the model refuses or times
 * out — lives on this side of the interface and is fully testable. Behind it are
 * exactly two implementations:
 *
 *   AnthropicReviewModel  the real thing, used when ANTHROPIC_API_KEY is set.
 *   FakeReviewModel       deterministic pattern matching, used by every test, by
 *                         the golden-set harness, and automatically when no key
 *                         is configured.
 *
 * `selectModel()` is the only place that decides which one runs, and the chosen
 * model's id is recorded on every review run, so a review produced by the fake is
 * never mistaken for a review produced by Claude.
 */

import type { DiffFile } from "../diff/parse";
import type { ResolvedPolicy } from "../rules/rulebook";
import type { PullRequestContext, ExpandedFileContext } from "./prompt";
import type { AnalysisOutcome, RawFinding, ScoringOutcome } from "./types";

export interface AnalysisRequest {
  pr: PullRequestContext;
  files: DiffFile[];
  contexts: ExpandedFileContext[];
  policy: ResolvedPolicy;
  truncatedFiles: string[];
}

export interface ScoringRequest {
  findings: RawFinding[];
  files: DiffFile[];
}

export interface ReviewModel {
  /** Recorded on the run and shown in the dashboard. */
  readonly id: string;
  /** True for the deterministic fallback; the summary comment says so. */
  readonly isFake: boolean;
  analyse(request: AnalysisRequest): Promise<AnalysisOutcome>;
  score(request: ScoringRequest): Promise<ScoringOutcome>;
}

export interface SelectModelOptions {
  apiKey?: string;
  analysisModel?: string;
  scoringModel?: string;
  timeoutMs?: number;
}

/**
 * Choose the model implementation. Called once per process.
 *
 * Requires an explicit key: there is no partially-configured state where some
 * runs hit the API and others silently do not.
 */
export function selectModel(options: SelectModelOptions = {}): ReviewModel {
  const key = options.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "";
  if (key.trim() === "") {
    // Lazy require so tests and the eval harness never load the SDK.
    const { FakeReviewModel } = require("./model-fake") as typeof import("./model-fake");
    return new FakeReviewModel();
  }
  const { AnthropicReviewModel } = require("./model-anthropic") as typeof import("./model-anthropic");
  return new AnthropicReviewModel({
    apiKey: key,
    analysisModel: options.analysisModel ?? process.env.REVIEW_MODEL ?? "claude-sonnet-5",
    scoringModel:
      options.scoringModel ?? process.env.CONFIDENCE_MODEL ?? process.env.REVIEW_MODEL ?? "claude-sonnet-5",
    timeoutMs: options.timeoutMs ?? Number(process.env.MODEL_TIMEOUT_MS ?? 120_000),
  });
}
