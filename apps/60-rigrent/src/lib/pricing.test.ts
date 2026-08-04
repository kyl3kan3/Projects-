/**
 * Money and rate maths. Everything in cents, rounded once, at the documented
 * place.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  billableDays,
  lateFeeCents,
  quoteTotals,
  rateForWindow,
  touchesWeekend,
} from "@/lib/pricing";
import { applyBps, formatMoney, formatMoneyShort, parseMoneyToCents, parsePercentToBps } from "@/lib/money";

// 2026-08-08 is a Saturday.
const SAT = "2026-08-08";
const SUN = "2026-08-09";
const MON = "2026-08-10";
const TUE = "2026-08-11";
const THU = "2026-08-13";

test("billable days: Saturday out, Sunday back, is one day", () => {
  assert.equal(billableDays(SAT, SUN), 1);
});

test("billable days: Friday to Monday is three", () => {
  assert.equal(billableDays("2026-08-07", MON), 3);
});

test("billable days: a degenerate window still bills one day", () => {
  assert.equal(billableDays(SAT, SAT), 1);
});

test("touchesWeekend", () => {
  assert.equal(touchesWeekend(SAT, SUN), true);
  assert.equal(touchesWeekend(SUN, MON), true);
  assert.equal(touchesWeekend(TUE, THU), false);
  assert.equal(touchesWeekend(MON, TUE), false);
});

const chair = { dailyRateCents: 175, weekendRateCents: 250 };
const linen = { dailyRateCents: 1_200, weekendRateCents: null };

test("weekend rate is a flat price for a short window over a weekend", () => {
  const rate = rateForWindow(chair, SAT, SUN);
  assert.equal(rate.rateCents, 250);
  assert.equal(rate.basis, "weekend");
});

test("weekday window pays the daily rate per day, not the weekend rate", () => {
  const rate = rateForWindow(chair, MON, TUE);
  assert.equal(rate.rateCents, 175);
  assert.equal(rate.basis, "daily");
});

test("a long window over a weekend is daily, not one flat weekend price", () => {
  // Ten days including a Saturday must not cost one weekend rate.
  const rate = rateForWindow(chair, "2026-08-03", "2026-08-13");
  assert.equal(rate.basis, "daily");
  assert.equal(rate.rateCents, 175 * 10);
});

test("an item with no weekend rate always bills daily", () => {
  const rate = rateForWindow(linen, SAT, SUN);
  assert.equal(rate.basis, "daily");
  assert.equal(rate.rateCents, 1_200);
});

const opts = {
  delivery: false,
  deliveryFeeCents: 8_500,
  taxRateBps: 825,
  taxExempt: false,
  depositPercentBps: 2_500,
  depositMinimumCents: 5_000,
};

test("totals: lines, tax and deposit", () => {
  const totals = quoteTotals([{ quantity: 200, rateCents: 250 }], opts);
  assert.equal(totals.linesSubtotalCents, 50_000);
  assert.equal(totals.subtotalCents, 50_000);
  assert.equal(totals.taxCents, 4_125);
  assert.equal(totals.totalCents, 54_125);
  // 25% of $500 is $125, well above the $50 floor.
  assert.equal(totals.depositCents, 12_500);
});

test("totals: a $100 rental takes the $50 floor, not 25% of it", () => {
  const totals = quoteTotals([{ quantity: 40, rateCents: 250 }], opts);
  assert.equal(totals.linesSubtotalCents, 10_000);
  assert.equal(totals.depositCents, 5_000);
});

test("totals: delivery fee is part of the taxable subtotal", () => {
  const totals = quoteTotals([{ quantity: 200, rateCents: 250 }], { ...opts, delivery: true });
  assert.equal(totals.deliveryFeeCents, 8_500);
  assert.equal(totals.subtotalCents, 58_500);
  assert.equal(totals.taxCents, applyBps(58_500, 825));
  // The deposit is a percentage of the *rental*, not of the delivery fee.
  assert.equal(totals.depositCents, 12_500);
});

test("totals: a tax-exempt customer pays no tax at all", () => {
  const totals = quoteTotals([{ quantity: 40, rateCents: 250 }], { ...opts, taxExempt: true });
  assert.equal(totals.taxCents, 0);
  assert.equal(totals.totalCents, 10_000);
});

test("totals: the deposit floor applies to a small order", () => {
  const totals = quoteTotals([{ quantity: 10, rateCents: 1_200 }], opts);
  // 25% of $120 is $30, below the $50 floor.
  assert.equal(totals.depositCents, 5_000);
});

test("totals: an empty quote has a zero deposit, not the floor", () => {
  const totals = quoteTotals([], opts);
  assert.equal(totals.subtotalCents, 0);
  assert.equal(totals.depositCents, 0);
});

test("totals: an explicit deposit override wins over the percentage and the floor", () => {
  const totals = quoteTotals([{ quantity: 200, rateCents: 250 }], {
    ...opts,
    depositOverrideCents: 30_000,
  });
  assert.equal(totals.depositCents, 30_000);
});

test("totals: an override of zero is honoured, not treated as absent", () => {
  const totals = quoteTotals([{ quantity: 200, rateCents: 250 }], {
    ...opts,
    depositOverrideCents: 0,
  });
  assert.equal(totals.depositCents, 0);
});

test("totals: rounding happens once, and half-up", () => {
  // 8.25% of $100.06 = 825.495 cents -> 825
  const totals = quoteTotals([{ quantity: 1, rateCents: 10_006 }], opts);
  assert.equal(totals.taxCents, 825);
  // 8.25% of $100.10 = 825.825 -> 826
  const up = quoteTotals([{ quantity: 1, rateCents: 10_010 }], opts);
  assert.equal(up.taxCents, 826);
});

test("totals: a big-ticket order stays exact in cents", () => {
  // Three marquees for a festival build-out. The arithmetic must not drift into
  // floats, and it must not overflow: a currency total lives in bigint, so a
  // hypothetical $30M contract is 3e9 cents and would have thrown 22003 in int4.
  const totals = quoteTotals([{ quantity: 3, rateCents: 58_000 }], opts);
  assert.equal(totals.linesSubtotalCents, 174_000);
  assert.equal(totals.depositCents, 43_500);

  const huge = quoteTotals([{ quantity: 1, rateCents: 3_000_000_000 }], opts);
  assert.equal(huge.linesSubtotalCents, 3_000_000_000);
  assert.equal(huge.taxCents, 247_500_000);
  assert.equal(huge.totalCents, 3_247_500_000);
  assert.ok(Number.isSafeInteger(huge.totalCents));
});

test("late fees accrue per day at the daily rate, and are zero before due", () => {
  const lines = [{ quantity: 80, dailyRateCents: 175 }];
  assert.equal(lateFeeCents(lines, SUN, SAT), 0);
  assert.equal(lateFeeCents(lines, SUN, SUN), 0);
  assert.equal(lateFeeCents(lines, SUN, MON), 14_000);
  assert.equal(lateFeeCents(lines, SUN, TUE), 28_000);
});

test("money formatting and parsing round-trip", () => {
  assert.equal(formatMoney(184_500), "$1,845.00");
  assert.equal(formatMoney(0), "$0.00");
  assert.equal(formatMoney(-2_500), "-$25.00");
  assert.equal(formatMoneyShort(184_500), "$1,845");
  assert.equal(formatMoneyShort(184_550), "$1,845.50");
  assert.equal(parseMoneyToCents("185"), 18_500);
  assert.equal(parseMoneyToCents("$1,850.50"), 185_050);
  assert.equal(parseMoneyToCents("0.05"), 5);
  assert.throws(() => parseMoneyToCents("one eighty five"));
  assert.throws(() => parseMoneyToCents("185.555"));
});

test("percentages parse to basis points", () => {
  assert.equal(parsePercentToBps("8.25"), 825);
  assert.equal(parsePercentToBps("25%"), 2_500);
  assert.equal(parsePercentToBps("0"), 0);
  assert.throws(() => parsePercentToBps("-5"));
});
