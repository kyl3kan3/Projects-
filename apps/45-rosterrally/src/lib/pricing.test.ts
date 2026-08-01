/**
 * Registration money, checked by hand.
 *
 * Every expected number below was worked out on paper first. A club's fee table
 * is the one thing a parent will re-add on their phone, and a discount that comes
 * out a cent wrong is a message to a volunteer at 10pm.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { buildInstallmentPlan, findScholarshipCode, priceRegistration, quoteCart } from "./pricing";
import { basisPoints, formatMoney, parseMoney, roundHalfUp, splitCents } from "./money";
import { addMonthsIso } from "./time";
import type { EarlyBird, ScholarshipCode } from "@/db/schema";

const SETTINGS = {
  siblingDiscountBps: 1500, // 15%
  siblingDiscountFlatCents: 0,
  absorbPlatformFee: false,
};

const EARLY: EarlyBird = { endsOn: "2026-07-31", percentBps: 0, flatCents: 2000 };

function item(over: Partial<Parameters<typeof quoteCart>[0][number]> = {}) {
  return {
    ref: "r1",
    divisionId: "d-u10b",
    divisionName: "U10 Boys",
    playerName: "Mateo Alvarez",
    feeCents: 18_500,
    earlyBird: null,
    waitlisted: false,
    ...over,
  };
}

/* ------------------------------------------------------------- primitives --- */

test("cents helpers round half away from zero, once", () => {
  assert.equal(roundHalfUp(0.5), 1);
  assert.equal(roundHalfUp(1.5), 2);
  assert.equal(roundHalfUp(-1.5), -2);
  // 15% of $185.00 is $27.75 exactly.
  assert.equal(basisPoints(18_500, 1500), 2775);
  // 15% of $185.01 is 2775.15 -> 2775.
  assert.equal(basisPoints(18_501, 1500), 2775);
  // 7.5% of $99.99 is 749.925 -> 750.
  assert.equal(basisPoints(9_999, 750), 750);
});

test("installments always sum back to the total", () => {
  assert.deepEqual(splitCents(10_000, 3), [3334, 3333, 3333]);
  assert.equal(splitCents(12_345, 7).reduce((a, b) => a + b, 0), 12_345);
  assert.deepEqual(splitCents(2, 3), [1, 1, 0]);
});

test("money formatting and parsing are inverse for what a registrar types", () => {
  assert.equal(formatMoney(18_500), "$185.00");
  assert.equal(formatMoney(0), "$0.00");
  assert.equal(formatMoney(-2_775), "-$27.75");
  assert.equal(formatMoney(123_456_789), "$1,234,567.89");
  assert.equal(parseMoney("185"), 18_500);
  assert.equal(parseMoney("$1,185.5"), 118_550);
  assert.equal(parseMoney("185.00"), 18_500);
  assert.equal(parseMoney("18five"), null);
  assert.equal(parseMoney("185.005"), null);
  assert.equal(parseMoney("-185"), null);
});

/* ----------------------------------------------------------- one child --- */

test("a plain registration costs the division fee plus our $1.50", () => {
  const priced = priceRegistration({
    feeCents: 18_500,
    earlyBird: null,
    siblingDiscountBps: 1500,
    siblingDiscountFlatCents: 0,
    siblingIndex: 0,
    scholarship: null,
    asOf: "2026-08-04",
    plan: "per_registration",
    applicationFeeCents: 150,
  });
  assert.equal(priced.amountCents, 18_500);
  assert.deepEqual(priced.discounts, []);
  assert.equal(priced.platformFeeCents, 150);
});

test("early bird applies on its last day and not the day after", () => {
  const on = priceRegistration({
    feeCents: 18_500,
    earlyBird: EARLY,
    siblingDiscountBps: 1500,
    siblingDiscountFlatCents: 0,
    siblingIndex: 0,
    scholarship: null,
    asOf: "2026-07-31",
    plan: "per_registration",
    applicationFeeCents: 150,
  });
  assert.equal(on.amountCents, 16_500);
  assert.equal(on.discounts.length, 1);
  assert.equal(on.discounts[0].amountCents, 2_000);

  const off = priceRegistration({
    feeCents: 18_500,
    earlyBird: EARLY,
    siblingDiscountBps: 1500,
    siblingDiscountFlatCents: 0,
    siblingIndex: 0,
    scholarship: null,
    asOf: "2026-08-01",
    plan: "per_registration",
    applicationFeeCents: 150,
  });
  assert.equal(off.amountCents, 18_500);
  assert.deepEqual(off.discounts, []);
});

