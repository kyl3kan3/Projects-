#!/usr/bin/env node
/**
 * tools/craft-check.mjs — `npm run craft`
 *
 * The checks a type-checker cannot make and `next build` will not fail on.
 * Dependency-free on purpose; it walks `src/` and turns DESIGN.md,
 * DESIGN_LANGUAGE.md and MARKETING_PLAYBOOK.md into assertions:
 *
 *  1. No colour literal outside globals.css. Tokens exist so a screen cannot
 *     invent a hue; this is how that stops being a promise.
 *  2. No purple (hue 250–310) and no framework-default palette hex, anywhere.
 *  3. No emoji in product UI.
 *  4. Every inline padding/margin/gap is on the spacing scale.
 *  5. No client component may reach the database client — that is exactly how
 *     `postgres`, `net` and `tls` end up in a browser bundle. It happened once in
 *     this app (the map editor importing lib/units for its size list) and failed
 *     the production build outright.
 *  6. Every exported "use server" function is called from somewhere. An unused one
 *     is a public endpoint nothing needs.
 *  7. No `Date` interpolated into a raw `sql` fragment: it bypasses Drizzle's
 *     column encoder and throws inside postgres.js at runtime, which nothing in
 *     the build catches.
 *  8. No `new Date("yyyy-mm-dd")`: that is midnight UTC, which is the previous day
 *     west of Greenwich, and this product's whole domain is calendar dates that a
 *     court counts. `lib/money.ts` owns the arithmetic.
 *  9. Only the three radii DESIGN.md names, and only in globals.css.
 * 10. The accent never fills a surface: `--color-rolldoor` may not appear as a
 *     `background`. DESIGN.md is explicit — rolldoor marks overdue and active,
 *     never buttons or surfaces. The overdue door fill is `rolldoor-strong`, which
 *     is the AA-corrected value its concrete label needs.
 * 11. One CTA phrase, verbatim (MARKETING_PLAYBOOK law 7). Any "Start free" on a
 *     marketing surface must read exactly "Start free — 14 days".
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

/* --- which modules reach the database, transitively? --- */

const imports = new Map();
for (const file of files) {
  if (!/\.tsx?$/.test(file)) continue;
  const source = read(file);
  const found = [];
  for (const m of source.matchAll(/(?:^|\n)\s*import\s+([^;]*?)from\s+["'](@\/[^"']+)["']/g)) {
    // `import type { X } from` is erased by the compiler and cannot pull a runtime
    // module into a bundle, so it is not an edge.
    if (/^\s*type\s/.test(m[1])) continue;
    found.push(m[2]);
  }
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
  // A "use server" module imported by a client component is replaced with a
  // reference at build time, so it is not an edge into the browser bundle.
  const source = read(file);
  if (seen.size > 1 && /^\s*["']use server["']/.test(source)) {
    reachesDb.set(file, false);
    return false;
  }
  let result = /src\/db\/index\.ts$/.test(file);
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

/* --- the literal checks --- */

const HEX = /#[0-9a-fA-F]{6}\b/g;
const FRAMEWORK_HEXES = new Set(
  [
    "#8b5cf6", "#2dd4bf", "#4ade80", "#38bdf8", "#2563eb", "#10b981", "#6366f1",
    "#a855f7", "#ec4899", "#f43f5e", "#0ea5e9", "#22c55e", "#eab308", "#3b82f6",
    "#007bff", "#6610f2", "#6f42c1", "#e83e8c", "#f472b6", "#818cf8",
  ].map((h) => h.toLowerCase()),
);
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F000}-\u{1F0FF}]/u;
/**
 * The 4px scale from DESIGN_LANGUAGE rule 5, plus the two half-steps DESIGN.md
 * names explicitly: 2px (the map's grid gaps, which are gaps and not borders) and
 * 6px (inside a 72px door tile, where a 4px inset reads as no inset at all).
 */
const SCALE = new Set([0, 2, 4, 6, 8, 12, 16, 20, 24, 32, 40, 56, 80]);
/** Three radii: 6 cards/inputs, 3 map doors, 999 dots (DESIGN.md). */
const RADII = new Set(["6px", "3px", "999px", "0"]);
const CTA = "Start free — 14 days";

