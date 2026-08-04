#!/usr/bin/env node
/**
 * tools/craft-check.mjs — `npm run craft`
 *
 * The checks a type-checker cannot make and `next build` will not fail on.
 * Dependency-free on purpose; it walks `src/` and turns DESIGN.md,
 * DESIGN_LANGUAGE.md and a list of defects that shipped inside green builds
 * elsewhere in this portfolio into assertions.
 *
 *   1. No colour literal outside `globals.css`. Tokens exist so a screen cannot
 *      invent a hue; this is how that stops being a promise. `lib/theme.ts`,
 *      `lib/contracts.ts` and `lib/demo-photo.ts` are exempt and each says why.
 *   2. No purple (hue 250-310) and no framework-default palette hex, anywhere.
 *   3. No emoji in product UI.
 *   4. Every inline padding/margin/gap is on the 4px scale.
 *   5. Only the three radii DESIGN.md names (8 cards/inputs, 6 chips, 2 gauges).
 *   6. No client component may reach the database client — that is exactly how
 *      `postgres`, `net` and `tls` end up in a browser bundle.
 *   7. Every exported `"use server"` function is called somewhere. An unused one
 *      is a public endpoint nothing needs.
 *   8. A `"use server"` module exports **only functions**. A constant exported
 *      beside the actions compiles, then arrives `undefined` on the client and
 *      crashes the screen on first interaction.
 *   9. No `Date` interpolated into a raw `sql` fragment: it bypasses Drizzle's
 *      column encoder and throws inside postgres.js at runtime, which nothing in
 *      the build catches.
 *  10. Money columns are `bigint`, never `integer`: a currency total in int4 stops
 *      at $21.4M and throws 22003 on first real use.
 *  11. No `<form>` inside another `<form>`, and none inside a `<Link>`/`<a>`. The
 *      browser drops the inner one and its submit runs the outer action.
 *  12. No `startTransition` — `startTransition` inside a `setState` updater throws
 *      in React 19 and surfaces as "a client-side exception has occurred". Every
 *      deferred submit in this codebase goes through `form.requestSubmit()`.
 *  13. No `<Link>` to `/api/…`: `next/link` prefetches on hover, so a GET with a
 *      side effect runs before anybody taps it.
 *  14. `.gitignore` must not ignore `drizzle/meta/` — it holds `_journal.json`,
 *      without which a fresh clone cannot run `db:migrate`.
 *
 * Every rule was verified by planting a violation and watching this script fail
 * before it was trusted to print "clean".
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
    "#007bff", "#6610f2", "#6f42c1", "#e83e8c", "#f472b6", "#818cf8", "#14b8a6",
    "#f59e0b", "#ef4444", "#84cc16",
  ].map((h) => h.toLowerCase()),
);
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F000}-\u{1F0FF}]/u;
/** DESIGN_LANGUAGE rule 5, plus 1/2 for hairlines and the gauge's own track. */
const SCALE = new Set([0, 1, 2, 3, 4, 6, 8, 12, 16, 20, 24, 32, 40, 56, 80]);
/** DESIGN.md names exactly three: 8 cards/inputs, 6 chips, 2 gauges. */
const RADII = new Set(["8px", "6px", "2px", "0"]);

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
  // lib/theme.ts holds the single literal platform metadata needs before any
  // stylesheet exists; lib/contracts.ts draws PDFs, and pdf-lib cannot read a CSS
  // custom property; lib/demo-photo.ts encodes PNG pixels. Each header says so.
  const isColourExempt =
    /src\/lib\/theme\.ts$/.test(file) ||
    /src\/lib\/contracts\.ts$/.test(file) ||
    /src\/lib\/demo-photo\.ts$/.test(file);
  // The brand mark is an SVG rendered by the browser before any stylesheet exists.
  const isIconAsset = /icon\.svg$/.test(file);

  // Comments describe hazards; they do not commit them. Blank the comment lines
  // once, and every pass below reads the same code-only view.
  const code = [];
  let inBlockComment = false;
  for (const line of lines) {
    const trimmed = line.trim();
    const wasInBlock = inBlockComment;
    if (inBlockComment && trimmed.includes("*/")) inBlockComment = false;
    else if (!inBlockComment && /\/\*/.test(trimmed) && !trimmed.includes("*/")) inBlockComment = true;
    const isComment =
      wasInBlock || trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
    code.push(isComment ? "" : line);
  }

  code.forEach((line, i) => {
    const n = i + 1;

    for (const hex of line.match(HEX) ?? []) {
      const lower = hex.toLowerCase();
      if (FRAMEWORK_HEXES.has(lower)) fail(file, n, `framework-default palette hex ${hex}`);
      const hue = hueOf(lower);
      if (hue !== null && hue >= 250 && hue <= 310) {
        fail(file, n, `purple hue (${hue}deg) in ${hex}`);
      }
      if (!isTokens && !isTest && !isColourExempt && !isIconAsset) {
        fail(file, n, `colour literal ${hex} outside globals.css`);
      }
    }

    if (EMOJI.test(line) && !isTest) fail(file, n, "emoji in source");

    for (const m of line.matchAll(
      /\b(padding|margin|gap|rowGap|columnGap)(?:Top|Bottom|Left|Right)?:\s*(\d+)\b/g,
    )) {
      const value = Number(m[2]);
      if (!SCALE.has(value)) fail(file, n, `${m[1]}: ${value} is off the 4px spacing scale`);
    }

    if (/sql`/.test(line) && /\bnew Date\(/.test(line)) {
      fail(
        file,
        n,
        "a Date interpolated into a raw sql fragment — use a typed operator or an ISO string with ::timestamptz",
      );
    }

    if (/\bstartTransition\b/.test(line)) {
      fail(
        file,
        n,
        "startTransition: inside a setState updater this throws in React 19 — use form.requestSubmit()",
      );
    }

    if (/<Link\b/.test(line) && /href=\{?["'`]\/api\//.test(line)) {
      fail(file, n, "a <Link> to /api/… — next/link prefetches, so a GET side effect runs on hover");
    }

    if (/\binteger\(\s*["'][a-z_]*cents["']/.test(line)) {
      fail(file, n, "money in an integer column — int4 stops at $21.4M; use bigint");
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

  /* --- nested forms, and forms inside links --- */
  if (/\.tsx$/.test(file)) {
    let depth = 0;
    let linkDepth = 0;
    code.forEach((line, i) => {
      const n = i + 1;
      for (const m of line.matchAll(/<\/?(form|Link|a)\b([^>]*)>?/g)) {
        const tag = m[1];
        const closing = m[0].startsWith("</");
        const selfClosing = /\/>\s*$/.test(m[0]);
        if (tag === "form") {
          if (closing) depth = Math.max(0, depth - 1);
          else {
            if (depth > 0) {
              fail(file, n, "a <form> nested inside another <form> — the browser drops the inner one");
            }
            if (linkDepth > 0) {
              fail(file, n, "a <form> inside a <Link>/<a> — the tap navigates instead of submitting");
            }
            if (!selfClosing) depth += 1;
          }
        } else if (!selfClosing) {
          linkDepth = closing ? Math.max(0, linkDepth - 1) : linkDepth + 1;
        }
      }
    });
  }
}

/* --- server actions: used, and function-only --- */

const actionFiles = files.filter((f) => /\.tsx?$/.test(f) && /^\s*["']use server["']/.test(read(f)));
const allSource = files.map(read).join("\n");
for (const file of actionFiles) {
  const source = read(file);
  for (const m of source.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) {
    const name = m[1];
    const uses = allSource.split(new RegExp(`\\b${name}\\b`)).length - 1;
    if (uses < 2) {
      fail(file, 1, `exported server action ${name} is never called — delete it, it is attack surface`);
    }
  }
  source.split("\n").forEach((line, i) => {
    if (/^\s*export\s+(const|let|var|class)\s+\w/.test(line)) {
      fail(
        file,
        i + 1,
        'a non-function export from a "use server" module arrives undefined on the client — move it to an ordinary module',
      );
    }
  });
}

/* --- the .gitignore trap --- */

try {
  const ignore = readFileSync(join(ROOT, ".gitignore"), "utf8");
  for (const [i, line] of ignore.split("\n").entries()) {
    if (/^\s*drizzle\/meta\/?\s*$/.test(line)) {
      fail(
        join(ROOT, ".gitignore"),
        i + 1,
        "drizzle/meta/ is ignored — _journal.json is in there and a fresh clone cannot migrate without it",
      );
    }
  }
} catch {
  problems.push(".gitignore: not found");
}

if (problems.length === 0) {
  console.log(`craft-check: clean (${files.length} files)`);
  process.exit(0);
}
console.log(`craft-check: ${problems.length} problem(s)`);
for (const p of problems) console.log(`  ${p}`);
process.exit(1);
