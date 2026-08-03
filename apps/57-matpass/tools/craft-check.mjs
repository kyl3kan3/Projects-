#!/usr/bin/env node
/**
 * The checks a type-checker cannot make. Dependency-free; `npm run craft`.
 *
 * `npm run lint` cannot run in this checkout (ESLint 9 needs a flat config whose
 * own imports the shared dependency scanner skips), so this stands in for the
 * rules that actually matter here — the ones in DESIGN.md and DESIGN_LANGUAGE.md
 * that a build can violate while staying perfectly green:
 *
 *  1. No colour literal outside globals.css. Belt colours are the sole exception
 *     and they are data — curricula.ts and the belt maths, never chrome.
 *  2. No purple (hue 250-310) anywhere except those belt colours.
 *  3. No emoji in product UI.
 *  4. No client component reaching the database client (which would pull
 *     `postgres` into the browser bundle).
 *  5. Every padding/margin/gap number on the 4px scale.
 *  6. Only the three declared radii.
 *  7. No gradient or box-shadow glow on an interactive element.
 *  8. `promotions` is never updated or deleted — the append-only invariant.
 *  9. No `Date` interpolated into a raw `sql` fragment (it skips Drizzle's
 *     encoder and throws at runtime inside postgres.js).
 * 10. `redirect()` is never called inside a `try` that catches — it throws a
 *     control-flow signal, and catching it turns a success into a fake error.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "src");

const SPACING = new Set([0, 1, 2, 3, 4, 6, 8, 12, 16, 20, 24, 32, 40, 56, 80]);
const RADII = new Set([1, 2, 3, 4, 6, 8, 12, 20]);

/** Files allowed to name a colour: the token sheet, and the belt data + maths. */
const COLOUR_ALLOWED = new Set([
  "src/app/globals.css",
  "src/lib/curricula.ts", // belt_color_hex seed data — content, not chrome
  "src/lib/belt.ts", // the two stripe colours and the white-belt fallback
  "src/lib/belt.test.ts",
  "src/lib/db.test.ts", // fixture ladders
  "src/app/icon.tsx", // the favicon is painted, not styled
  "src/app/layout.tsx", // viewport themeColor must be a literal in metadata
  "src/db/schema.ts", // belt_color_hex column default — a DB default is a literal
  "src/app/(console)/gradings/[eventId]/certificates/route.ts", // pdf-lib rgb()
]);

const problems = [];
const note = (file, line, message) => problems.push({ file, line, message });

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(tsx?|css)$/.test(entry)) out.push(full);
  }
  return out;
}

function hueOf(hex) {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return null;
  const d = max - min;
  let hue;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  hue *= 60;
  return hue < 0 ? hue + 360 : hue;
}

const EMOJI =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/u;
/** Typographic marks that are text, not decoration, and are allowed. */
const TYPOGRAPHIC = /^[→←↑↓·—–’‘“”…×]+$/u;

