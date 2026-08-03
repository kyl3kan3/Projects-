import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyMarkup,
  computeTotals,
  formatMoney,
  formatMoneyShort,
  formatQuantity,
  lineTotalCents,
  parseAmountToCents,
  parseQuantityToMilli,
  roundHalfUp,
} from "@/lib/money";

describe("rounding", () => {
  it("rounds halves away from zero", () => {
    assert.equal(roundHalfUp(0.5), 1);
    assert.equal(roundHalfUp(1.5), 2);
    assert.equal(roundHalfUp(-1.5), -2);
    assert.equal(roundHalfUp(2.49), 2);
  });

  it("does not lose a half to binary noise", () => {
    // 14.499999999999998 is really 14.5 arrived at by floating point.
    assert.equal(roundHalfUp(14.499999999999998), 15);
  });
});

describe("parsing amounts", () => {
  it("reads what a rate sheet actually contains", () => {
    assert.equal(parseAmountToCents("1,200.50"), 120_050);
    assert.equal(parseAmountToCents("$4,800"), 480_000);
    assert.equal(parseAmountToCents("68"), 6_800);
    assert.equal(parseAmountToCents("(120.00)"), -12_000);
    assert.equal(parseAmountToCents(19.99), 1_999);
  });

  it("refuses anything that is not a number", () => {
    // A silent zero in a price book is a quote that loses money.
    assert.equal(parseAmountToCents("call for pricing"), null);
    assert.equal(parseAmountToCents(""), null);
    assert.equal(parseAmountToCents(null), null);
  });

  it("reads quantities, including fractions techs write", () => {
    assert.equal(parseQuantityToMilli("2"), 2_000);
    assert.equal(parseQuantityToMilli("2.5"), 2_500);
    assert.equal(parseQuantityToMilli("1 1/2"), 1_500);
    assert.equal(parseQuantityToMilli("3/4"), 750);
    assert.equal(parseQuantityToMilli("twelve"), null);
  });
});

describe("pricing", () => {
  it("applies markup to cost and rounds once", () => {
    assert.equal(applyMarkup(195_000, 35), 263_250);
    assert.equal(applyMarkup(32_500, 0), 32_500);
    // 6800 * 1.375 = 9350 exactly; 145 * 1.33 = 192.85 → 193
    assert.equal(applyMarkup(6_800, 37.5), 9_350);
    assert.equal(applyMarkup(145, 33), 193);
  });

  it("multiplies a thousandths quantity by a cents price without drift", () => {
    assert.equal(lineTotalCents(2_500, 12_825), 32_063); // 2.5 hours at $128.25
    assert.equal(lineTotalCents(2_200_000, 215), 473_000); // 2,200 sqft at $2.15
    assert.equal(lineTotalCents(1_000, 145_000), 145_000);
  });
});

describe("estimate totals", () => {
  const lines = [
    { lineTotalCents: 263_250, needsPricing: false, taxable: true },
    { lineTotalCents: 11_475, needsPricing: false, taxable: true },
    { lineTotalCents: 76_950, needsPricing: false, taxable: false }, // labour
    { lineTotalCents: 0, needsPricing: true, taxable: true }, // crane, unpriced
  ];

  it("excludes unpriced rows from the money and counts them", () => {
    const totals = computeTotals(lines, 825);
    assert.equal(totals.subtotalCents, 351_675);
    assert.equal(totals.needsPricingCount, 1);
  });

  it("taxes materials and not labour", () => {
    const totals = computeTotals(lines, 825);
    // 8.25% of (263250 + 11475) = 22664.81 → 22665
    assert.equal(totals.taxCents, 22_665);
    assert.equal(totals.totalCents, 351_675 + 22_665);
  });

  it("charges no tax at a zero rate", () => {
    const totals = computeTotals(lines, 0);
    assert.equal(totals.taxCents, 0);
    assert.equal(totals.totalCents, totals.subtotalCents);
  });
});

describe("formatting", () => {
  it("writes money the way a proposal reads", () => {
    assert.equal(formatMoney(312_000), "$3,120.00");
    assert.equal(formatMoney(0), "$0.00");
    assert.equal(formatMoneyShort(1_864_000), "$18,640");
    assert.equal(formatMoneyShort(1_864_050), "$18,640.50");
  });

  it("trims quantity noise", () => {
    assert.equal(formatQuantity(2_000), "2");
    assert.equal(formatQuantity(2_500), "2.5");
    assert.equal(formatQuantity(2_200_000), "2200");
  });
});
