/**
 * Comment rendering.
 *
 * Two things can do real damage here: a `suggestion` block whose line count does
 * not match the range it replaces (GitHub applies it verbatim, so the author
 * commits broken code in one click), and a summary comment that leaks the findings
 * the gate withheld.
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  extractFingerprint,
  renderDismissalAcknowledgement,
  renderInlineComment,
  renderRulebookCheck,
  renderSummaryComment,
  suggestionIsSafe,
} from "./comments";
import type { Anchor, DiffLine } from "../diff/parse";
import type { GatedFinding } from "../review/types";

function line(newLine: number, content: string): DiffLine {
  return { kind: "add", oldLine: null, newLine, content, crlf: false, position: newLine };
}

function anchorOf(lines: DiffLine[]): Anchor {
  const last = lines[lines.length - 1];
  const first = lines[0];
  if (!first || !last) throw new Error("need lines");
  return {
    path: "src/orders.ts",
    line: last.newLine as number,
    side: "RIGHT",
    position: last.position,
    lines,
    ...(lines.length > 1 ? { startLine: first.newLine as number, startSide: "RIGHT" as const } : {}),
  };
}

function finding(overrides: Partial<GatedFinding> = {}): GatedFinding {
  return {
    id: "f1",
    category: "bug",
    ruleId: null,
    filePath: "src/orders.ts",
    startLine: 31,
    endLine: 31,
    title: "Loose equality against a falsy literal",
    body: "`==` coerces, so this accepts values the check does not intend to accept.",
    suggestedPatch: '  if (order.dueAt === null) {',
    confidenceBp: 8_600,
    scoreReason: "pattern present",
    fingerprint: "a".repeat(32),
    anchor: anchorOf([line(31, "  if (order.dueAt == null) {")]),
    posted: true,
    dropReason: null,
    suppressionId: null,
    ...overrides,
  };
}

test("a single anchored line may be replaced by a few lines, but not by a wall", () => {
  const single = anchorOf([line(31, "  x();")]);
  assert.equal(suggestionIsSafe(single, "  y();"), true);
  assert.equal(suggestionIsSafe(single, ["a", "b", "c"].join("\n")), true);
  assert.equal(suggestionIsSafe(single, Array.from({ length: 9 }, (_, i) => `l${i}`).join("\n")), false);
});

test("a multi-line anchor must be replaced one-for-one", () => {
  const range = anchorOf([line(31, "  a();"), line(32, "  b();"), line(33, "  c();")]);
  assert.equal(suggestionIsSafe(range, "  a2();\n  b2();\n  c2();"), true);
  assert.equal(suggestionIsSafe(range, "  a2();\n  b2();"), false, "dropping a line would shift the code below");
  assert.equal(suggestionIsSafe(range, "  a2();\n  b2();\n  c2();\n  d2();"), false);
});

test("an inline comment states the defect, the evidence, the fix and its audit line", () => {
  const body = renderInlineComment({
    finding: finding({ ruleId: "no-loose-equality" }),
    anchor: finding().anchor as Anchor,
    rulebookVersion: 12,
    fakeModel: false,
    includeSuggestion: true,
  });

  assert.match(body, /\*\*BUG\*\* · Loose equality/);
  assert.match(body, /```suggestion\n {2}if \(order\.dueAt === null\) \{\n```/);
  assert.match(body, /rule `no-loose-equality` · rulebook v12 · confidence `0\.86`/);
  assert.match(body, /mergemate ignore/, "the dismissal instruction is always present");
  assert.equal(extractFingerprint(body), "a".repeat(32));
  assert.ok(!body.includes("pattern fallback"));
});

test("a review produced without a model says so in every comment", () => {
  const body = renderInlineComment({
    finding: finding(),
    anchor: finding().anchor as Anchor,
    rulebookVersion: null,
    fakeModel: true,
    includeSuggestion: false,
  });
  assert.match(body, /pattern fallback \(no model configured\)/);
  assert.ok(!body.includes("```suggestion"));
});

test("the summary comment names only posted findings and never hedges", () => {
  const body = renderSummaryComment({
    prTitle: "fix: session refresh race",
    prNumber: 482,
    posted: [finding()],
    rulebookVersion: 12,
    rulebookInvalid: false,
    model: "claude-sonnet-5",
    fakeModel: false,
    costMicroUsd: 62_000,
    latencyMs: 41_200,
    dashboardUrl: "https://mergemate.dev",
    repoFullName: "acme/checkout",
    truncatedFiles: [],
    seatNotice: null,
  });

  assert.match(body, /1 finding on this diff/);
  assert.match(body, /`src\/orders\.ts:31`/);
  assert.match(body, /rulebook v12 · model `claude-sonnet-5` · \$0\.062 · 41\.2s/);
  assert.ok(!/might|possibly|consider also|low confidence|gated/i.test(body));
  assert.equal(extractFingerprint(body), null, "the summary marker is not a finding fingerprint");
  assert.match(body, /<!-- mergemate:pr-482 -->/);
});

test("a clean summary is unambiguous, and an invalid rulebook is disclosed", () => {
  const body = renderSummaryComment({
    prTitle: "chore: bump deps",
    prNumber: 12,
    posted: [],
    rulebookVersion: 7,
    rulebookInvalid: true,
    model: "claude-sonnet-5",
    fakeModel: false,
    costMicroUsd: 41_000,
    latencyMs: 12_000,
    dashboardUrl: "https://mergemate.dev",
    repoFullName: "acme/checkout",
    truncatedFiles: [],
    seatNotice: null,
  });
  assert.match(body, /nothing to raise on this diff/);
  assert.match(body, /does not validate, so this review used the last version that did/);
});

test("a seat notice appears in the summary rather than as its own comment", () => {
  const body = renderSummaryComment({
    prTitle: "feat: add webhook",
    prNumber: 99,
    posted: [finding()],
    rulebookVersion: null,
    rulebookInvalid: false,
    model: "claude-sonnet-5",
    fakeModel: false,
    costMicroUsd: 30_000,
    latencyMs: 9_000,
    dashboardUrl: "https://mergemate.dev",
    repoFullName: "acme/checkout",
    truncatedFiles: [],
    seatNotice: "This installation has 9 active pull-request authors this month against 8 paid seats.",
  });
  assert.match(body, /9 active pull-request authors/);
  assert.match(body, /no rulebook/);
});

test("a long list of skipped files is capped, not dumped into the comment", () => {
  const files = Array.from({ length: 41 }, (_, i) => `apps/pkg-${i}/README.md`);
  const body = renderSummaryComment({
    prTitle: "chore: import a monorepo",
    prNumber: 1,
    posted: [finding()],
    rulebookVersion: null,
    rulebookInvalid: false,
    model: "claude-sonnet-5",
    fakeModel: false,
    costMicroUsd: 90_000,
    latencyMs: 60_000,
    dashboardUrl: "https://mergemate.dev",
    repoFullName: "acme/monorepo",
    truncatedFiles: files,
    seatNotice: null,
  });
  assert.match(body, /41 files were not reviewed/);
  assert.match(body, /and 36 more/);
  assert.equal((body.match(/apps\/pkg-\d+\/README\.md/g) ?? []).length, 5);
  assert.ok(body.length < 1_200, "the summary comment stays readable on a phone");
});

test("the dismissal acknowledgement is appended once and only once", () => {
  const original = "**BUG** · something\n\n<sub>rule `x`</sub>";
  const once = renderDismissalAcknowledgement(original);
  assert.match(once, /will not raise this again/);
  assert.equal(renderDismissalAcknowledgement(once), once);
});

test("the rulebook check is a success or a failure with the reasons", () => {
  const ok = renderRulebookCheck({ version: 13, valid: true, errors: [], ruleCount: 4 });
  assert.equal(ok.conclusion, "success");
  assert.match(ok.title, /Rulebook v13 active/);
  assert.match(ok.summary, /4 rules in force/);

  const bad = renderRulebookCheck({
    version: 14,
    valid: false,
    errors: ["confidence.threshold: Number must be less than or equal to 1"],
    ruleCount: 0,
  });
  assert.equal(bad.conclusion, "failure");
  assert.match(bad.summary, /reviews continue on the last version that validated/);
  assert.match(bad.summary, /threshold/);
});
