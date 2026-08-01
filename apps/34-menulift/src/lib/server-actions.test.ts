/**
 * Guards on the `"use server"` boundary.
 *
 * These are source-level checks, not behavioural ones, because both mistakes they
 * catch compile cleanly, build cleanly, and then break the app at runtime the
 * first time a real user touches it:
 *
 *  1. **A `"use server"` module may only export async functions.** Exporting a
 *     plain object (an initial form state, say) throws "A 'use server' file can
 *     only export async functions" during render — which is how the entire
 *     dashboard was broken here until a browser found it.
 *  2. **Every exported server action is a public HTTP endpoint.** One that nothing
 *     calls is attack surface, not dead code.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.join(import.meta.dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const files = walk(SRC);
const serverActionFiles = files.filter((f) => {
  const head = readFileSync(f, "utf8").slice(0, 200);
  return /^["']use server["']/m.test(head);
});

test("there are server-action modules to check", () => {
  assert.ok(serverActionFiles.length >= 6, `found ${serverActionFiles.length}`);
});

test("a 'use server' module exports only async functions", () => {
  const offenders: string[] = [];
  for (const file of serverActionFiles) {
    const source = readFileSync(file, "utf8");
    for (const line of source.split("\n")) {
      const match = /^export\s+(?!async\s+function)(?!type\b)(?!interface\b)(\S+)/.exec(line.trim());
      if (!match) continue;
      // `export { x } from "./types"` re-exports and `export default` are just as
      // unsafe here, so nothing is whitelisted.
      offenders.push(`${path.relative(SRC, file)}: ${line.trim()}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `these exports will throw at runtime, not at build time:\n${offenders.join("\n")}`,
  );
});

test("every exported server action is called somewhere", () => {
  const allSource = files
    .filter((f) => !serverActionFiles.includes(f) && !f.endsWith(".test.ts"))
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");

  const unused: string[] = [];
  for (const file of serverActionFiles) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/^export async function (\w+)/gm)) {
      const name = match[1];
      // A client component imports it, or another action file re-uses it.
      const referenced =
        allSource.includes(name) ||
        serverActionFiles
          .filter((other) => other !== file)
          .some((other) => readFileSync(other, "utf8").includes(name));
      if (!referenced) unused.push(`${path.relative(SRC, file)}: ${name}`);
    }
  }
  assert.deepEqual(
    unused,
    [],
    `unreferenced server actions are public endpoints with no caller — delete them:\n${unused.join("\n")}`,
  );
});
