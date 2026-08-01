/**
 * Context expansion and the diff budget.
 *
 * The budget is a cost control: an unbounded expansion on a 180-file pull request is
 * how a $0.06 review becomes a $2 review. It also has to fail *loudly* — a review
 * that silently skipped half the diff is worse than one that admits it.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { budgetFiles, contextRanges, renderContext } from "./context";
import { fixtureFile, loadPatch } from "./fixtures";

const session = fixtureFile({ path: "src/auth/session.ts", patch: loadPatch("session-raw-sql") });

test("context ranges are padded and merged, never overlapping", () => {
  const ranges = contextRanges(session, 12);
  assert.equal(ranges.length, 2, "the two hunks are 30 lines apart, so they stay separate");
  for (let i = 1; i < ranges.length; i++) {
    assert.ok((ranges[i]?.start ?? 0) > (ranges[i - 1]?.end ?? 0));
  }

  // With enough padding the two hunks become one range.
  const merged = contextRanges(session, 30);
  assert.equal(merged.length, 1);
});

test("context is numbered with post-image line numbers", () => {
  const body = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`).join("\n");
  const rendered = renderContext(session, body, { padding: 3, maxLinesPerFile: 40 });
  assert.match(rendered, /@@ lines 105-\d+ @@/);
  assert.match(rendered, /^\s+105 {2}line 105$/m);
});

test("context truncation is stated, not silent", () => {
  const body = Array.from({ length: 400 }, (_, i) => `line ${i + 1}`).join("\n");
  const rendered = renderContext(session, body, { padding: 40, maxLinesPerFile: 20 });
  assert.match(rendered, /context truncated at 20 lines/);
});

test("a file shorter than the hunk claims does not crash or invent lines", () => {
  const rendered = renderContext(session, "one\ntwo\nthree");
  assert.ok(!rendered.includes("undefined"));
});

test("the budget spends on the smallest diffs first and names what it skipped", () => {
  const lockfile = `@@ -1,1 +1,501 @@\n const a = 0;\n${Array.from({ length: 500 }, (_, i) => `+const v${i} = ${i};`).join("\n")}\n`;
  const files = [
    fixtureFile({ path: "package-lock.json", patch: lockfile }),
    session,
  ];
  const { included, skipped } = budgetFiles(files, 60);
  assert.deepEqual(included.map((f) => f.path), ["src/auth/session.ts"]);
  assert.deepEqual(skipped, ["package-lock.json"]);
});

test("at least one file is always reviewed, even if it blows the budget alone", () => {
  const { included, skipped } = budgetFiles([session], 1);
  assert.equal(included.length, 1);
  assert.deepEqual(skipped, []);
});

test("binary and deleted files are excluded from review but reported", () => {
  const binary = fixtureFile({ path: "public/logo.png", patch: "" });
  const removed = fixtureFile({ path: "src/old.ts", patch: loadPatch("multi-hunk"), status: "removed" });
  const { included, skipped } = budgetFiles([binary, removed, session], 3_000);
  assert.deepEqual(included.map((f) => f.path), ["src/auth/session.ts"]);
  assert.deepEqual(skipped, ["public/logo.png"], "a deleted file is not something to report as skipped");
});

test("the included files keep the diff's own order", () => {
  const a = fixtureFile({ path: "a.ts", patch: loadPatch("multi-hunk") });
  const b = fixtureFile({ path: "b.ts", patch: loadPatch("no-newline-at-eof") });
  const { included } = budgetFiles([a, b], 3_000);
  assert.deepEqual(included.map((f) => f.path), ["a.ts", "b.ts"]);
});
