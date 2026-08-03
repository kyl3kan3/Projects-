import assert from "node:assert/strict";
import { test } from "node:test";
import {
  centsToDecimal,
  formatCents,
  parseAmountToCents,
  percentOf,
  splitCents,
} from "./money";

test("formatCents groups thousands and always shows two decimal places", () => {
  assert.equal(formatCents(0), "$0.00");
  assert.equal(formatCents(5), "$0.05");
  assert.equal(formatCents(418266), "$4,182.66");
  assert.equal(formatCents(-1200), "-$12.00");
  assert.equal(formatCents(100000000), "$1,000,000.00");
});

test("splitCents keeps the cents separate so they can be typeset smaller", () => {
  assert.deepEqual(splitCents(418266), { whole: "$4,182", frac: "66" });
  assert.deepEqual(splitCents(7), { whole: "$0", frac: "07" });
});

test("centsToDecimal never emits a currency symbol or grouping", () => {
  assert.equal(centsToDecimal(418266), "4182.66");
  assert.equal(centsToDecimal(-500), "-5.00");
  assert.equal(centsToDecimal(1), "0.01");
});

test("parseAmountToCents reads what receipts and humans actually write", () => {
  assert.equal(parseAmountToCents("148.32"), 14832);
  assert.equal(parseAmountToCents("$1,204.00"), 120400);
  assert.equal(parseAmountToCents("1204"), 120400);
  assert.equal(parseAmountToCents("  12.5 "), 1250);
  assert.equal(parseAmountToCents("USD 89.99"), 8999);
  assert.equal(parseAmountToCents("(12.00)"), -1200);
  assert.equal(parseAmountToCents("-12.00"), -1200);
  // European grouping: the comma is the decimal separator here.
  assert.equal(parseAmountToCents("1.234,56"), 123456);
  assert.equal(parseAmountToCents("12,34"), 1234);
  // Three digits after a comma is grouping, not a decimal.
  assert.equal(parseAmountToCents("1,234"), 123400);
});

test("parseAmountToCents refuses what it cannot read rather than guessing zero", () => {
  assert.equal(parseAmountToCents(""), null);
  assert.equal(parseAmountToCents("   "), null);
  assert.equal(parseAmountToCents("TOTAL"), null);
  assert.equal(parseAmountToCents("$"), null);
});

test("cents arithmetic does not drift the way float dollars do", () => {
  // 0.1 + 0.2 in dollars is the canonical failure; in cents it is exact.
  const sum = [10, 20, 1999, 1999, 1999].reduce((a, b) => a + b, 0);
  assert.equal(sum, 6027);
  assert.equal(formatCents(sum), "$60.27");
});

test("percentOf rounds once and survives a zero denominator", () => {
  assert.equal(percentOf(2500, 10000), 25);
  assert.equal(percentOf(1, 3), 33);
  assert.equal(percentOf(500, 0), 0);
});
