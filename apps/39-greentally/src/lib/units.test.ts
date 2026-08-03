import test from "node:test";
import assert from "node:assert/strict";
import {
  convertToCanonical,
  formatConfidenceBp,
  formatFactorMicro,
  formatQuantityMilli,
  formatTonnes,
  normalizeUnitKey,
  scopeOf,
} from "./units";

test("kWh passes through unchanged, as thousandths", () => {
  const c = convertToCanonical("electricity_kwh", 4182, "kWh");
  assert.equal(c?.quantityMilli, 4_182_000);
  assert.equal(c?.canonicalUnit, "kWh");
});

test("MWh scales by a thousand", () => {
  assert.equal(convertToCanonical("electricity_kwh", 1.5, "MWh")?.quantityMilli, 1_500_000);
});

test("therms convert to kWh at the published heat content", () => {
  // 812 therms × 29.3001 = 23 791.68 kWh
  const c = convertToCanonical("natural_gas_kwh", 812, "therms");
  assert.equal(c?.quantityMilli, 23_791_681);
  assert.equal(c?.sourceUnitDisplay, "therms");
});

test("CCF is 1.037 therms, not one therm and not one kWh", () => {
  const ccf = convertToCanonical("natural_gas_kwh", 100, "CCF")!;
  const therms = convertToCanonical("natural_gas_kwh", 103.7, "therms")!;
  assert.equal(ccf.quantityMilli, therms.quantityMilli);
  // The bug this guards: treating CCF as kWh understates gas by ~30x.
  assert.ok(ccf.quantityMilli > 30 * 100 * 1000);
});

test("US gallons convert to litres", () => {
  assert.equal(convertToCanonical("diesel_l", 100, "gallons")?.quantityMilli, 378_541);
});

test("a volume unit on an electricity bill is a failure, not a guess", () => {
  assert.equal(convertToCanonical("electricity_kwh", 500, "gallons"), null);
});

test("an unknown unit is rejected", () => {
  assert.equal(convertToCanonical("natural_gas_kwh", 10, "sacks"), null);
  assert.equal(convertToCanonical("diesel_l", 10, ""), null);
});

test("negative and non-finite quantities are rejected", () => {
  assert.equal(convertToCanonical("electricity_kwh", -5, "kWh"), null);
  assert.equal(convertToCanonical("electricity_kwh", Number.NaN, "kWh"), null);
});

test("unit keys normalise punctuation, case and the cubic-metre glyph", () => {
  assert.equal(normalizeUnitKey(" KW-H "), "kw h");
  assert.equal(normalizeUnitKey("m³"), "m3");
  assert.equal(convertToCanonical("natural_gas_kwh", 1, "M³")?.quantityMilli, 10_556);
});

test("only electricity is Scope 2", () => {
  assert.equal(scopeOf("electricity_kwh"), "2");
  assert.equal(scopeOf("natural_gas_kwh"), "1");
  assert.equal(scopeOf("diesel_l"), "1");
});

test("figure formatting matches the type specimen", () => {
  assert.equal(formatQuantityMilli(41_882_000), "41,882");
  assert.equal(formatTonnes(128_400_000), "128.4");
  assert.equal(formatTonnes(0), "0.0");
  assert.equal(formatFactorMicro(383_000), "0.383");
  assert.equal(formatFactorMicro(2_512_330), "2.5123");
  assert.equal(formatFactorMicro(0), "0");
});

test("confidence never rounds up to a hundred percent it has not earned", () => {
  assert.equal(formatConfidenceBp(9_950), "99%");
  assert.equal(formatConfidenceBp(10_000), "100%");
  assert.equal(formatConfidenceBp(4_200), "42%");
});
