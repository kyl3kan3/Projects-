/**
 * Fingerprint stability — the property the suppression promise rests on.
 *
 * If a fingerprint changes when code moves, every dismissal comes undone on the next
 * push and the bot repeats the nit it was told to drop. If it does not change when
 * the code genuinely changes, a fixed defect stays suppressed.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { fingerprint, normaliseSnippetLine } from "./fingerprint";

const base = {
  ruleId: "no-raw-sql",
  category: "security",
  filePath: "src/auth/session.ts",
  snippetLines: ["  const rows = await sql`select * from sessions where id = ${id}`;"],
};

test("the same defect keeps its fingerprint when the line moves", () => {
  // Line numbers are not part of the key, so an import added above changes nothing.
  assert.equal(fingerprint(base), fingerprint({ ...base }));
});

test("re-indenting or rewording a string does not resurrect a dismissal", () => {
  const reindented = { ...base, snippetLines: ["\tconst rows = await sql`select * from sessions where id = ${id}`;"] };
  assert.equal(fingerprint(base), fingerprint(reindented));

  const messageChanged = {
    ...base,
    snippetLines: ['  throw new Error("session missing"); // note'],
  };
  const messageChanged2 = {
    ...base,
    snippetLines: ['  throw new Error("no session found"); // different note'],
  };
  assert.equal(fingerprint(messageChanged), fingerprint(messageChanged2));
});

test("a different file, rule, or structure is a different fingerprint", () => {
  assert.notEqual(fingerprint(base), fingerprint({ ...base, filePath: "src/auth/token.ts" }));
  assert.notEqual(fingerprint(base), fingerprint({ ...base, ruleId: "no-string-sql" }));
  assert.notEqual(
    fingerprint(base),
    fingerprint({ ...base, snippetLines: ["  const rows = await db.query(SQL, [id]);"] }),
  );
});

test("a finding with no rule id is keyed by category, and the two never collide", () => {
  const noRule = { ...base, ruleId: null };
  assert.notEqual(fingerprint(base), fingerprint(noRule));
  assert.equal(fingerprint(noRule), fingerprint({ ...noRule, ruleId: null }));
  assert.notEqual(fingerprint(noRule), fingerprint({ ...noRule, category: "bug" }));
});

test("normalisation collapses the things that should not matter", () => {
  assert.equal(normaliseSnippetLine('  const a = "hello world";  '), 'const a = "…";');
  assert.equal(normaliseSnippetLine("x = 42 + 3.14"), "x = 0 + 0");
  assert.equal(normaliseSnippetLine("value = 1 // trailing comment"), "value = 0");
  assert.equal(normaliseSnippetLine("value = 1  # python comment"), "value = 0");
  // A URL's // must survive: it is part of the code, not a comment.
  assert.equal(normaliseSnippetLine('fetch("https://api.example.com")'), 'fetch("…")');
});

test("fingerprints are short, stable hex — usable as a comment marker", () => {
  const fp = fingerprint(base);
  assert.match(fp, /^[0-9a-f]{32}$/);
  assert.equal(fp, fingerprint(base));
});

test("a CRLF line and its LF twin fingerprint identically", () => {
  const crlf = { ...base, snippetLines: [(base.snippetLines[0] as string) + "\r"] };
  assert.equal(fingerprint(base), fingerprint(crlf));
});
