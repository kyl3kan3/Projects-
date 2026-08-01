/**
 * Screener scoring. A clinician acts on these numbers, and the cut-points are
 * published — so the tests are the published cut-points, boundary by boundary,
 * rather than a couple of happy-path totals.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GAD7,
  PHQ9,
  gad7Severity,
  phq9Severity,
  scoreGad7,
  scorePhq9,
  scoreLine,
} from "@/lib/screeners";

const zeros = (n: number) => Array.from({ length: n }, () => 0);

describe("instrument definitions", () => {
  it("has nine PHQ-9 items and seven GAD-7 items", () => {
    assert.equal(PHQ9.items.length, 9);
    assert.equal(GAD7.items.length, 7);
    assert.equal(PHQ9.maxTotal, 27);
    assert.equal(GAD7.maxTotal, 21);
  });

  it("carries the public-domain attribution with each instrument", () => {
    assert.match(PHQ9.attribution, /Spitzer/);
    assert.match(GAD7.attribution, /No permission required/);
  });
});

describe("PHQ-9 severity bands", () => {
  it("uses the published cut-points at every boundary", () => {
    const cases: [number, string][] = [
      [0, "minimal"],
      [4, "minimal"],
      [5, "mild"],
      [9, "mild"],
      [10, "moderate"],
      [14, "moderate"],
      [15, "moderately_severe"],
      [19, "moderately_severe"],
      [20, "severe"],
      [27, "severe"],
    ];
    for (const [total, severity] of cases) {
      assert.equal(phq9Severity(total), severity, `total ${total}`);
    }
  });
});

describe("GAD-7 severity bands", () => {
  it("has no moderately-severe band — 15 and up is severe", () => {
    assert.equal(gad7Severity(14), "moderate");
    assert.equal(gad7Severity(15), "severe");
    assert.equal(gad7Severity(21), "severe");
  });
});

describe("scoring", () => {
  it("sums the items and reports how many were answered", () => {
    const result = scorePhq9([1, 2, 3, 0, 1, 2, 3, 1, 0]);
    assert.equal(result.total, 13);
    assert.equal(result.severity, "moderate");
    assert.equal(result.answered, 9);
    assert.equal(result.flagged, false);
  });

  it("accepts the string values a form post actually delivers", () => {
    const result = scorePhq9(["1", "2", "3", "0", "1", "2", "3", "1", "0"]);
    assert.equal(result.total, 13);
  });

  it("treats an unanswered item as unanswered, not as zero", () => {
    const partial = scorePhq9([3, 3, 3, "", null, undefined, "", "", ""]);
    assert.equal(partial.total, 9);
    assert.equal(partial.answered, 3);
    // The band is honest about the total it has, and `answered` tells the reader
    // it is partial — a "mild" reading over three items is not a screening result.
    assert.equal(partial.severity, "mild");
  });

  it("ignores out-of-range values instead of inflating a total", () => {
    const result = scorePhq9([9, 4, -1, "three", 3, 0, 0, 0, 0]);
    assert.equal(result.total, 3);
    // 9, 4, -1 and "three" are all discarded; five real answers remain.
    assert.equal(result.answered, 5);
  });

  it("flags PHQ-9 item 9 above zero and nothing else", () => {
    assert.equal(scorePhq9([...zeros(8), 1]).flagged, true);
    assert.equal(scorePhq9([...zeros(8), 3]).flagged, true);
    assert.equal(scorePhq9(zeros(9)).flagged, false);
    // Every other item at maximum, item 9 at zero: a high total, no flag.
    const high = scorePhq9([3, 3, 3, 3, 3, 3, 3, 3, 0]);
    assert.equal(high.total, 24);
    assert.equal(high.severity, "severe");
    assert.equal(high.flagged, false);
  });

  it("never flags a GAD-7 — it has no self-harm item", () => {
    assert.equal(scoreGad7([3, 3, 3, 3, 3, 3, 3]).flagged, false);
    assert.equal(scoreGad7([3, 3, 3, 3, 3, 3, 3]).total, 21);
  });
});

describe("score line", () => {
  it("renders DESIGN.md's mono form", () => {
    assert.equal(
      scoreLine({ instrument: "phq9", total: 14, severity: "moderate" }),
      "PHQ-9 · 14 · MODERATE",
    );
    assert.equal(
      scoreLine({ instrument: "phq9", total: 17, severity: "moderately_severe" }),
      "PHQ-9 · 17 · MODERATELY SEVERE",
    );
  });
});
