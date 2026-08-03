#!/usr/bin/env node
/**
 * The craft check — this app's `npm run lint`.
 *
 * ESLint is not runnable here: the shared toolchain provides no
 * `eslint-config-next` and no TypeScript parser, so `eslint .` can only ever
 * error. Rather than ship a lint script that always fails, this enforces the
 * rules that actually govern the codebase and that a type-checker cannot see —
 * the ones DESIGN.md, DESIGN_LANGUAGE.md and the portfolio brief make binding.
 *
 * Run it with `npm run lint`. It exits non-zero on any violation.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const SRC = join(ROOT, "src");

const failures = [];
const fail = (file, line, message) =>
  failures.push(`${relative(ROOT, file)}${line ? `:${line}` : ""}  ${message}`);

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.(ts|tsx|css)$/.test(entry)) out.push(path);
  }
  return out;
}

const files = walk(SRC);
const isTest = (f) => /\.test\.tsx?$/.test(f);
const isProduct = (f) => !isTest(f);

/* 1. No emoji anywhere in product UI, Slack messages or PR comments. */
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/u;
for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    // The regex ranges above include the arrows this codebase uses in prose
    // (→, ←) and the ellipsis; those are typography, not emoji.
    const stripped = line.replace(/[→←↔…—–·]/g, "");
    if (EMOJI.test(stripped)) fail(file, i + 1, `emoji in source: ${line.trim().slice(0, 60)}`);
  });
}

/* 2. No stub idioms left behind. */
for (const file of files.filter(isProduct)) {
  const text = readFileSync(file, "utf8");
  if (/throw new Error\(["']Not implemented/.test(text)) {
    fail(file, null, "`throw new Error(\"Not implemented\")` — Next prerenders pages, so this fails the build");
  }
  if (/^\s*export \{\};\s*$/m.test(text) && !/export (const|function|class|type|interface|default)/.test(text)) {
    fail(file, null, "bare `export {}` with nothing else exported — a stub, not a module");
  }
  if (/\bTODO:/.test(text)) fail(file, null, "a TODO: marker survived into a shipped file");
}

/* 3. A client component must never reach the database client. */
for (const file of files.filter((f) => /\.tsx?$/.test(f))) {
  const text = readFileSync(file, "utf8");
  if (!/^["']use client["'];/m.test(text)) continue;
  for (const bad of ['from "@/db"', 'from "@/db/', 'from "@/lib/queries"', 'from "@/lib/ingest"', 'from "@/lib/auth"']) {
    if (text.includes(bad)) {
      fail(file, null, `client component imports ${bad} — that pulls postgres into the browser bundle`);
    }
  }
}

/* 4. Colour discipline: only DESIGN.md's palette, declared in globals.css. */
const css = readFileSync(join(SRC, "app/globals.css"), "utf8");
const declared = new Set(
  [...css.matchAll(/#[0-9a-fA-F]{6}/g)].map((m) => m[0].toLowerCase()),
);
for (const file of files.filter((f) => /\.tsx$/.test(f))) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(/#[0-9a-fA-F]{6}/g)) {
    const hex = match[0].toLowerCase();
    if (!declared.has(hex)) fail(file, null, `hex ${hex} is not in globals.css — components use var(--color-…)`);
  }
}

/* 5. No purple, ever — hue 250-310 is banned outright (rule 11). */
for (const hex of declared) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 0.04) continue; // greys have no meaningful hue
  let hue = 0;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  hue = (hue * 60 + 360) % 360;
  if (hue >= 250 && hue <= 310) {
    fail(join(SRC, "app/globals.css"), null, `${hex} is hue ${Math.round(hue)}deg — purple is banned (DESIGN_LANGUAGE rule 11)`);
  }
}

/* 6. Every spacing value in CSS is on the 4px scale. */
const SCALE = new Set([0, 1, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 56, 80]);
for (const match of css.matchAll(/(?:padding|margin|gap)(?:-[a-z]+)?:\s*([^;]+);/g)) {
  for (const token of match[1].split(/\s+/)) {
    const px = /^(\d+)px$/.exec(token);
    if (px && !SCALE.has(Number(px[1]))) {
      fail(join(SRC, "app/globals.css"), null, `${token} is off the 4px spacing scale (${match[0].trim()})`);
    }
  }
}

if (failures.length > 0) {
  console.error(`craft-check: ${failures.length} problem${failures.length === 1 ? "" : "s"}\n`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`craft-check: clean (${files.length} files)`);