test("a flat-plan club pays us nothing per registration", () => {
  const priced = priceRegistration({
    feeCents: 18_500,
    earlyBird: null,
    siblingDiscountBps: 0,
    siblingDiscountFlatCents: 0,
    siblingIndex: 0,
    scholarship: null,
    asOf: "2026-08-04",
    plan: "flat",
    applicationFeeCents: 150,
  });
  assert.equal(priced.platformFeeCents, 0);
});

test("a scholarship code skips our fee, even a partial one", () => {
  const half: ScholarshipCode = {
    code: "TOWNFUND",
    label: "Town scholarship fund",
    percentBps: 5000,
    flatCents: 0,
    maxUses: 0,
    uses: 0,
  };
  const priced = priceRegistration({
    feeCents: 18_500,
    earlyBird: null,
    siblingDiscountBps: 0,
    siblingDiscountFlatCents: 0,
    siblingIndex: 0,
    scholarship: half,
    asOf: "2026-08-04",
    plan: "per_registration",
    applicationFeeCents: 150,
  });
  assert.equal(priced.amountCents, 9_250);
  assert.equal(priced.platformFeeCents, 0);
});

test("discounts can never drive a fee below zero", () => {
  const priced = priceRegistration({
    feeCents: 5_000,
    earlyBird: { endsOn: null, percentBps: 0, flatCents: 4_000 },
    siblingDiscountBps: 0,
    siblingDiscountFlatCents: 4_000,
    siblingIndex: 1,
    scholarship: {
      code: "FULLRIDE",
      label: "Full scholarship",
      percentBps: 10_000,
      flatCents: 0,
      maxUses: 0,
      uses: 0,
    },
    asOf: "2026-08-04",
    plan: "per_registration",
    applicationFeeCents: 150,
  });
  assert.equal(priced.amountCents, 0);
  assert.equal(priced.platformFeeCents, 0);
  assert.equal(
    priced.discounts.reduce((s, d) => s + d.amountCents, 0),
    5_000,
  );
});

/* ------------------------------------------------------------ the cart --- */

test("two children: the sibling discount lands once, on the cheaper child", () => {
  const quote = quoteCart(
    [
      item({ ref: "a", playerName: "Mateo Alvarez", feeCents: 18_500 }),
      item({
        ref: "b",
        playerName: "Lucia Alvarez",
        divisionId: "d-u8g",
        divisionName: "U8 Girls",
        feeCents: 14_000,
      }),
    ],
    SETTINGS,
    { scholarship: null, asOf: "2026-08-04", plan: "per_registration", applicationFeeCents: 150 },
  );
  // Mateo full: 18500. Lucia 14000 - 15% (2100) = 11900. Subtotal 30400.
  assert.equal(quote.lines[0].amountCents, 18_500);
  assert.equal(quote.lines[1].amountCents, 11_900);
  assert.equal(quote.discountTotalCents, 2_100);
  assert.equal(quote.subtotalCents, 30_400);
  assert.equal(quote.platformFeeCents, 300);
  assert.equal(quote.totalCents, 30_700);
});

test("cart order does not change the total", () => {
  const forwards = quoteCart(
    [
      item({ ref: "a", playerName: "Mateo Alvarez", feeCents: 18_500 }),
      item({ ref: "b", playerName: "Lucia Alvarez", feeCents: 14_000 }),
    ],
    SETTINGS,
    { scholarship: null, asOf: "2026-08-04", plan: "per_registration", applicationFeeCents: 150 },
  );
  const backwards = quoteCart(
    [
      item({ ref: "b", playerName: "Lucia Alvarez", feeCents: 14_000 }),
      item({ ref: "a", playerName: "Mateo Alvarez", feeCents: 18_500 }),
    ],
    SETTINGS,
    { scholarship: null, asOf: "2026-08-04", plan: "per_registration", applicationFeeCents: 150 },
  );
  assert.equal(forwards.totalCents, backwards.totalCents);
  // And the same child gets the same price either way.
  assert.equal(
    forwards.lines.find((l) => l.ref === "b")!.amountCents,
    backwards.lines.find((l) => l.ref === "b")!.amountCents,
  );
});

test("three children stack the sibling discount on the 2nd and 3rd", () => {
  const quote = quoteCart(
    [
      item({ ref: "a", playerName: "Mateo Alvarez", feeCents: 18_500 }),
      item({ ref: "b", playerName: "Lucia Alvarez", feeCents: 14_000 }),
      item({ ref: "c", playerName: "Nina Alvarez", feeCents: 14_000 }),
    ],
    SETTINGS,
    { scholarship: null, asOf: "2026-08-04", plan: "per_registration", applicationFeeCents: 150 },
  );
  // 18500 + 11900 + 11900 = 42300; our fee 3 x 150.
  assert.equal(quote.subtotalCents, 42_300);
  assert.equal(quote.platformFeeCents, 450);
});

