/**
 * The two signing invariants, tested before anything else in the product was
 * built (BUILD.md: "these two invariants get tests before they get UI").
 *
 *  1. There is no code path that marks a note signed without a `signatures` row.
 *  2. A signed version is immutable.
 *
 * The first is a *source scan*, because it is a claim about the shape of the
 * codebase rather than about the behaviour of one function: a second module that
 * wrote `status: "signed"` would work perfectly and quietly destroy the product's
 * central promise. No runtime assertion inside `signNote` could ever catch that.
 * The database side of both invariants is covered against real Postgres in
 * `src/db/integrity.itest.ts` (`npm run test:db`).
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";

import {
  assertUnsigned,
  canonicalizeContent,
  contentHash,
  hasContent,
  hashMatches,
} from "@/lib/signing";

// `lib/env` reads secrets through lazy getters, so setting this here — after the
// imports, before any test runs — is enough. That laziness is also what lets
// `next build` import the module without a secret in the environment.
process.env.NOTE_HASH_SECRET ??= "test-note-hash-secret";

const SRC = join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const files = walk(SRC).map((full) => ({
  path: relative(SRC, full).replace(/\\/g, "/"),
  source: readFileSync(full, "utf8"),
}));

describe("invariant 1: nothing signs a note except signNote", () => {
  it("finds the source tree", () => {
    assert.ok(files.length > 30, `expected a real source tree, found ${files.length}`);
  });

  it("only lib/signing.ts writes a signed status", () => {
    const offenders = files
      .filter((f) => f.path !== "lib/signing.ts" && f.path !== "lib/signing.test.ts")
      // `status: "signed"` on a notes/sessions update is the only way to mark one.
      .filter((f) => /status:\s*"signed"/.test(f.source))
      .map((f) => f.path);
    assert.deepEqual(
      offenders,
      [],
      `these modules set a signed status outside lib/signing.ts: ${offenders.join(", ")}`,
    );
  });

  it("only lib/signing.ts inserts a signature row", () => {
    const offenders = files
      .filter((f) => !f.path.startsWith("lib/signing"))
      .filter((f) => /insert\((\s*)signatures/.test(f.source))
      .map((f) => f.path);
    assert.deepEqual(offenders, [], `signature inserts outside lib/signing.ts: ${offenders}`);
  });

  it("nothing scheduled or automated calls signNote", () => {
    // The pipeline, the cron route and the worker are the automated surfaces.
    for (const path of ["lib/pipeline.ts", "app/api/cron/tick/route.ts", "worker/index.ts"]) {
      const file = files.find((f) => f.path === path);
      assert.ok(file, `${path} should exist`);
      assert.ok(
        !/signNote|amendNote/.test(file!.source),
        `${path} must not be able to sign or amend a note`,
      );
    }
  });

  it("exactly one shipped route calls signNote", () => {
    const callers = files
      .filter((f) => !f.path.startsWith("lib/signing"))
      // Test suites exercise it directly by design; shipped code may not.
      .filter((f) => !/\.(test|itest)\.ts$/.test(f.path))
      .filter((f) => /\bsignNote\(/.test(f.source))
      .map((f) => f.path);
    assert.deepEqual(callers, ["app/api/notes/[id]/sign/route.ts"]);
  });
});

describe("invariant 2: signed content is guarded in code", () => {
  it("assertUnsigned throws for a signed note and passes otherwise", () => {
    assert.throws(() => assertUnsigned({ status: "signed" }), /signed and locked/);
    assert.doesNotThrow(() => assertUnsigned({ status: "draft" }));
    // An amendment in progress is editable — that is the whole point of one.
    assert.doesNotThrow(() => assertUnsigned({ status: "amended" }));
    assert.doesNotThrow(() => assertUnsigned({ status: "drafting" }));
  });

  it("every edit path calls the guard", () => {
    const notes = files.find((f) => f.path === "lib/notes.ts");
    assert.ok(notes);
    const mutators = notes!.source.match(/export async function (\w+)/g) ?? [];
    assert.ok(mutators.length >= 2, "expected the edit functions to exist");
    const guards = notes!.source.match(/assertUnsigned\(/g) ?? [];
    assert.ok(
      guards.length >= 2,
      "saveSection and regenerateSection must both call assertUnsigned",
    );
  });

  it("no module updates note_versions or signatures rows", () => {
    const offenders = files
      .filter((f) => !f.path.endsWith(".test.ts") && !f.path.endsWith(".itest.ts"))
      .filter((f) =>
        /update\(\s*(noteVersions|signatures)\s*\)|delete\(\s*(noteVersions|signatures)\s*\)/.test(
          f.source,
        ),
      )
      .map((f) => f.path);
    assert.deepEqual(offenders, [], `append-only tables mutated in: ${offenders}`);
  });
});

describe("content hashing", () => {
  const sections = [
    { key: "subjective", text: "Client reported a difficult week.", sourceSpans: [] },
    { key: "plan", text: "Thought record at onset.", sourceSpans: [] },
  ];

  it("is stable across whitespace and repeated calls", () => {
    const a = contentHash("note-1", 2, sections);
    const b = contentHash("note-1", 2, [
      { ...sections[0], text: "  Client reported   a difficult  week.  " },
      sections[1],
    ]);
    assert.equal(a, b, "whitespace must not change the hash");
    assert.equal(a, contentHash("note-1", 2, sections));
  });

  it("changes when the content changes", () => {
    const changed = [{ ...sections[0], text: "Client reported a good week." }, sections[1]];
    assert.notEqual(contentHash("note-1", 2, sections), contentHash("note-1", 2, changed));
  });

  it("is bound to the note and the version, so a hash cannot be replayed", () => {
    assert.notEqual(contentHash("note-1", 2, sections), contentHash("note-2", 2, sections));
    assert.notEqual(contentHash("note-1", 2, sections), contentHash("note-1", 3, sections));
  });

  it("ignores the source spans, which are not part of what was signed", () => {
    const withSpans = [
      { ...sections[0], sourceSpans: [{ startMs: 0, endMs: 1000 }] },
      sections[1],
    ];
    assert.equal(contentHash("note-1", 2, sections), contentHash("note-1", 2, withSpans));
  });

  it("canonicalises to a stable, readable shape", () => {
    assert.equal(
      canonicalizeContent("n", 1, [{ key: "plan", text: " a  b ", sourceSpans: [] }]),
      '{"noteId":"n","version":1,"sections":[{"key":"plan","text":"a b"}]}',
    );
  });

  it("compares hashes without leaking length or timing", () => {
    const h = contentHash("note-1", 2, sections);
    assert.ok(hashMatches(h, h));
    assert.ok(!hashMatches(h, `${h}0`));
    assert.ok(!hashMatches(h, h.replace(/.$/, "0")));
  });
});

describe("signing refuses an empty note", () => {
  it("hasContent is false for blank sections", () => {
    assert.equal(hasContent([]), false);
    assert.equal(hasContent([{ key: "plan", text: "   ", sourceSpans: [] }]), false);
    assert.equal(hasContent([{ key: "plan", text: "Signed.", sourceSpans: [] }]), true);
  });
});
