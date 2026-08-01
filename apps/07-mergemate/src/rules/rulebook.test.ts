/**
 * Rulebook parsing, validation and policy resolution.
 *
 * The property that matters most: an invalid rulebook must never silently disable
 * review, and must never be usable. Both halves are tested — the errors come back
 * readable, and the config that comes back is the defaults, not a half-applied
 * version of what the team wrote.
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_RULEBOOK,
  MAX_COMMENTS_CEILING,
  THRESHOLD_FLOOR,
  effectiveThresholdBp,
  fromBp,
  parseRulebook,
  resolvePolicy,
  toBp,
} from "./rulebook";
import { RULEBOOK_TEMPLATES, TEMPLATE_IDS } from "./templates";

test("every starter template validates against the current schema", () => {
  for (const id of TEMPLATE_IDS) {
    const template = RULEBOOK_TEMPLATES[id];
    const result = parseRulebook(template.yaml);
    assert.equal(result.valid, true, `${id}: ${result.errors.join("; ")}`);
    assert.ok(result.config.rules.length >= 3, `${id} should carry a real starter rule set`);
    for (const rule of result.config.rules) {
      assert.match(rule.id, /^[a-z0-9][a-z0-9-]*$/);
      if (rule.pattern) assert.doesNotThrow(() => new RegExp(rule.pattern as string));
    }
  }
});

test("a complete rulebook round-trips into the shape the pipeline uses", () => {
  const result = parseRulebook(`version: 1
categories:
  bug: true
  security: true
  standards: false
confidence:
  threshold: 0.9
  max_comments_per_pr: 3
summary: always
suggested_patches: false
paths:
  include: ["src/**/*.ts"]
  exclude: ["src/generated/**"]
rules:
  - id: validate-handler-input
    category: bug
    severity: high
    description: Every handler validates its input with a zod schema first.
    paths: ["src/app/**/route.ts"]
`);
  assert.equal(result.valid, true, result.errors.join("; "));
  const policy = resolvePolicy({ config: result.config });
  assert.equal(policy.thresholdBp, 9_000);
  assert.equal(policy.maxComments, 3);
  assert.equal(policy.categories.standards, false);
  assert.equal(policy.summary, "always");
  assert.equal(policy.suggestedPatches, false);
  assert.deepEqual(policy.include, ["src/**/*.ts"]);
  assert.equal(policy.rules.length, 1);
});

test("YAML syntax errors are reported, and the defaults stay in force", () => {
  const result = parseRulebook("version: 1\nconfidence:\n  threshold: [0.8\n");
  assert.equal(result.valid, false);
  assert.match(result.errors[0] ?? "", /YAML syntax error/);
  assert.deepEqual(result.config, DEFAULT_RULEBOOK);
});

test("an unknown key is an error, not something to ignore", () => {
  const result = parseRulebook("version: 1\nconfidance:\n  threshold: 0.9\n");
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /unknown key/);
  // Silently ignoring a typo'd key is how a team believes a threshold is in force
  // that never was.
  assert.deepEqual(result.config, DEFAULT_RULEBOOK);
});

test("out-of-range and malformed values are rejected with their path", () => {
  const cases: [string, RegExp][] = [
    ["version: 1\nconfidence:\n  threshold: 1.4\n", /confidence\.threshold/],
    ["version: 1\nrules:\n  - id: Bad_ID\n    description: something long enough here\n", /kebab-case/],
    ["version: 1\nrules:\n  - id: ok-rule\n    description: short\n", /rules\.0\.description/],
    ["version: 2\n", /version/],
    ["- one\n- two\n", /YAML mapping/],
    ["", /empty/],
  ];
  for (const [yaml, pattern] of cases) {
    const result = parseRulebook(yaml);
    assert.equal(result.valid, false, `should reject: ${yaml}`);
    assert.match(result.errors.join(" | "), pattern);
  }
});

test("a duplicate rule id and a broken pattern are caught", () => {
  const dup = parseRulebook(`version: 1
rules:
  - id: no-raw-sql
    description: SQL must use bound parameters everywhere.
  - id: no-raw-sql
    description: A second rule that reuses the same id.
`);
  assert.equal(dup.valid, false);
  assert.match(dup.errors.join(" "), /duplicate rule id: no-raw-sql/);

  const badRegex = parseRulebook(`version: 1
rules:
  - id: no-raw-sql
    description: SQL must use bound parameters everywhere.
    pattern: "sql\\\\(([unclosed"
`);
  assert.equal(badRegex.valid, false);
  assert.match(badRegex.errors.join(" "), /not a valid regular expression/);
});

test("the threshold floor and comment ceiling clamp any configuration", () => {
  const loose = resolvePolicy({ config: parseRulebook("version: 1\nconfidence:\n  threshold: 0.2\n  max_comments_per_pr: 50\n").config });
  assert.equal(loose.thresholdBp, toBp(THRESHOLD_FLOOR));
  assert.equal(loose.maxComments, MAX_COMMENTS_CEILING);

  const strict = resolvePolicy({ config: parseRulebook("version: 1\nconfidence:\n  threshold: 0.99\n  max_comments_per_pr: 1\n").config });
  assert.equal(strict.thresholdBp, 9_900);
  assert.equal(strict.maxComments, 1);
});

test("an installation override beats the rulebook, but the floor still applies", () => {
  const config = parseRulebook("version: 1\nconfidence:\n  threshold: 0.8\n").config;
  const raised = resolvePolicy({ config, installationThreshold: 0.95 });
  assert.equal(fromBp(raised.thresholdBp), 0.95);

  const lowered = resolvePolicy({ config, installationThreshold: 0.1 });
  assert.equal(lowered.thresholdBp, toBp(THRESHOLD_FLOOR));
});

test("a per-rule floor is never looser than the global threshold", () => {
  const config = parseRulebook(`version: 1
confidence:
  threshold: 0.9
rules:
  - id: soft-rule
    description: A rule whose author tried to make it fire on weak evidence.
    confidence_floor: 0.4
`).config;
  const policy = resolvePolicy({ config });
  assert.equal(effectiveThresholdBp(policy, "soft-rule"), 9_000);
  assert.equal(effectiveThresholdBp(policy, "unknown-rule"), 9_000);
});

test("a disabled rule is not handed to the model", () => {
  const config = parseRulebook(`version: 1
rules:
  - id: live-rule
    description: This rule is in force and should reach the prompt.
  - id: parked-rule
    enabled: false
    description: This rule is parked and should not reach the prompt.
`).config;
  const policy = resolvePolicy({ config });
  assert.deepEqual(policy.rules.map((r) => r.id), ["live-rule"]);
});