function hueOf(hex) {
  const h = hex.replace("#", "");
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
  const isTokens = /globals\.css$/.test(file);
  const isClient = /^\s*["']use client["']/.test(source);
  const isTest = /\.test\.ts$/.test(file);
  // lib/theme.ts holds the single literal that platform metadata needs; its header
  // explains why it cannot be a CSS custom property.
  const isThemeToken = /src\/lib\/theme\.ts$/.test(file);
  // Tracks the selector a CSS property belongs to, so "the accent never fills a
  // surface" can tell a component's background from a 4px decorative mark.
  let selector = "";

  let inBlockComment = false;
  lines.forEach((line, i) => {
    const n = i + 1;
    // Comments describe hazards; they do not commit them.
    const trimmed = line.trim();
    const wasInBlock = inBlockComment;
    if (inBlockComment && trimmed.includes("*/")) inBlockComment = false;
    else if (!inBlockComment && /\/\*/.test(trimmed) && !trimmed.includes("*/")) inBlockComment = true;
    if (wasInBlock || trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
      return;
    }

    for (const hex of line.match(HEX) ?? []) {
      const lower = hex.toLowerCase();
      if (FRAMEWORK_HEXES.has(lower)) fail(file, n, `framework-default palette hex ${hex}`);
      const hue = hueOf(lower);
      if (hue !== null && hue >= 250 && hue <= 310) {
        fail(file, n, `purple hue (${hue}deg) in ${hex}`);
      }
      if (!isTokens && !isTest && !isThemeToken) {
        fail(file, n, `colour literal ${hex} outside globals.css`);
      }
    }

    if (EMOJI.test(line) && !isTest) fail(file, n, "emoji in source");

    for (const m of line.matchAll(
      /\b(padding|margin|gap|rowGap|columnGap)(?:Top|Bottom|Left|Right)?:\s*(\d+)\b/g,
    )) {
      const value = Number(m[2]);
      if (!SCALE.has(value)) fail(file, n, `${m[1]}: ${value} is off the spacing scale`);
    }

    if (/sql`/.test(line) && /\bnew Date\(/.test(line)) {
      fail(
        file,
        n,
        "a Date interpolated into a raw sql fragment — use a typed operator or an ISO string with an explicit ::timestamptz cast",
      );
    }

    if (/new Date\(\s*["'`]\d{4}-\d{2}-\d{2}["'`]\s*\)/.test(line) && !isTest) {
      fail(
        file,
        n,
        'new Date("yyyy-mm-dd") is midnight UTC and moves the date west of Greenwich — use lib/money.ts',
      );
    }

    if (isTokens && trimmed.endsWith("{")) selector = trimmed;
    if (/background(?:-color)?:\s*var\(--color-rolldoor\)/.test(line)) {
      // A pseudo-element dot or a legend swatch is a mark, which is exactly what
      // DESIGN.md rations the accent to. A named component surface is not.
      const isMark = /::(before|after)|\.dot\b|\.legend-swatch\b/.test(selector);
      if (!isMark) {
        fail(
          file,
          n,
          "the accent fills a surface — rolldoor marks overdue and active, never a surface (DESIGN.md); use rolldoor-strong for a fill that carries a label",
        );
      }
    }

    if (/Start free/.test(line) && !line.includes(CTA) && !/const CTA = /.test(line)) {
      fail(file, n, `the CTA phrase must read exactly "${CTA}" (MARKETING_PLAYBOOK law 7)`);
    }

    if (isTokens) {
      for (const m of line.matchAll(/border-radius:\s*([^;]+);/g)) {
        const value = m[1].trim();
        if (!value.startsWith("var(") && !RADII.has(value)) {
          fail(file, n, `radius ${value} is not one of the three DESIGN.md names`);
        }
      }
    }
  });

  if (isClient && touchesDb(file)) {
    fail(file, 1, 'a "use client" component transitively imports @/db — extract the pure part');
  }
}

/* --- unused server actions --- */

const actionFiles = files.filter((f) => /\.tsx?$/.test(f) && /^\s*["']use server["']/.test(read(f)));
const allSource = files.map(read).join("\n");
for (const file of actionFiles) {
  for (const m of read(file).matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) {
    const name = m[1];
    const uses = allSource.split(new RegExp(`\\b${name}\\b`)).length - 1;
    if (uses < 2) {
      fail(file, 1, `exported server action ${name} is never called — delete it, it is attack surface`);
    }
  }
}

if (problems.length === 0) {
  console.log("craft-check: clean");
  process.exit(0);
}
console.log(`craft-check: ${problems.length} problem(s)`);
for (const p of problems) console.log(`  ${p}`);
process.exit(1);
