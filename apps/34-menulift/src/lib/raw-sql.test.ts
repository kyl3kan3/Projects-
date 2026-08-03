/**
 * A source-level guard on raw `sql` fragments.
 *
 * Drizzle renders an interpolated **column** as a qualified identifier, which is
 * safe. It renders an interpolated **value** as an untyped bind parameter, which
 * is where two of this portfolio's recurring runtime bugs live:
 *
 *  - a number: coalescing a max against an interpolated step constant becomes
 *    `-$1`, and Postgres answers `operator is not unique: - unknown`. This shipped
 *    here and broke creating a menu, a section, and a dish — with a clean
 *    typecheck and a green production build.
 *  - a `Date`: it skips Drizzle's encoder entirely and postgres.js throws on
 *    `Buffer.byteLength`. Use `gt`/`gte`/`lt`/`lte`, or an explicit
 *    `::timestamptz` cast on an ISO string.
 *
 * So: inside a `sql` template, an interpolation must look like a column
 * (`table.column`). Anything else has to be a typed operator instead.
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
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** `menuItems.position`, `eightySixEvents.restoredAt` — a column reference. */
const COLUMN_SHAPE = /^[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*$/;

test("no raw sql fragment interpolates anything but a column", () => {
  const offenders: string[] = [];

  for (const file of walk(SRC)) {
    const source = readFileSync(file, "utf8");
    // Every `sql`...`` template, including the sql<T>`...` form.
    for (const match of source.matchAll(/\bsql(?:<[^>]*>)?`([^`]*)`/g)) {
      const body = match[1];
      for (const interpolation of body.matchAll(/\$\{([^}]*)\}/g)) {
        const expression = interpolation[1].trim();
        if (COLUMN_SHAPE.test(expression)) continue;
        offenders.push(`${path.relative(SRC, file)}: sql\`…\${${expression}}…\``);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `these interpolate a value, not a column, and will fail at runtime:\n${offenders.join("\n")}`,
  );
});

test("the guard actually catches the two shapes it exists for", () => {
  // Proof the regex above is not vacuous.
  const sample = [
    "const a = sql<number>`coalesce(max(${menus.position}), -${POSITION_STEP})`;",
    "const b = sql`${events.at} > ${someDate}`;",
    "const c = sql<number>`count(distinct ${events.itemId})`;",
  ].join("\n");

  const found: string[] = [];
  for (const match of sample.matchAll(/\bsql(?:<[^>]*>)?`([^`]*)`/g)) {
    for (const interpolation of match[1].matchAll(/\$\{([^}]*)\}/g)) {
      const expression = interpolation[1].trim();
      if (!COLUMN_SHAPE.test(expression)) found.push(expression);
    }
  }
  assert.deepEqual(found, ["POSITION_STEP", "someDate"]);
});
