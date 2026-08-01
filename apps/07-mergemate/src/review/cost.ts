/**
 * Token and cost accounting.
 *
 * The unit economics in README.md live or die on this number, so it is recorded
 * on every run rather than estimated monthly. Prices are per million tokens, in
 * micro-dollars, so nothing is ever a float: 3_000_000 micro-USD per Mtok is
 * $3/Mtok. Rounding happens once, here, at the edge.
 *
 * Prices are a snapshot and will drift; they are keyed by model id with a
 * conservative fallback, because guessing low would make an expensive model look
 * cheap in the dashboard.
 */

import type { ModelUsage } from "./types";

export interface ModelPrice {
  /** micro-USD per million input tokens. */
  inputMicroPerMtok: number;
  outputMicroPerMtok: number;
}

const PRICES: Record<string, ModelPrice> = {
  "claude-opus-5": { inputMicroPerMtok: 15_000_000, outputMicroPerMtok: 75_000_000 },
  "claude-sonnet-5": { inputMicroPerMtok: 3_000_000, outputMicroPerMtok: 15_000_000 },
  "claude-haiku-4-5-20251001": { inputMicroPerMtok: 1_000_000, outputMicroPerMtok: 5_000_000 },
  /** The deterministic fake costs nothing, and must not inflate the telemetry. */
  "fake-deterministic": { inputMicroPerMtok: 0, outputMicroPerMtok: 0 },
};

/** Unknown model: price it as the most expensive one we know, never as free. */
const FALLBACK: ModelPrice = { inputMicroPerMtok: 15_000_000, outputMicroPerMtok: 75_000_000 };

export function priceFor(model: string): ModelPrice {
  return PRICES[model] ?? FALLBACK;
}

export function addUsage(a: ModelUsage, b: ModelUsage): ModelUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}

/** Cost of one run, in integer micro-dollars. */
export function costMicroUsd(model: string, usage: ModelUsage): number {
  const price = priceFor(model);
  const input = (usage.inputTokens * price.inputMicroPerMtok) / 1_000_000;
  const output = (usage.outputTokens * price.outputMicroPerMtok) / 1_000_000;
  return Math.round(input + output);
}

/** "$0.062" — display only; never fed back into arithmetic. */
export function formatMicroUsd(micro: number): string {
  if (micro === 0) return "$0.000";
  return `$${(micro / 1_000_000).toFixed(3)}`;
}

/**
 * Rough token estimate for budgeting a prompt before sending it. Deliberately
 * pessimistic (3.5 chars/token) because the consequence of underestimating is a
 * request that exceeds the window and fails after we have paid for it.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}
