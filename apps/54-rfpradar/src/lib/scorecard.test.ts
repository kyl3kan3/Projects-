/**
 * The go/no-go arithmetic. A verdict a partner cannot recompute is a verdict
 * they will overrule, so these tests spell the sums out.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CONDITIONAL_THRESHOLD,
  DEFAULT_CRITERIA,
  GO_THRESHOLD,
  defaultCriteria,
  readCriteria,
  stageForVerdict,
  verdictFor,
  verdictLabel,
  weightedVerdict,
} from "@/lib/scorecard";

function scored(scores: Record<string, number | null>) {
  return defaultCriteria().map((c) => ({ ...c, score1to5: scores[c.key] ?? null }));
}

test("the default template's weights sum to 100", () => {
  assert.equal(
    DEFAULT_CRITERIA.reduce((sum, c) => sum + c.weight, 0),
    100,
  );
  assert.equal(DEFAULT_CRITERIA.length, 5);
});

test("every criterion is phrased so 5 is favourable", () => {
  // The bug this prevents: half a form where 5 means "good" and half where 5
  // means "an incumbent owns this", producing a confident, inverted verdict.
  for (const criterion of DEFAULT_CRITERIA) {
    assert.doesNotMatch(criterion.label, /\?$/, `"${criterion.label}" is a question, not a claim`);
  }
});

test("a fully scored card shows its arithmetic", () => {
  const result = weightedVerdict(
    scored({ incumbent: 4, vehicle: 5, capacity: 4, price: 3, relationship: 2 }),
  );
  // 25x4 + 25x5 + 20x4 + 15x3 + 15x2 = 100 + 125 + 80 + 45 + 30 = 380 of 500
  assert.equal(result.points, 380);
  assert.equal(result.maxPoints, 500);
  assert.equal(result.score, 76);
  assert.equal(result.verdict, "go");
  assert.equal(result.unscored, 0);
  assert.match(result.explanation, /^380 of 500 points = 76\./);
  const row = result.rows.find((r) => r.key === "vehicle");
  assert.equal(row?.points, 125);
  assert.equal(row?.maxPoints, 125);
});

test("a half-filled card refuses to render a verdict", () => {
  const result = weightedVerdict(scored({ incumbent: 1, vehicle: 1 }));
  assert.equal(result.verdict, null, "three unanswered questions are not a NO-GO");
  assert.equal(result.score, null);
  assert.equal(result.unscored, 3);
  assert.match(result.explanation, /3 questions still unscored/);
  assert.equal(verdictLabel(result.verdict), "UNSCORED");
});

test("the bands are exactly where the constants say", () => {
  assert.equal(verdictFor(GO_THRESHOLD), "go");
  assert.equal(verdictFor(GO_THRESHOLD - 1), "conditional");
  assert.equal(verdictFor(CONDITIONAL_THRESHOLD), "conditional");
  assert.equal(verdictFor(CONDITIONAL_THRESHOLD - 1), "no_go");
  assert.equal(verdictFor(0), "no_go");
  assert.equal(verdictFor(100), "go");
});

test("all ones is a no-go; all fives is a go", () => {
  const worst = weightedVerdict(
    scored({ incumbent: 1, vehicle: 1, capacity: 1, price: 1, relationship: 1 }),
  );
  assert.equal(worst.points, 100);
  assert.equal(worst.score, 20);
  assert.equal(worst.verdict, "no_go");

  const best = weightedVerdict(
    scored({ incumbent: 5, vehicle: 5, capacity: 5, price: 5, relationship: 5 }),
  );
  assert.equal(best.score, 100);
  assert.equal(best.verdict, "go");
});

test("a no-go closes the pursuit; anything else drafts", () => {
  assert.equal(stageForVerdict("no_go"), "no_bid");
  assert.equal(stageForVerdict("conditional"), "drafting");
  assert.equal(stageForVerdict("go"), "drafting");
});

test("out-of-range scores are treated as unscored, not clamped into a verdict", () => {
  const result = weightedVerdict(
    scored({ incumbent: 9, vehicle: 5, capacity: 4, price: 3, relationship: 2 }),
  );
  assert.equal(result.rows[0].score1to5, null);
  assert.equal(result.verdict, null, "a 9 is bad data, not a 5");
});

test("malformed stored criteria fall back to the template", () => {
  assert.equal(readCriteria(null).length, 5);
  assert.equal(readCriteria([]).length, 5);
  assert.equal(readCriteria("nonsense").length, 5);
  assert.equal(readCriteria([{ nope: true }]).length, 5);

  const custom = readCriteria([
    { key: "k1", label: "Only criterion", weight: 40, score1to5: 3, note: "kept" },
  ]);
  assert.equal(custom.length, 1);
  assert.equal(custom[0].weight, 40);
  assert.equal(custom[0].note, "kept");

  const weightless = readCriteria([{ key: "k", label: "No weight", score1to5: 2, note: "" }]);
  assert.equal(weightless[0].weight, 10, "a missing weight defaults rather than dividing by zero");
});

test("an empty criteria list reports no verdict instead of dividing by zero", () => {
  const result = weightedVerdict([]);
  assert.equal(result.maxPoints, 0);
  assert.equal(result.verdict, null);
  assert.equal(result.score, null);
  assert.match(result.explanation, /No criteria/);
});
