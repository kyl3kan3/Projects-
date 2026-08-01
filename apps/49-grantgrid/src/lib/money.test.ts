import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatCents,
  formatCentsCompact,
  formatCentsExact,
  parseDollarsToCents,
  sumCents,
} from "./money";

test("amounts render as whole dollars with separators", () => {
  assert.equal(formatCents(2_500_000), "$25,000");
  assert.equal(formatCents(0), "$0");
  assert.equal(formatCents(null), "—");
  assert.equal(formatCents(undefined), "—");
  assert.equal(formatCentsExact(2_500_050), "$25,000.50");
});

test("compact amounts are for tight labels only", () => {
  assert.equal(formatCentsCompact(2_500_000), "$25k");
  assert.equal(formatCentsCompact(150_000_000), "$1.5M");
  assert.equal(formatCentsCompact(750_00), "$750");
  assert.equal(formatCentsCompact(null), "—");
});

test("typed amounts parse the way a hurried person types them", () => {
  assert.equal(parseDollarsToCents("25000"), 2_500_000);
  assert.equal(parseDollarsToCents("$25,000"), 2_500_000);
  assert.equal(parseDollarsToCents(" 25,000 "), 2_500_000);
  assert.equal(parseDollarsToCents("25k"), 2_500_000);
  assert.equal(parseDollarsToCents("1.5m"), 150_000_000);
  assert.equal(parseDollarsToCents("7500.50"), 750_050);
});

test("unreadable input is null, never a silent zero", () => {
  assert.equal(parseDollarsToCents(""), null);
  assert.equal(parseDollarsToCents("   "), null);
  assert.equal(parseDollarsToCents("abc"), null);
  assert.equal(parseDollarsToCents("-500"), null);
  assert.equal(parseDollarsToCents("25.005"), null);
  assert.equal(parseDollarsToCents(null), null);
});

test("rounding happens once, at the edge, and cents stay integers", () => {
  const cents = parseDollarsToCents("33333.335");
  assert.equal(cents, null); // too many decimals: refused rather than rounded
  const third = parseDollarsToCents("33333.33")!;
  assert.ok(Number.isInteger(third));
  assert.equal(third * 3, 9_999_999);
});

test("sums tolerate nulls without becoming NaN", () => {
  assert.equal(sumCents([1_000_000, null, 500_000, undefined]), 1_500_000);
  assert.equal(sumCents([]), 0);
});
