/**
 * Cost accounting.
 *
 * The README's unit economics ("a developer must open more than ~120 PRs/month
 * before a $12 seat goes underwater") are only true if this number is right, and
 * a review's cost must never be computed in floating-point dollars.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { addUsage, costMicroUsd, estimateTokens, formatMicroUsd, priceFor } from "./cost";

test("an average review costs what ARCHITECTURE.md says it does", () => {
  // 30k input + 3k output on Sonnet-class pricing.
  const cost = costMicroUsd("claude-sonnet-5", { inputTokens: 30_000, outputTokens: 3_000 });
  assert.equal(cost, 135_000);
  assert.equal(formatMicroUsd(cost), "$0.135");

  const cheap = costMicroUsd("claude-haiku-4-5-20251001", { inputTokens: 30_000, outputTokens: 3_000 });
  assert.equal(cheap, 45_000);
});

test("the cost is an integer, so a month of reviews sums exactly", () => {
  const runs = Array.from({ length: 1_000 }, () =>
    costMicroUsd("claude-sonnet-5", { inputTokens: 7, outputTokens: 3 }),
  );
  const total = runs.reduce((a, b) => a + b, 0);
  assert.ok(Number.isInteger(total));
  assert.equal(total, runs[0]! * 1_000);
});

test("an unknown model is priced as the most expensive one, never as free", () => {
  const unknown = priceFor("claude-something-unreleased");
  assert.equal(unknown.inputMicroPerMtok, priceFor("claude-opus-5").inputMicroPerMtok);
  assert.ok(costMicroUsd("claude-something-unreleased", { inputTokens: 1_000, outputTokens: 0 }) > 0);
});

test("the deterministic fake is free, and says so", () => {
  assert.equal(costMicroUsd("fake-deterministic", { inputTokens: 100_000, outputTokens: 5_000 }), 0);
  assert.equal(formatMicroUsd(0), "$0.000");
});

test("usage adds up and token estimates are pessimistic", () => {
  assert.deepEqual(
    addUsage({ inputTokens: 10, outputTokens: 2 }, { inputTokens: 5, outputTokens: 1 }),
    { inputTokens: 15, outputTokens: 3 },
  );
  // 3.5 chars per token: a 350-character prompt estimates at 100 tokens.
  assert.equal(estimateTokens("x".repeat(350)), 100);
  assert.ok(estimateTokens("const x = 1;") >= 3);
});