test("a waitlisted child is free, charged nothing, and does not consume the sibling position", () => {
  const quote = quoteCart(
    [
      item({ ref: "a", playerName: "Mateo Alvarez", feeCents: 18_500, waitlisted: true }),
      item({ ref: "b", playerName: "Lucia Alvarez", feeCents: 14_000 }),
    ],
    SETTINGS,
    { scholarship: null, asOf: "2026-08-04", plan: "per_registration", applicationFeeCents: 150 },
  );
  assert.equal(quote.lines[0].chargeableCents, 0);
  assert.equal(quote.lines[0].platformFeeCents, 0);
  // The waitlisted child is still priced, so a promotion in three weeks charges
  // the fee agreed today rather than whatever the division costs by then.
  assert.equal(quote.lines[0].amountCents, 18_500);
  // Lucia is the only paying child, so she pays full price.
  assert.equal(quote.lines[1].amountCents, 14_000);
  assert.equal(quote.subtotalCents, 14_000);
  assert.equal(quote.totalCents, 14_150);
});

test("early bird and sibling compound in the documented order", () => {
  const quote = quoteCart(
    [
      item({ ref: "a", playerName: "Mateo Alvarez", feeCents: 18_500, earlyBird: EARLY }),
      item({ ref: "b", playerName: "Lucia Alvarez", feeCents: 18_500, earlyBird: EARLY }),
    ],
    SETTINGS,
    { scholarship: null, asOf: "2026-07-15", plan: "per_registration", applicationFeeCents: 150 },
  );
  // Both 18500 - 2000 = 16500; the second then loses 15% of 16500 = 2475 -> 14025.
  const amounts = quote.lines.map((l) => l.amountCents).sort((a, b) => b - a);
  assert.deepEqual(amounts, [16_500, 14_025]);
  assert.equal(quote.subtotalCents, 30_525);
});

test("when the club absorbs our fee the parent's total is the subtotal", () => {
  const quote = quoteCart([item()], { ...SETTINGS, absorbPlatformFee: true }, {
    scholarship: null,
    asOf: "2026-08-04",
    plan: "per_registration",
    applicationFeeCents: 150,
  });
  assert.equal(quote.platformFeeCents, 150);
  assert.equal(quote.totalCents, 18_500);
});

/* ------------------------------------------------------ codes + plans --- */

test("scholarship codes are case-insensitive and respect their use limit", () => {
  const codes: ScholarshipCode[] = [
    { code: "TOWNFUND", label: "Town fund", percentBps: 5000, flatCents: 0, maxUses: 2, uses: 2 },
    { code: "REC50", label: "Rec 50", percentBps: 0, flatCents: 5_000, maxUses: 0, uses: 99 },
  ];
  assert.equal(findScholarshipCode(codes, "rec50").code?.code, "REC50");
  assert.equal(findScholarshipCode(codes, "  REC50 ").code?.code, "REC50");
  assert.match(findScholarshipCode(codes, "TOWNFUND").error!, /fully claimed/);
  assert.match(findScholarshipCode(codes, "nope").error!, /don't recognise/);
  assert.equal(findScholarshipCode(codes, "").code, null);
  assert.equal(findScholarshipCode(codes, "").error, null);
});

test("a deposit plan splits the remainder into monthly payments that sum exactly", () => {
  const plan = buildInstallmentPlan(18_500, 5_000, 3, "2026-08-04", addMonthsIso, splitCents)!;
  assert.equal(plan.depositCents, 5_000);
  assert.deepEqual(plan.installments.map((i) => i.dueOn), [
    "2026-09-04",
    "2026-10-04",
    "2026-11-04",
  ]);
  assert.equal(
    plan.depositCents + plan.installments.reduce((s, i) => s + i.amountCents, 0),
    18_500,
  );
  assert.deepEqual(plan.installments.map((i) => i.amountCents), [4_500, 4_500, 4_500]);
});

test("a deposit that covers the whole fee is not a plan", () => {
  assert.equal(buildInstallmentPlan(18_500, 18_500, 3, "2026-08-04", addMonthsIso, splitCents), null);
  assert.equal(buildInstallmentPlan(0, 0, 3, "2026-08-04", addMonthsIso, splitCents), null);
});
