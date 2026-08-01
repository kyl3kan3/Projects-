/**
 * Diff parsing and anchoring.
 *
 * The most important tests in the app: a review comment on the wrong line is worse
 * than no comment, and every case here is one that has produced a wrong line in
 * some tool at some point — renames, CRLF, hunks with no additions, ranges that
 * straddle a hunk boundary, and the off-by-one in GitHub's `position`.
 *
 * `parse-diff` is used as an independent oracle for the line numbering: if our
 * parser and a third-party parser disagree about which post-image line an added
 * line is, one of them is wrong and the test says so.
 */

import assert from "node:assert/strict";
import test from "node:test";
import parseDiffLib from "parse-diff";
import { loadPatch, fixtureFile } from "./fixtures";
import { anchorFinding, isContextOnly, parsePatch, parseFiles, renderFileForModel } from "./parse";

test("parses hunk headers and assigns both-side line numbers", () => {
  const hunks = parsePatch(loadPatch("session-raw-sql"));
  assert.equal(hunks.length, 2);

  const first = hunks[0];
  assert.ok(first);
  assert.equal(first.oldStart, 108);
  assert.equal(first.oldLines, 7);
  assert.equal(first.newStart, 108);
  assert.equal(first.newLines, 12);

  // The first line of the hunk is context and exists on both sides.
  const firstLine = first.lines[0];
  assert.ok(firstLine);
  assert.equal(firstLine.kind, "context");
  assert.equal(firstLine.oldLine, 108);
  assert.equal(firstLine.newLine, 108);

  const deletion = first.lines.find((l) => l.kind === "del");
  assert.ok(deletion);
  assert.equal(deletion.newLine, null, "a deleted line has no post-image number");

  const addition = first.lines.find((l) => l.kind === "add");
  assert.ok(addition);
  assert.equal(addition.oldLine, null, "an added line has no pre-image number");
});

test("post-image line numbers agree with parse-diff on every added line", () => {
  for (const name of ["session-raw-sql", "multi-hunk", "renamed-with-changes", "real-readme-modified"]) {
    const patch = loadPatch(name);
    const ours = parsePatch(patch)
      .flatMap((h) => h.lines)
      .filter((l) => l.kind === "add")
      .map((l) => l.newLine);

    // parse-diff wants a full diff; the `diff --git` header is what it splits on.
    const [theirFile] = parseDiffLib(`diff --git a/x b/x\n--- a/x\n+++ b/x\n${patch}`);
    assert.ok(theirFile, `${name}: parse-diff returned nothing`);
    const theirs = theirFile.chunks
      .flatMap((c) => c.changes)
      .filter((c) => c.type === "add")
      .map((c) => (c as { ln: number }).ln);

    assert.deepEqual(ours, theirs, `${name}: added-line numbering disagrees with parse-diff`);
  }
});

test("position counts the @@ header lines, as GitHub's legacy API does", () => {
  const hunks = parsePatch(loadPatch("multi-hunk"));
  const first = hunks[0];
  const second = hunks[1];
  assert.ok(first && second);

  assert.equal(first.headerPosition, 1);
  assert.equal(first.lines[0]?.position, 2, "the line after the header is position 2");

  // The second header's position is one past the last line of the first hunk.
  const lastOfFirst = first.lines[first.lines.length - 1];
  assert.ok(lastOfFirst);
  assert.equal(second.headerPosition, lastOfFirst.position + 1);
});

test("CRLF is stripped from content but remembered on the line", () => {
  const file = fixtureFile({ path: "app/users.py", patch: loadPatch("crlf-python") });
  const added = file.hunks.flatMap((h) => h.lines).filter((l) => l.kind === "add");
  assert.ok(added.length >= 3);
  for (const line of added) {
    assert.ok(line.crlf, "fixture is a CRLF file, so every line should be flagged");
    assert.ok(!line.content.includes("\r"), "content must never carry a stray CR");
  }
  // A CR left in the content would break both anchoring and every regex detector.
  const cursor = added.find((l) => l.content.includes("cursor()"));
  assert.ok(cursor);
  assert.equal(cursor.content, "    cur = connection.cursor()");
});

test("a context-only hunk is recognised and yields no anchorable finding target", () => {
  const file = fixtureFile({ path: "api/handler.py", patch: loadPatch("context-only") });
  assert.equal(isContextOnly(file), true);
  assert.equal(file.additions, 0);

  // Context lines are addressable in GitHub's model, so an anchor on one is valid…
  const onContext = anchorFinding([file], { path: "api/handler.py", startLine: 13, endLine: 13 });
  assert.ok(onContext, "a context line inside a hunk is addressable");
  assert.equal(onContext.line, 13);

  // …but a line outside the hunk is not, and must be refused rather than snapped.
  assert.equal(anchorFinding([file], { path: "api/handler.py", startLine: 40, endLine: 40 }), null);
});

test('"\\ No newline at end of file" is not addressable and does not shift numbering', () => {
  const file = fixtureFile({ path: "config.js", patch: loadPatch("no-newline-at-eof") });
  const lines = file.hunks.flatMap((h) => h.lines);
  assert.ok(!lines.some((l) => l.content.startsWith(" No newline")));
  const additions = lines.filter((l) => l.kind === "add");
  assert.deepEqual(
    additions.map((l) => l.newLine),
    [3, 4],
  );
});

