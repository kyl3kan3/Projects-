import assert from "node:assert/strict";
import test from "node:test";
import {
  dollarsToMicros,
  formatPercentDelta,
  formatPerDay,
  formatPerMonth,
  formatUsd,
  formatUsdWhole,
  microsToCents,
  sumToMicros,
} from "./money";

test("sub-cent AWS line items survive the round trip", () => {
  // One hour of a 20GB gp3 volume. Cents would round this to zero.
  assert.equal(dollarsToMicros("0.00219"), 2190);
  assert.equal(dollarsToMicros(0.0043), 4300);
  assert.equal(dollarsToMicros("12.4738291"), 12473829);
});

test("dollarsToMicros tolerates junk from an API", () => {
  assert.equal(dollarsToMicros(""), 0);
  assert.equal(dollarsToMicros("not-a-number"), 0);
  assert.equal(dollarsToMicros(Number.NaN), 0);
});

test("a month of sub-cent hours adds up exactly", () => {
  // 720 hours x $0.00219 = $1.5768 exactly. A float sum drifts here.
  let total = 0;
  for (let i = 0; i < 720; i++) total += dollarsToMicros("0.00219");
  assert.equal(total, 1_576_800);
  assert.equal(formatUsd(total), "$1.58");
});

test("formatUsd is the DESIGN.md specimen", () => {
  assert.equal(formatUsd(12_483_070_000), "$12,483.07");
  assert.equal(formatUsd(0), "$0.00");
  assert.equal(formatUsd(-2_500_000), "-$2.50");
  assert.equal(formatUsd(999_999_999_999), "$1,000,000.00");
});

test("rounding happens once, at the edge", () => {
  // 4 999 micros is just under half a cent, 5 000 is half.
  assert.equal(microsToCents(4_999), 0);
  assert.equal(microsToCents(5_000), 1);
  assert.equal(formatUsd(4_999), "$0.00");
  assert.equal(formatUsd(5_000), "$0.01");
});

test("whole-dollar and rate formats", () => {
  assert.equal(formatUsdWhole(19_940_400_000), "$19,940");
  assert.equal(formatPerDay(342_400_000), "+$342/DAY");
  assert.equal(formatPerDay(-88_000_000), "-$88/DAY");
  assert.equal(formatPerDay(0), "$0/DAY");
  assert.equal(formatPerMonth(611_000_000), "$611/MO");
});

test("percent delta against last month", () => {
  assert.equal(formatPercentDelta(108, 100), "+8%");
  assert.equal(formatPercentDelta(97, 100), "-3%");
  assert.equal(formatPercentDelta(100, 100), "flat");
  assert.equal(formatPercentDelta(50, 0), "new");
  assert.equal(formatPercentDelta(0, 0), "flat");
});

test("sumToMicros handles postgres numeric strings and nulls", () => {
  assert.equal(sumToMicros("12483070000"), 12_483_070_000);
  assert.equal(sumToMicros(null), 0);
  assert.equal(sumToMicros(undefined), 0);
});
