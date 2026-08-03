import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CONFIDENCE_AUTO,
  DEFAULT_POLICY,
  decide,
  formatConfidence,
  fromBp,
  overallConfidence,
  rejectionCopy,
  shouldEscalate,
  toBp,
} from "./confidence";

const ALL_PRESENT = { vendor: true, date: true, total: true, tax: true, category: true };

test("a reading where every field clears the bar is confirmed without asking", () => {
  const decision = decide({
    present: ALL_PRESENT,
    confidence: { vendor: 0.98, date: 0.97, total: 0.96, tax: 0.95, category: 1 },
  });
  assert.equal(decision.status, "confirmed");
  assert.deepEqual(decision.flagged, []);
});

test("exactly at the auto threshold is confirmed; a hair under is flagged", () => {
  const at = decide({
    present: ALL_PRESENT,
    confidence: { vendor: 0.98, date: 0.97, total: CONFIDENCE_AUTO, tax: 0.99, category: 1 },
  });
  assert.equal(at.status, "confirmed");

  const under = decide({
    present: ALL_PRESENT,
    confidence: { vendor: 0.98, date: 0.97, total: CONFIDENCE_AUTO - 0.001, tax: 0.99, category: 1 },
  });
  assert.equal(under.status, "needs_review");
  assert.deepEqual(
    under.flagged.map((f) => f.field),
    ["total"],
  );
});

test("only the fields below the threshold are flagged, and the rest are left alone", () => {
  const decision = decide({
    present: ALL_PRESENT,
    confidence: { vendor: 0.71, date: 0.97, total: 0.58, tax: 0.99, category: 0.6 },
  });
  assert.equal(decision.status, "needs_review");
  assert.deepEqual(
    decision.flagged.map((f) => f.field),
    ["vendor", "total", "category"],
  );
});

/**
 * The gate, stated as a test: a field with no confidence score is not a confident field.
 * A silently-missing score is how a parser bug becomes an unreviewed wrong total.
 */
test("a present field with no reported confidence is treated as unconfident", () => {
  const decision = decide({
    present: ALL_PRESENT,
    confidence: { vendor: 0.99, date: 0.99, total: 0.99, category: 1 }, // tax score missing
  });
  assert.equal(decision.status, "needs_review");
  assert.deepEqual(
    decision.flagged.map((f) => f.field),
    ["tax"],
  );
});

test("a document missing any export-critical field is rejected, not queued for review", () => {
  const noTotal = decide({
    present: { ...ALL_PRESENT, total: false },
    confidence: { vendor: 0.99, date: 0.99, category: 1 },
  });
  assert.equal(noTotal.status, "rejected");
  assert.equal(noTotal.status === "rejected" ? noTotal.reason : null, "no_total");

  const noVendor = decide({
    present: { ...ALL_PRESENT, vendor: false },
    confidence: { date: 0.99, total: 0.99, category: 1 },
  });
  assert.equal(noVendor.status === "rejected" ? noVendor.reason : null, "no_vendor");

  const noDate = decide({
    present: { ...ALL_PRESENT, date: false },
    confidence: { vendor: 0.99, total: 0.99, category: 1 },
  });
  assert.equal(noDate.status === "rejected" ? noDate.reason : null, "no_date");
});

test("a reading below the floor asks for a retake instead of filling the queue", () => {
  const decision = decide({
    present: ALL_PRESENT,
    confidence: { vendor: 0.3, date: 0.4, total: 0.2, tax: 0.2, category: 0.1 },
  });
  assert.equal(decision.status, "rejected");
  assert.equal(decision.status === "rejected" ? decision.reason : null, "unreadable");
  assert.match(rejectionCopy("unreadable"), /retake/i);
});

test("the overall score weights the total heaviest and ignores absent fields", () => {
  // A missing tax line must not drag the score down: plenty of receipts have no tax.
  const withTax = overallConfidence({ vendor: 0.9, date: 0.9, total: 0.9, tax: 0.9, category: 0.9 });
  const withoutTax = overallConfidence({ vendor: 0.9, date: 0.9, total: 0.9, category: 0.9 });
  assert.equal(withTax.toFixed(4), withoutTax.toFixed(4));

  // A bad total hurts more than a bad category.
  const badTotal = overallConfidence({ vendor: 1, date: 1, total: 0.2, category: 1 });
  const badCategory = overallConfidence({ vendor: 1, date: 1, total: 1, category: 0.2 });
  assert.ok(badTotal < badCategory);
  assert.equal(overallConfidence({}), 0);
});

test("escalation happens between the floor and the escalate threshold, once", () => {
  assert.equal(shouldEscalate(0.7, false), true);
  assert.equal(shouldEscalate(0.7, true), false, "never escalate a second time");
  assert.equal(shouldEscalate(0.4, false), false, "below the floor there is nothing to salvage");
  assert.equal(shouldEscalate(0.85, false), false, "good enough to hand to review as-is");
  assert.equal(shouldEscalate(DEFAULT_POLICY.escalate, false), false);
});

test("basis points round-trip and never leave the 0-1 range", () => {
  assert.equal(toBp(0.6142), 6142);
  assert.equal(toBp(1), 10_000);
  assert.equal(toBp(1.5), 10_000);
  assert.equal(toBp(-1), 0);
  assert.equal(toBp(Number.NaN), 0);
  assert.equal(fromBp(6142), 0.6142);
  assert.equal(formatConfidence(fromBp(6142)), "61%");
});
