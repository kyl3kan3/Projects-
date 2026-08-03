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

/* ---------------------------------------- awkward cents, checked by hand --- */

test("a percentage discount on an odd fee rounds once, half up", () => {
  // $187.77 with 15% off: 15% is 2816.55, which rounds to 2817, leaving 15960.
  const priced = priceRegistration({
    feeCents: 18_777,
    earlyBird: null,
    siblingDiscountBps: 1500,
    siblingDiscountFlatCents: 0,
    siblingIndex: 1,
    scholarship: null,
    asOf: "2026-08-04",
    plan: "per_registration",
    applicationFeeCents: 150,
  });
  assert.equal(priced.discounts[0].amountCents, 2_817);
  assert.equal(priced.amountCents, 15_960);
  assert.equal(priced.feeCents - priced.discounts[0].amountCents, priced.amountCents);
});

test("three discounts stack on the running subtotal, not the original fee", () => {
  // $185.00, $20 early bird, then 15% sibling, then a 50% code.
  //   185.00 − 20.00            = 165.00
  //   165.00 − 15% (24.75)      = 140.25
  //   140.25 − 50% (70.13)      =  70.12   (70.125 rounds half-up to 70.13)
  const priced = priceRegistration({
    feeCents: 18_500,
    earlyBird: { endsOn: "2026-07-31", percentBps: 0, flatCents: 2_000 },
    siblingDiscountBps: 1500,
    siblingDiscountFlatCents: 0,
    siblingIndex: 1,
    scholarship: {
      code: "REC50",
      label: "Rec department half",
      percentBps: 5000,
      flatCents: 0,
      maxUses: 0,
      uses: 0,
    },
    asOf: "2026-07-15",
    plan: "per_registration",
    applicationFeeCents: 150,
  });
  assert.deepEqual(
    priced.discounts.map((d) => [d.kind, d.amountCents]),
    [
      ["early_bird", 2_000],
      ["sibling", 2_475],
      ["scholarship", 7_013],
    ],
  );
  assert.equal(priced.amountCents, 7_012);
  // Every cent accounted for: fee = amount + discounts.
  assert.equal(
    priced.amountCents + priced.discounts.reduce((s, d) => s + d.amountCents, 0),
    priced.feeCents,
  );
  // A scholarship was involved, so we take nothing.
  assert.equal(priced.platformFeeCents, 0);
});

test("a percent-and-flat early bird applies the percentage to the fee, then the flat amount", () => {
  // 10% of 185.00 is 18.50, plus a flat 5.00 → 23.50 off.
  const priced = priceRegistration({
    feeCents: 18_500,
    earlyBird: { endsOn: null, percentBps: 1000, flatCents: 500 },
    siblingDiscountBps: 0,
    siblingDiscountFlatCents: 0,
    siblingIndex: 0,
    scholarship: null,
    asOf: "2026-08-04",
    plan: "per_registration",
    applicationFeeCents: 150,
  });
  assert.equal(priced.discounts[0].amountCents, 2_350);
  assert.equal(priced.amountCents, 16_150);
});

test("an early bird with no end date runs all season", () => {
  for (const asOf of ["2026-01-01", "2026-08-04", "2026-12-31"]) {
    const priced = priceRegistration({
      feeCents: 18_500,
      earlyBird: { endsOn: null, percentBps: 0, flatCents: 2_000 },
      siblingDiscountBps: 0,
      siblingDiscountFlatCents: 0,
      siblingIndex: 0,
      scholarship: null,
      asOf,
      plan: "per_registration",
      applicationFeeCents: 150,
    });
    assert.equal(priced.amountCents, 16_500, `should apply on ${asOf}`);
  }
});

test("a zero-value discount leaves no line on the parent's summary", () => {
  const priced = priceRegistration({
    feeCents: 18_500,
    earlyBird: { endsOn: "2026-12-31", percentBps: 0, flatCents: 0 },
    siblingDiscountBps: 0,
    siblingDiscountFlatCents: 0,
    siblingIndex: 3,
    scholarship: { code: "X", label: "Nothing", percentBps: 0, flatCents: 0, maxUses: 0, uses: 0 },
    asOf: "2026-08-04",
    plan: "per_registration",
    applicationFeeCents: 150,
  });
  assert.deepEqual(priced.discounts, []);
  assert.equal(priced.amountCents, 18_500);
  // No discount was applied, so this is a normal paid place and we take our fee.
  assert.equal(priced.platformFeeCents, 150);
});

test("a free division never carries our fee", () => {
  const priced = priceRegistration({
    feeCents: 0,
    earlyBird: null,
    siblingDiscountBps: 0,
    siblingDiscountFlatCents: 0,
    siblingIndex: 0,
    scholarship: null,
    asOf: "2026-08-04",
    plan: "per_registration",
    applicationFeeCents: 150,
  });
  assert.equal(priced.amountCents, 0);
  assert.equal(priced.platformFeeCents, 0);
});

test("six children: the discount lands on five of them and the fee on all six", () => {
  const kids = [18_500, 18_500, 14_000, 14_000, 21_000, 9_500];
  const quote = quoteCart(
    kids.map((feeCents, i) =>
      item({ ref: `c${i}`, playerName: `Child ${i}`, feeCents, divisionId: `d${i}` }),
    ),
    SETTINGS,
    { scholarship: null, asOf: "2026-08-04", plan: "per_registration", applicationFeeCents: 150 },
  );
  // Full price on the most expensive place (21000); 15% off the other five.
  const fullPrice = quote.lines.filter((l) => l.discounts.length === 0);
  assert.equal(fullPrice.length, 1);
  assert.equal(fullPrice[0].amountCents, 21_000);
  assert.equal(quote.platformFeeCents, 6 * 150);
  // Hand-checked total: 21000 + 0.85 × (18500+18500+14000+14000+9500)
  //                   = 21000 + 0.85 × 74500 = 21000 + 63325 = 84325.
  assert.equal(quote.subtotalCents, 84_325);
  assert.equal(quote.discountTotalCents, 74_500 - 63_325);
  assert.equal(quote.totalCents, 84_325 + 900);
});

