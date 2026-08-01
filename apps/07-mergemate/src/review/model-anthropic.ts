/**
 * The real model call.
 *
 * Deliberately thin: assemble, send, hand the raw text to the validator in
 * parse-output.ts. The only logic here is transport behaviour, which is the part
 * a fake cannot exercise —
 *
 *  - a hard per-request timeout, so a stalled call cannot hold a queue slot;
 *  - one retry, and only for the errors that are worth retrying (429, 5xx,
 *    connection resets). A 400 means our prompt is wrong and will be wrong again;
 *  - no tool use, so the model has no way to act on anything it reads in a diff;
 *  - the system prompt marked for prompt caching, since it and the rulebook are
 *    identical across every PR in a repo and dominate input tokens.
 *
 * NOTE: this path is unexercised in this environment — there is no
 * ANTHROPIC_API_KEY here, so `selectModel()` returns the fake and no live request
 * has ever been made from this code. Everything around it is tested.
 */

import Anthropic from "@anthropic-ai/sdk";
import { ANALYSIS_SYSTEM_PROMPT, SCORING_SYSTEM_PROMPT, buildAnalysisPrompt, buildScoringPrompt } from "./prompt";
import { parseAnalysisResponse, parseScoringResponse } from "./parse-output";
import type { AnalysisRequest, ReviewModel, ScoringRequest } from "./model";
import type { AnalysisOutcome, ModelUsage, ScoringOutcome } from "./types";
import { NO_USAGE } from "./types";

export interface AnthropicModelOptions {
  apiKey: string;
  analysisModel: string;
  scoringModel: string;
  timeoutMs: number;
  maxRetries?: number;
}

interface CallResult {
  ok: boolean;
  text: string;
  usage: ModelUsage;
  reason?: "timeout" | "transport";
  message?: string;
}

export class AnthropicReviewModel implements ReviewModel {
  readonly isFake = false;
  private readonly client: Anthropic;
  private readonly options: AnthropicModelOptions;

  constructor(options: AnthropicModelOptions) {
    this.options = options;
    this.client = new Anthropic({
      apiKey: options.apiKey,
      timeout: options.timeoutMs,
      // Retries are handled here so the two failure modes stay distinguishable.
      maxRetries: 0,
    });
  }

  get id(): string {
    return this.options.analysisModel;
  }

  async analyse(request: AnalysisRequest): Promise<AnalysisOutcome> {
    const prompt = buildAnalysisPrompt(request);
    const call = await this.call(this.options.analysisModel, ANALYSIS_SYSTEM_PROMPT, prompt, 4_096);
    if (!call.ok) {
      return {
        ok: false,
        reason: call.reason ?? "transport",
        message: call.message ?? "model call failed",
        usage: call.usage,
      };
    }
    const allowedPaths = new Set(request.files.map((f) => f.path));
    const knownRuleIds = new Set(request.policy.rules.map((r) => r.id));
    return parseAnalysisResponse(call.text, call.usage, {
      allowedPaths,
      knownRuleIds,
      categoryEnabled: (category) => request.policy.categories[category] !== false,
    });
  }

  async score(request: ScoringRequest): Promise<ScoringOutcome> {
    const prompt = buildScoringPrompt(request.findings, request.files);
    const call = await this.call(this.options.scoringModel, SCORING_SYSTEM_PROMPT, prompt, 2_048);
    if (!call.ok) {
      return {
        ok: false,
        reason: call.reason ?? "transport",
        message: call.message ?? "scoring call failed",
        usage: call.usage,
      };
    }
    return parseScoringResponse(call.text, call.usage);
  }

  private async call(
    model: string,
    system: string,
    userContent: string,
    maxTokens: number,
  ): Promise<CallResult> {
    let lastError = "";
    let lastReason: "timeout" | "transport" = "transport";

    for (let attempt = 0; attempt <= (this.options.maxRetries ?? 1); attempt++) {
      try {
        const response = await this.client.messages.create({
          model,
          max_tokens: maxTokens,
          temperature: 0,
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: userContent }],
        });

        const usage: ModelUsage = {
          inputTokens: response.usage.input_tokens ?? 0,
          outputTokens: response.usage.output_tokens ?? 0,
        };
        const text = response.content
          .map((part) => (part.type === "text" ? part.text : ""))
          .join("")
          .trim();
        return { ok: true, text, usage };
      } catch (err) {
        const classified = classifyError(err);
        lastReason = classified.reason;
        lastError = classified.message;
        if (!classified.retryable) break;
        // Fixed short backoff: the queue's own retry handles the long game.
        await sleep(1_500 * (attempt + 1));
      }
    }

    return { ok: false, text: "", usage: NO_USAGE, reason: lastReason, message: lastError };
  }
}

function classifyError(err: unknown): {
  reason: "timeout" | "transport";
  message: string;
  retryable: boolean;
} {
  const message = err instanceof Error ? err.message : String(err);
  const status = typeof (err as { status?: number }).status === "number" ? (err as { status: number }).status : 0;

  if (err instanceof Anthropic.APIConnectionTimeoutError || /timeout|timed out/i.test(message)) {
    return { reason: "timeout", message, retryable: true };
  }
  if (status === 429 || status >= 500) {
    return { reason: "transport", message: `HTTP ${status}: ${message}`, retryable: true };
  }
  if (status >= 400) {
    // Our request is malformed; retrying sends the same malformed request.
    return { reason: "transport", message: `HTTP ${status}: ${message}`, retryable: false };
  }
  return { reason: "transport", message, retryable: true };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
