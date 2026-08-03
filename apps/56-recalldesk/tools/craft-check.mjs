#!/usr/bin/env node
/**
 * tools/craft-check.mjs — `node tools/craft-check.mjs`
 *
 * The checks a type-checker cannot make and `next build` will not fail on.
 * Dependency-free on purpose; it walks `src/` and reads the rules out of
 * DESIGN.md and DESIGN_LANGUAGE.md as assertions:
 *
 *  1. No colour literal outside globals.css. Tokens exist so a screen cannot
 *     invent a hue, and this is how that stops being a promise.
 *  2. No purple, and no framework-default palette hex, anywhere.
 *  3. No emoji in product UI.
 *  4. Every padding/margin/gap is on the 4px scale.
 *  5. No client component can reach the database client — that is how `postgres`
 *     ends up in a browser bundle.
 *  6. Every exported "use server" action is actually called from somewhere. An
 *     unused one is a public endpoint nothing needs.
 *  7. No `Date` interpolated into a raw `sql` fragment: it bypasses Drizzle's
 *     column encoder and throws inside postgres.js at runtime, which nothing in
 *     the build catches.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const SRC = join(ROOT, "src");

const problems = [];
const files = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    if (/\.(ts|tsx|css)$/.test(full)) files.push(full);
  }
}
walk(SRC);

const read = (f) => readFileSync(f, "utf8");
const rel = (f) => relative(ROOT, f);
const fail = (file, line, message) => problems.push(`${rel(file)}:${line} ${message}`);

/** Which modules reach the database, transitively? */
const imports = new Map();
for (const file of files) {
  if (!/\.tsx?$/.test(file)) continue;
  const found = [...read(file).matchAll(/from\s+["'](@\/[^"']+)["']/g)].map((m) => m[1]);
  imports.set(file, found);
}

function resolveAlias(spec) {
  const base = join(SRC, spec.slice(2));
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (files.includes(candidate)) return candidate;
  }
  return null;
}

const reachesDb = new Map();
function touchesDb(file, seen = new Set()) {
  if (reachesDb.has(file)) return reachesDb.get(file);
  if (seen.has(file)) return false;
  seen.add(file);
  const isDbClient = /src\/db\/index\.ts$/.test(file);
  let result = isDbClient;
  if (!result) {
    for (const spec of imports.get(file) ?? []) {
      const target = resolveAlias(spec);
      if (target && touchesDb(target, seen)) {
        result = true;
        break;
      }
    }
  }
  reachesDb.set(file, result);
  return result;
}

const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const FRAMEWORK_HEXES = new Set(
  [
    "#8b5cf6", "#2dd4bf", "#4ade80", "#38bdf8", "#2563eb", "#10b981", "#6366f1",
    "#a855f7", "#ec4899", "#f43f5e", "#0ea5e9", "#22c55e", "#eab308", "#3b82f6",
    "#007bff", "#6610f2", "#6f42c1", "#e83e8c",
  ].map((h) => h.toLowerCase()),
);
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F000}-\u{1F0FF}]/u;
const SCALE = new Set([0, 1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 56, 80, 96, 120]);

function hueOf(hex) {
  const h = hex.replace("#", "");
  if (h.length !== 6) return null;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return null;
  const d = max - min;
  let hue;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  hue = Math.round(hue * 60);
  return hue < 0 ? hue + 360 : hue;
}

for (const file of files) {
  const source = read(file);
  const lines = source.split("\n");
  // globals.css owns the palette; lib/theme.ts owns the single copy platform
  // metadata needs (see its header).
  const isCssTokens = /globals\.css$/.test(file) || /src\/lib\/theme\.ts$/.test(file);
  const isClient = /^\s*["']use client["']/.test(source);
  const isTest = /\.test\.ts$/.test(file);

  lines.forEach((line, i) => {
    const n = i + 1;

    // 1 + 2. colour literals
    for (const hex of line.match(HEX) ?? []) {
      const lower = hex.toLowerCase();
      if (FRAMEWORK_HEXES.has(lower)) fail(file, n, `framework-default palette hex ${hex}`);
      const hue = hueOf(lower);
      if (hue !== null && hue >= 250 && hue <= 310) fail(file, n, `purple hue (${hue}deg) in ${hex}`);
      if (!isCssTokens && !/^#[0-9a-fA-F]{6}$/.test(hex) === false && !isTest) {
        // A six-digit hex outside globals.css means a component mixed its own colour.
        if (!/svg|icon\.svg/i.test(file)) fail(file, n, `colour literal ${hex} outside globals.css`);
      }
    }

    // 3. emoji in product UI
    if (EMOJI.test(line) && !isTest) fail(file, n, "emoji in source");

    // 4. off-scale spacing in inline styles
    for (const m of line.matchAll(/\b(padding|margin|gap|rowGap|columnGap)(?:Top|Bottom|Left|Right)?:\s*(\d+)\b/g)) {
      const value = Number(m[2]);
      if (!SCALE.has(value)) fail(file, n, `${m[1]}: ${value} is off the 4px spacing scale`);
    }

    // 7. a Date inside a raw sql fragment
    if (/sql`/.test(line) && /\bnew Date\(/.test(line)) {
      fail(file, n, "a Date interpolated into a raw sql fragment — use a typed operator or an ISO string with ::timestamptz");
    }
  });

  // 5. client components must not reach the db client
  if (isClient && touchesDb(file)) {
    fail(file, 1, 'a "use client" component transitively imports @/db — extract the pure part');
  }
}

// 6. unused server actions
const actionFiles = files.filter((f) => /\.tsx?$/.test(f) && /^\s*["']use server["']/.test(read(f)));
const allSource = files.map(read).join("\n");
for (const file of actionFiles) {
  for (const m of read(file).matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) {
    const name = m[1];
    const uses = allSource.split(new RegExp(`\\b${name}\\b`)).length - 1;
    // One for the declaration, one for at least one call site.
    if (uses < 2) fail(file, 1, `exported server action ${name} is never called — delete it, it is attack surface`);
  }
}

if (problems.length === 0) {
  console.log("craft-check: clean");
  process.exit(0);
}
console.log(`craft-check: ${problems.length} problem(s)`);
for (const p of problems) console.log(`  ${p}`);
process.exit(1);