test("a cart of only waitlisted children charges nothing at all", () => {
  const quote = quoteCart(
    [
      item({ ref: "a", playerName: "Amir", waitlisted: true }),
      item({ ref: "b", playerName: "Layla", feeCents: 14_000, waitlisted: true }),
    ],
    SETTINGS,
    { scholarship: null, asOf: "2026-08-04", plan: "per_registration", applicationFeeCents: 150 },
  );
  assert.equal(quote.subtotalCents, 0);
  assert.equal(quote.platformFeeCents, 0);
  assert.equal(quote.totalCents, 0);
  assert.equal(quote.discountTotalCents, 0);
  // Both are still priced, so a promotion charges the fee agreed today.
  assert.deepEqual(quote.lines.map((l) => l.amountCents), [18_500, 14_000]);
});

test("the cart keeps the parent's order while pricing in fee order", () => {
  const quote = quoteCart(
    [
      item({ ref: "youngest", playerName: "Zoe", feeCents: 9_500 }),
      item({ ref: "eldest", playerName: "Adam", feeCents: 21_000 }),
    ],
    SETTINGS,
    { scholarship: null, asOf: "2026-08-04", plan: "per_registration", applicationFeeCents: 150 },
  );
  // Rendered in the order typed…
  assert.deepEqual(quote.lines.map((l) => l.ref), ["youngest", "eldest"]);
  // …but the discount landed on the cheaper place.
  assert.equal(quote.lines[0].discounts.length, 1);
  assert.equal(quote.lines[1].discounts.length, 0);
});

test("a flat-plan club's cart carries no fee on any child", () => {
  const quote = quoteCart(
    [item({ ref: "a" }), item({ ref: "b", feeCents: 14_000, playerName: "Second" })],
    SETTINGS,
    { scholarship: null, asOf: "2026-08-04", plan: "flat", applicationFeeCents: 150 },
  );
  assert.equal(quote.platformFeeCents, 0);
  assert.equal(quote.totalCents, quote.subtotalCents);
});

/* ------------------------------------------------- installment invariants --- */

test("installments always sum to the balance, for every awkward split", () => {
  for (const amount of [18_500, 21_001, 9_999, 100_003, 5_001]) {
    for (const deposit of [0, 1, 5_000, amount - 1]) {
      for (const count of [1, 2, 3, 4, 7, 12]) {
        const plan = buildInstallmentPlan(amount, deposit, count, "2026-08-04", addMonthsIso, splitCents);
        if (!plan) continue;
        const total = plan.depositCents + plan.installments.reduce((s, i) => s + i.amountCents, 0);
        assert.equal(total, amount, `${amount} / deposit ${deposit} / ${count} parts`);
        assert.equal(plan.installments.length, count);
        assert.ok(plan.installments.every((i) => i.amountCents >= 0));
        // Due dates are strictly increasing and start next month.
        const dates = plan.installments.map((i) => i.dueOn);
        assert.deepEqual([...dates].sort(), dates);
        assert.equal(dates[0], addMonthsIso("2026-08-04", 1));
      }
    }
  }
});

test("a deposit larger than the fee is clamped, and leaves no plan", () => {
  assert.equal(buildInstallmentPlan(10_000, 20_000, 3, "2026-08-04", addMonthsIso, splitCents), null);
});

test("a one-cent remainder still produces a payable plan", () => {
  const plan = buildInstallmentPlan(5_001, 5_000, 1, "2026-08-04", addMonthsIso, splitCents)!;
  assert.equal(plan.depositCents, 5_000);
  assert.deepEqual(plan.installments, [{ dueOn: "2026-09-04", amountCents: 1 }]);
});

test("a plan from the 31st never lands on a date that does not exist", () => {
  const plan = buildInstallmentPlan(30_000, 6_000, 6, "2026-01-31", addMonthsIso, splitCents)!;
  assert.deepEqual(plan.installments.map((i) => i.dueOn), [
    "2026-02-28",
    "2026-03-31",
    "2026-04-30",
    "2026-05-31",
    "2026-06-30",
    "2026-07-31",
  ]);
  assert.equal(
    plan.depositCents + plan.installments.reduce((s, i) => s + i.amountCents, 0),
    30_000,
  );
});

test("splitting never loses or invents a cent, across a wide sweep", () => {
  for (let total = 0; total < 400; total++) {
    for (const parts of [1, 2, 3, 5, 7, 13]) {
      const split = splitCents(total, parts);
      assert.equal(split.length, parts);
      assert.equal(split.reduce((a, b) => a + b, 0), total, `${total} into ${parts}`);
      // The remainder lands on the earliest instalments, so amounts never rise.
      assert.deepEqual([...split].sort((a, b) => b - a), split);
    }
  }
  assert.deepEqual(splitCents(100, 0), []);
  assert.deepEqual(splitCents(100, -1), []);
});

test("basis points are exact at the boundaries a club will actually set", () => {
  assert.equal(basisPoints(18_500, 0), 0);
  assert.equal(basisPoints(18_500, 10_000), 18_500); // 100%
  assert.equal(basisPoints(18_500, 500), 925); // 5%
  assert.equal(basisPoints(18_500, 3_333), 6_166); // 33.33% → 6166.05
  assert.equal(basisPoints(1, 5_000), 1); // half a cent rounds up
  assert.equal(basisPoints(0, 5_000), 0);
});