test("a rename anchors on the new path, and a finding quoting the old path follows it", () => {
  const file = fixtureFile({
    path: "src/billing/total.ts",
    previousPath: "src/total.ts",
    status: "renamed",
    patch: loadPatch("renamed-with-changes"),
  });

  const byNew = anchorFinding([file], { path: "src/billing/total.ts", startLine: 7, endLine: 7 });
  assert.ok(byNew);
  assert.equal(byNew.path, "src/billing/total.ts");

  const byOld = anchorFinding([file], { path: "src/total.ts", startLine: 7, endLine: 7 });
  assert.ok(byOld, "a finding that quotes the pre-rename path still belongs to the file");
  assert.equal(byOld.path, "src/billing/total.ts", "the comment must use the new path");
  assert.equal(byOld.line, byNew.line);
});

test("a deleted line's old number is never reinterpreted as a post-image line", () => {
  const file = fixtureFile({ path: "src/auth/session.ts", patch: loadPatch("session-raw-sql") });
  const deletion = file.hunks[0]?.lines.find((l) => l.kind === "del");
  assert.ok(deletion?.oldLine);

  // Line 111 exists on the pre-image side as the deleted `db.select()` line. On the
  // post-image it is a different line entirely, so an anchor there must describe the
  // post-image line — never the deletion.
  const anchor = anchorFinding([file], {
    path: "src/auth/session.ts",
    startLine: deletion.oldLine,
    endLine: deletion.oldLine,
  });
  assert.ok(anchor);
  assert.equal(anchor.side, "RIGHT");
  const target = anchor.lines[0];
  assert.ok(target);
  assert.notEqual(target.content, deletion.content);
  assert.equal(target.newLine, deletion.oldLine);
});

test("a multi-line anchor stays inside one hunk and is refused when it straddles", () => {
  const file = fixtureFile({ path: "src/orders.ts", patch: loadPatch("multi-hunk") });

  const within = anchorFinding([file], { path: "src/orders.ts", startLine: 5, endLine: 7 });
  assert.ok(within);
  assert.equal(within.startLine, 5);
  assert.equal(within.line, 7);
  assert.equal(within.startSide, "RIGHT");

  // 7 is in the first hunk, 34 in the second: the range covers lines GitHub will
  // not accept in one comment, and the gap between them is not in the diff at all.
  assert.equal(anchorFinding([file], { path: "src/orders.ts", startLine: 7, endLine: 34 }), null);
});

test("anchoring refuses nonsense ranges instead of guessing", () => {
  const file = fixtureFile({ path: "src/orders.ts", patch: loadPatch("multi-hunk") });
  const cases = [
    { startLine: 0, endLine: 0 },
    { startLine: 7, endLine: 5 },
    { startLine: 1.5, endLine: 1.5 },
    { startLine: 99_000, endLine: 99_000 },
  ];
  for (const range of cases) {
    assert.equal(
      anchorFinding([file], { path: "src/orders.ts", ...range }),
      null,
      `range ${range.startLine}-${range.endLine} should be refused`,
    );
  }
  assert.equal(anchorFinding([file], { path: "does/not/exist.ts", startLine: 5, endLine: 5 }), null);
});

test("a file with no patch (binary or too large) is never anchored", () => {
  const [file] = parseFiles([
    { filename: "assets/logo.png", status: "modified", additions: 0, deletions: 0, patch: null },
  ]);
  assert.ok(file);
  assert.equal(file.patchOmitted, true);
  assert.equal(anchorFinding([file], { path: "assets/logo.png", startLine: 1, endLine: 1 }), null);
});

test("real GitHub patches parse, and every added line is anchorable at its own number", () => {
  const files = parseFiles([
    { filename: "README.md", status: "modified", patch: loadPatch("real-readme-modified"), additions: 8, deletions: 25 },
    {
      filename: "apps/51-menocompass/ARCHITECTURE.md",
      status: "added",
      patch: loadPatch("real-added-file"),
      additions: 100,
      deletions: 0,
    },
  ]);

  for (const file of files) {
    const added = file.hunks.flatMap((h) => h.lines).filter((l) => l.kind === "add");
    assert.ok(added.length > 0, `${file.path} should have additions`);
    for (const line of added) {
      const anchor = anchorFinding(files, {
        path: file.path,
        startLine: line.newLine as number,
        endLine: line.newLine as number,
      });
      assert.ok(anchor, `${file.path}:${line.newLine} should be anchorable`);
      assert.equal(anchor.line, line.newLine);
      assert.equal(anchor.lines[0]?.content, line.content);
    }
  }
});

test("the model sees post-image line numbers, and deletions without one", () => {
  const file = fixtureFile({ path: "src/auth/session.ts", patch: loadPatch("session-raw-sql") });
  const rendered = renderFileForModel(file).split("\n");

  const addedRow = rendered.find((l) => l.includes("select * from sessions"));
  assert.ok(addedRow);
  assert.match(addedRow, /^\s*\d+\s\+/, "an added line is numbered and marked +");

  const deletedRow = rendered.find((l) => l.includes("db.select().from(sessions)"));
  assert.ok(deletedRow);
  assert.match(deletedRow, /^\s{5}\s-/, "a deleted line carries no number");
});

test("renderFileForModel truncates loudly rather than silently", () => {
  const file = fixtureFile({ path: "big.md", patch: loadPatch("real-added-file") });
  const rendered = renderFileForModel(file, 10);
  assert.ok(rendered.includes("truncated at 10 lines"));
  assert.ok(rendered.split("\n").length <= 12);
});
