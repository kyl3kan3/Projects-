/**
 * Path filters.
 *
 * An over-broad `exclude` silently switches review off for a whole tree, which is
 * the kind of thing nobody notices for a month, so the semantics are pinned here.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { matchesGlob, pathAllowed } from "./glob";

test("* stops at a path separator, ** does not", () => {
  assert.equal(matchesGlob("src/index.ts", "src/*.ts"), true);
  assert.equal(matchesGlob("src/lib/index.ts", "src/*.ts"), false);
  assert.equal(matchesGlob("src/lib/index.ts", "src/**/*.ts"), true);
  assert.equal(matchesGlob("src/index.ts", "src/**/*.ts"), true, "a/**/b must also match a/b");
  assert.equal(matchesGlob("src/a/b/c/index.ts", "src/**/*.ts"), true);
});

test("a trailing slash means everything underneath", () => {
  assert.equal(matchesGlob("dist/main.js", "dist/"), true);
  assert.equal(matchesGlob("dist/nested/main.js", "dist/"), true);
  assert.equal(matchesGlob("distribution/main.js", "dist/"), false);
});

test("suffix, alternation and single-character patterns", () => {
  assert.equal(matchesGlob("src/api.generated.ts", "**/*.generated.ts"), true);
  assert.equal(matchesGlob("src/api.ts", "**/*.generated.ts"), false);
  assert.equal(matchesGlob("src/main.tsx", "**/*.{ts,tsx}"), true);
  assert.equal(matchesGlob("src/main.js", "**/*.{ts,tsx}"), false);
  assert.equal(matchesGlob("v1/api.ts", "v?/api.ts"), true);
  assert.equal(matchesGlob("v10/api.ts", "v?/api.ts"), false);
});

test("dots are literal, not any-character", () => {
  assert.equal(matchesGlob("srcXindex.ts", "src.index.ts"), false);
  assert.equal(matchesGlob("src.index.ts", "src.index.ts"), true);
});

test("leading ./ and / are normalised on both sides", () => {
  assert.equal(matchesGlob("./src/index.ts", "src/*.ts"), true);
  assert.equal(matchesGlob("src/index.ts", "./src/*.ts"), true);
  assert.equal(matchesGlob("/src/index.ts", "src/*.ts"), true);
  assert.equal(matchesGlob("src\\index.ts", "src/*.ts"), true, "windows separators normalise");
});

test("exclude always wins, and an empty include means everything", () => {
  assert.equal(pathAllowed("src/index.ts", [], []), true);
  assert.equal(pathAllowed("dist/index.js", [], ["dist/**"]), false);
  assert.equal(pathAllowed("src/index.ts", ["src/**"], ["src/generated/**"]), true);
  assert.equal(pathAllowed("src/generated/api.ts", ["src/**"], ["src/generated/**"]), false);
  assert.equal(pathAllowed("docs/readme.md", ["src/**"], []), false);
});
