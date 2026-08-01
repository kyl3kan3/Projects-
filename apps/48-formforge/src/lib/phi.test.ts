/**
 * The architectural test ROADMAP.md asks for:
 *
 *   "Every read path that decrypts PHI appends a `viewed` audit event — proven by
 *    a test that fails when a route skips the helper."
 *
 * It is a source scan, because that is the only way to catch the defect it is
 * about. A route that decrypts a patient's name directly still *works*; what it
 * silently loses is the audit row, and no runtime assertion in that route would
 * ever notice. So this test reads the source tree and fails on any decryption
 * outside the audited helpers.
 *
 * The allowlist below is the whole design, written down: three modules may touch
 * raw plaintext, each for a stated reason. Adding a fourth is a deliberate act
 * that fails this test until someone justifies it here.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";

const SRC = join(process.cwd(), "src");

/**
 * Modules permitted to call the raw cipher.
 *
 *  - `lib/crypto.ts`  defines it
 *  - `lib/phi.ts`     is the audited wrapper every product read goes through
 *  - `lib/intakes.ts` merges a patient's own in-progress answers, and every one of
 *                     those paths writes its own `edited` audit row (saveSection,
 *                     completeIntake) — see the calls to appendAuditEvent there
 *  - `lib/uploads.ts` decrypts a filename alongside the bytes that `readPhiBytes`
 *                     already audited, so a second event would double-count
 *  - `lib/tick.ts`    reads a first name, email and phone to address a reminder;
 *                     the send itself is recorded as a `reminded` event
 */
const ALLOWED = new Set([
  "lib/crypto.ts",
  "lib/crypto.test.ts",
  "lib/phi.ts",
  "lib/phi.test.ts",
  "lib/intakes.ts",
  "lib/uploads.ts",
  "lib/tick.ts",
  "db/seed.ts",
  // The integration suite's whole job is to open the ciphertext by hand and prove
  // the wrong key fails — it must reach the raw cipher to test the raw cipher.
  "db/integrity.itest.ts",
]);

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

describe("PHI can only be decrypted through the audited helper", () => {
  it("finds the source tree", () => {
    assert.ok(files.length > 20, `expected a real source tree, found ${files.length} files`);
  });

  it("no module outside the allowlist imports the raw cipher", () => {
    const offenders = files
      .filter((f) => !ALLOWED.has(f.path))
      // `open`, `unwrapDek` and `practiceDek` are the three ways to reach plaintext.
      .filter((f) =>
        /import\s*\{[^}]*\b(open|unwrapDek)\b[^}]*\}\s*from\s*"@\/lib\/crypto"/.test(f.source) ||
        /import\s*\{[^}]*\bpracticeDek\b[^}]*\}\s*from\s*"@\/lib\/phi"/.test(f.source),
      )
      .map((f) => f.path);
    assert.deepEqual(
      offenders,
      [],
      `these modules reach plaintext without the audit hook:\n  ${offenders.join("\n  ")}`,
    );
  });

  it("nothing under src/app decrypts anything — routes and pages go through lib", () => {
    const offenders = files
      .filter((f) => f.path.startsWith("app/"))
      .filter((f) => /\bpracticeDek\b|\bunwrapDek\b|from "@\/lib\/crypto"/.test(f.source))
      .map((f) => f.path);
    assert.deepEqual(offenders, [], `pages/routes must not touch crypto: ${offenders.join(", ")}`);
  });

  it("every audited read helper writes its audit event in a finally block", () => {
    const phi = files.find((f) => f.path === "lib/phi.ts")!.source;
    // Three helpers, three finallys: an attempted read that throws is still logged.
    assert.equal((phi.match(/\} finally \{/g) ?? []).length, 2);
    assert.equal((phi.match(/action: "viewed"/g) ?? []).length, 2);
    assert.ok(phi.includes("export async function readOwnPhi"));
  });

  it("no client component can reach the database client", () => {
    // A "use client" file that imports @/db drags `postgres` into the browser
    // bundle. The pure display helpers in lib/format.ts exist for this reason.
    const offenders = files
      .filter((f) => /^\s*"use client"/.test(f.source))
      .filter((f) => /from "@\/db"|from "@\/lib\/(intakes|patients|forms|audit|exports|tick|uploads)"/.test(f.source))
      .map((f) => f.path);
    assert.deepEqual(offenders, [], `client components reaching server modules: ${offenders.join(", ")}`);
  });

  it("no source file contains a Date interpolated into a raw sql fragment", () => {
    // postgres.js calls Buffer.byteLength on whatever a raw fragment interpolates,
    // so a Date there throws at runtime and never at build time.
    const offenders = files
      .filter((f) => /sql`[^`]*\$\{[^}]*(At|Date|cutoff|since|now)\b[^}]*\}[^`]*`/.test(f.source))
      .filter((f) => !f.path.endsWith(".test.ts"))
      .map((f) => f.path);
    assert.deepEqual(offenders, [], `raw sql with a Date-looking binding: ${offenders.join(", ")}`);
  });

  it("no product screen claims HIPAA compliance, certification or a signed BAA", () => {
    // The product is "HIPAA-conscious", which describes engineering practice. A
    // stronger claim is the one marketing lie that could actually hurt this buyer,
    // so it is a test rather than a review note.
    //
    // Disclaimers necessarily contain the same phrases ("is not HIPAA certified",
    // "does not offer a signed BAA"), so a match only counts as a claim when the
    // preceding words are not a negation.
    const CLAIMS = [
      /HIPAA[- ]compliant/gi,
      /HIPAA[- ]certified/gi,
      /fully compliant/gi,
      /\bBAA included\b/gi,
      /\bsigned BAA\b/gi,
      /\bwe are compliant\b/gi,
      /\bcertified compliant\b/gi,
    ];
    const NEGATED =
      /(not|no|never|without|isn't|aren't|does not|doesn't|cannot|there is no|explicitly not|no such|yet|until|once)[\s\w,'’"“”\-()]{0,40}$/i;

    const offenders: string[] = [];
    for (const file of files) {
      if (file.path.endsWith(".test.ts")) continue;
      for (const pattern of CLAIMS) {
        for (const match of file.source.matchAll(pattern)) {
          const before = file.source.slice(Math.max(0, (match.index ?? 0) - 80), match.index);
          if (!NEGATED.test(before)) {
            offenders.push(`${file.path}: "${match[0]}" (context: …${before.slice(-50)})`);
          }
        }
      }
    }
    assert.deepEqual(offenders, [], `compliance claims found:\n  ${offenders.join("\n  ")}`);
  });
});