for (const file of walk(SRC)) {
  const rel = path.relative(ROOT, file);
  const source = readFileSync(file, "utf8");
  const lines = source.split("\n");
  const isCss = rel.endsWith(".css");
  const isClient = /^\s*["']use client["']/.test(source);

  // 4 — a client component must not reach the database.
  if (isClient && /@\/db\b|from "postgres"|drizzle-orm/.test(source)) {
    note(rel, 1, "client component imports the db client — it would ship `postgres` to the browser");
  }

  // 8 — the append-only invariant.
  if (/\.(update|delete)\(\s*promotions\s*\)/.test(source) && !rel.endsWith("db.test.ts")) {
    note(rel, 1, "promotions must be append-only — no update/delete");
  }

  lines.forEach((line, i) => {
    const n = i + 1;
    const code = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");

    // 1 + 2 — colour literals and purple.
    for (const match of code.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
      const hex = match[0];
      if (hex.length !== 4 && hex.length !== 7) continue;
      if (!COLOUR_ALLOWED.has(rel)) {
        note(rel, n, `colour literal ${hex} outside globals.css`);
      }
      const hue = hueOf(hex);
      const beltData = rel === "src/lib/curricula.ts" || rel === "src/lib/db.test.ts";
      if (hue !== null && hue >= 250 && hue <= 310 && !beltData) {
        note(rel, n, `purple hue ${Math.round(hue)}deg (${hex}) — banned outside belt data`);
      }
    }
    for (const fn of code.matchAll(/\b(rgb|rgba|hsl|hsla)\(/g)) {
      if (!COLOUR_ALLOWED.has(rel)) note(rel, n, `colour function ${fn[1]}() outside globals.css`);
    }

    // 3 — emoji.
    const emoji = code.match(EMOJI);
    if (emoji && !TYPOGRAPHIC.test(emoji[0])) {
      note(rel, n, `emoji ${JSON.stringify(emoji[0])} in product source`);
    }

    // 5 — the spacing scale, in inline styles and CSS alike.
    const spacingProps = isCss
      ? /(?:^|\s)(padding|margin|gap|row-gap|column-gap)(?:-(?:top|right|bottom|left))?\s*:\s*([^;]+)/g
      : /\b(padding|paddingTop|paddingBottom|paddingLeft|paddingRight|margin|marginTop|marginBottom|marginLeft|marginRight|gap|rowGap|columnGap)\s*:\s*(-?\d+)\b/g;
    for (const match of code.matchAll(spacingProps)) {
      const values = isCss ? match[2].match(/-?\d+(?=px)/g) : [match[2]];
      for (const raw of values ?? []) {
        const value = Math.abs(Number(raw));
        if (!SPACING.has(value)) note(rel, n, `off-scale spacing ${raw}px on ${match[1]}`);
      }
    }

    // 6 — radius discipline.
    for (const match of code.matchAll(/border-?[Rr]adius\s*:\s*([^;,}]+)/g)) {
      for (const raw of match[1].match(/\d+(?=px)/g) ?? []) {
        if (!RADII.has(Number(raw))) note(rel, n, `undeclared radius ${raw}px`);
      }
    }

    // 7 — no gradient or glow on a control.
    if (/linear-gradient|radial-gradient/.test(code) && !/background-image:\s*url/.test(code)) {
      note(rel, n, "gradient fill — DESIGN_LANGUAGE rule 2 forbids these on controls");
    }
    if (/box-shadow/.test(code) && !/inset|0 0 0 2px|scrim/.test(code)) {
      note(rel, n, "box-shadow that is not an inset or a focus ring — no elevation, no glow");
    }

    // 9 — a Date inside a raw sql fragment.
    if (/sql`[^`]*\$\{[^}]*(?:Date\(|At\b|On\b|now)[^}]*\}/.test(code) && !/::/.test(code)) {
      note(rel, n, "possible Date inside a raw sql fragment — use gt/gte/lt/lte or cast");
    }
  });

  // 10 — redirect() inside a catching try.
  const tryBlocks = source.split(/\btry\s*\{/).slice(1);
  for (const block of tryBlocks) {
    const body = block.split(/\}\s*catch/)[0];
    if (body && /\bredirect\(/.test(body) && body.length < block.length) {
      note(rel, 1, "redirect() inside a try that catches — the NEXT_REDIRECT signal gets swallowed");
    }
  }
}

// The token sheet must actually declare the palette DESIGN.md specifies.
const css = readFileSync(path.join(SRC, "app/globals.css"), "utf8");
for (const token of [
  "--color-canvas: #f6f5f1",
  "--color-card: #fcfbf8",
  "--color-hairline: #e4e1d9",
  "--color-ink: #262421",
  "--color-ink-2: #6c6963",
  "--color-crimson: #a63b32",
  "--color-green: #3f7a52",
  "--color-red-flag: #8f3b33",
]) {
  if (!css.includes(token)) note("src/app/globals.css", 1, `missing DESIGN.md token: ${token}`);
}
// The two AA corrections must stay documented where they were made.
if (!/ink-3` was #9E9A92/.test(css) || !/amber` was #B3873A/.test(css)) {
  note("src/app/globals.css", 1, "the AA deviations from DESIGN.md must stay documented here");
}

if (problems.length === 0) {
  console.log("craft-check: clean");
  process.exit(0);
}
for (const p of problems) console.error(`${p.file}:${p.line}  ${p.message}`);
console.error(`\ncraft-check: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
process.exit(1);
