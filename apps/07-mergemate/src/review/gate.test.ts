/**
 * The confidence gate.
 *
 * The product promise is "only speaks when it is confident", so these tests assert
 * the *absence* of output as carefully as its presence. A finding that fails the
 * gate must be dropped — not downgraded, not folded into a summary, not posted with
 * a hedge.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { gate, shouldPostSummary } from "./gate";
import { resolvePolicy, DEFAULT_RULEBOOK, parseRulebook, THRESHOLD_FLOOR, toBp } from "../rules/rulebook";
import type { Anchor } from "../diff/parse";
import type { ScoredFinding } from "./types";

const anchor: Anchor = {
  path: "src/auth/session.ts",
  line: 114,
  side: "RIGHT",
  position: 6,
  lines: [{ kind: "add", oldLine: null, newLine: 114, content: "  const rows = await sql`...`", crlf: false, position: 6 }],
};

function finding(overrides: Partial<ScoredFinding> = {}): ScoredFinding {
  return {
    id: "f1",
    category: "security",
    ruleId: null,
    filePath: "src/auth/session.ts",
    startLine: 114,
    endLine: 114,
    title: "String-interpolated SQL in getSession",
    body: "Use the parameterised helper.",
    suggestedPatch: null,
    confidenceBp: 9_100,
    scoreReason: "pattern present on the cited line",
    fingerprint: "fp-raw-sql",
    anchor,
    ...overrides,
  };
}

const policy = () => resolvePolicy({ config: DEFAULT_RULEBOOK });

test("a confident, anchored, unsuppressed finding is posted", () => {
  const result = gate({
    findings: [finding()],
    policy: policy(),
    suppressions: new Map(),
    alreadyPosted: new Set(),
  });
  assert.equal(result.postable.length, 1);
  assert.equal(result.counts.posted, 1);
  assert.equal(result.dropped.length, 0);
});

test("a low-confidence finding produces silence, not a softer comment", () => {
  const quiet = finding({ confidenceBp: 5_500, id: "f-quiet" });
  const result = gate({
    findings: [quiet],
    policy: policy(),
    suppressions: new Map(),
    alreadyPosted: new Set(),
  });

  // Nothing postable at all: the finding is stored and invisible on the PR.
  assert.equal(result.postable.length, 0);
  assert.equal(result.counts.below_threshold, 1);

  const dropped = result.dropped[0];
  assert.ok(dropped);
  assert.equal(dropped.posted, false);
  assert.equal(dropped.dropReason, "below_threshold");
  // It keeps its text for the dashboard — but nothing downstream may post it.
  assert.equal(dropped.title, quiet.title);

  // And with nothing posted, the default summary policy says nothing either.
  assert.equal(shouldPostSummary(policy(), result.counts.posted), false);
});

test("a finding exactly on the threshold is posted; one basis point under is not", () => {
  const p = policy();
  const on = gate({
    findings: [finding({ confidenceBp: p.thresholdBp })],
    policy: p,
    suppressions: new Map(),
    alreadyPosted: new Set(),
  });
  assert.equal(on.counts.posted, 1);

  const under = gate({
    findings: [finding({ confidenceBp: p.thresholdBp - 1 })],
    policy: p,
    suppressions: new Map(),
    alreadyPosted: new Set(),
  });
  assert.equal(under.counts.posted, 0);
  assert.equal(under.counts.below_threshold, 1);
});

test("a suppressed fingerprint never posts again, however confident", () => {
  const result = gate({
    findings: [finding({ confidenceBp: 10_000 })],
    policy: policy(),
    suppressions: new Map([["fp-raw-sql", "suppression-uuid"]]),
    alreadyPosted: new Set(),
  });
  assert.equal(result.postable.length, 0);
  assert.equal(result.counts.suppressed, 1);
  assert.equal(result.dropped[0]?.suppressionId, "suppression-uuid");
});

test("an unanchorable finding is dropped rather than posted somewhere plausible", () => {
  const result = gate({
    findings: [finding({ anchor: null, confidenceBp: 9_900 })],
    policy: policy(),
    suppressions: new Map(),
    alreadyPosted: new Set(),
  });
  assert.equal(result.postable.length, 0);
  assert.equal(result.counts.unanchorable, 1);
});

test("the per-PR cap keeps the strongest findings and drops the rest", () => {
  const findings = [8_100, 9_900, 8_600, 9_200, 8_300].map((bp, i) =>
    finding({ id: `f${i}`, confidenceBp: bp, fingerprint: `fp-${i}` }),
  );
  const { config } = parseRulebook("version: 1\nconfidence:\n  threshold: 0.8\n  max_comments_per_pr: 2\n");
  const result = gate({
    findings,
    policy: resolvePolicy({ config }),
    suppressions: new Map(),
    alreadyPosted: new Set(),
  });

  assert.equal(result.postable.length, 2);
  assert.deepEqual(
    result.postable.map((f) => f.confidenceBp),
    [9_900, 9_200],
  );
  assert.equal(result.counts.over_cap, 3);
});

test("two findings with the same fingerprint post once", () => {
  const result = gate({
    findings: [finding({ id: "a" }), finding({ id: "b" })],
    policy: policy(),
    suppressions: new Map(),
    alreadyPosted: new Set(),
  });
  assert.equal(result.postable.length, 1);
  assert.equal(result.counts.duplicate, 1);
});

test("a fingerprint already commented on an earlier push is not re-posted", () => {
  const result = gate({
    findings: [finding()],
    policy: policy(),
    suppressions: new Map(),
    alreadyPosted: new Set(["fp-raw-sql"]),
  });
  assert.equal(result.postable.length, 0);
  assert.equal(result.counts.already_posted, 1);
});

test("shadow mode withholds everything but still records it", () => {
  const shadow = resolvePolicy({ config: DEFAULT_RULEBOOK, shadowMode: true });
  const result = gate({
    findings: [finding({ confidenceBp: 9_900 })],
    policy: shadow,
    suppressions: new Map(),
    alreadyPosted: new Set(),
  });
  assert.equal(result.postable.length, 0);
  assert.equal(result.counts.shadow_mode, 1);
  assert.equal(result.all.length, 1);
  assert.equal(shouldPostSummary(shadow, 0), false);
});

test("a disabled category and an excluded path are dropped before the threshold", () => {
  const { config } = parseRulebook(
    "version: 1\ncategories:\n  security: false\npaths:\n  exclude:\n    - \"src/generated/**\"\n",
  );
  const p = resolvePolicy({ config });

  const disabled = gate({
    findings: [finding()],
    policy: p,
    suppressions: new Map(),
    alreadyPosted: new Set(),
  });
  assert.equal(disabled.counts.category_disabled, 1);

  const excluded = gate({
    findings: [finding({ category: "bug", filePath: "src/generated/api.ts" })],
    policy: p,
    suppressions: new Map(),
    alreadyPosted: new Set(),
  });
  assert.equal(excluded.counts.path_excluded, 1);
});

test("a per-rule confidence floor is stricter than the global threshold", () => {
  const { config, valid } = parseRulebook(`version: 1
confidence:
  threshold: 0.8
rules:
  - id: no-raw-sql
    category: security
    description: SQL must be built with bound parameters, never interpolation.
    confidence_floor: 0.95
`);
  assert.equal(valid, true);
  const p = resolvePolicy({ config });

  const below = gate({
    findings: [finding({ ruleId: "no-raw-sql", confidenceBp: 9_000 })],
    policy: p,
    suppressions: new Map(),
    alreadyPosted: new Set(),
  });
  assert.equal(below.counts.below_threshold, 1, "0.90 clears the global bar but not the rule's");

  const above = gate({
    findings: [finding({ ruleId: "no-raw-sql", confidenceBp: 9_600 })],
    policy: p,
    suppressions: new Map(),
    alreadyPosted: new Set(),
  });
  assert.equal(above.counts.posted, 1);
});

test("a rulebook cannot lower the gate below the product floor", () => {
  const { config } = parseRulebook("version: 1\nconfidence:\n  threshold: 0.05\n");
  const p = resolvePolicy({ config });
  assert.equal(p.thresholdBp, toBp(THRESHOLD_FLOOR));

  const result = gate({
    findings: [finding({ confidenceBp: 1_000 })],
    policy: p,
    suppressions: new Map(),
    alreadyPosted: new Set(),
  });
  assert.equal(result.counts.posted, 0, "0.10 is under the floor even when the rulebook asks for 0.05");
});

test("summary policy: never, always, on_findings", () => {
  const modes = (yaml: string) => resolvePolicy({ config: parseRulebook(yaml).config });
  assert.equal(shouldPostSummary(modes("version: 1\nsummary: never\n"), 3), false);
  assert.equal(shouldPostSummary(modes("version: 1\nsummary: always\n"), 0), true);
  assert.equal(shouldPostSummary(modes("version: 1\nsummary: on_findings\n"), 0), false);
  assert.equal(shouldPostSummary(modes("version: 1\nsummary: on_findings\n"), 1), true);
});
