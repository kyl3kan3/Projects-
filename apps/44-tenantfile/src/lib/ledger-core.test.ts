/**
 * Ledger fixtures, checked by hand.
 *
 * Every expected number in this file was worked out on paper first, the way a
 * landlord would with their bank statement next to them. Where a figure comes
 * from arithmetic that is easy to get wrong (proration, percentage fees) the
 * calculation is written out in the comment above the assertion.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assessLateFee,
  computeLedger,
  lateFeeAmount,
  lateFeeEarliestDate,
  ledgerStrip,
  collectedForPeriod,
  describeLateFeeRule,
  type LedgerCharge,
  type LedgerPayment,
} from "@/lib/ledger-core";
import {
  daysInMonth,
  dueDateFor,
  formatMoney,
  formatMoneyShort,
  parseMoneyToCents,
  prorateCents,
  prorateFirstMonth,
  prorateLastMonth,
  addMonthsToPeriod,
  formatPeriod,
} from "@/lib/money";
import { generationHorizon, plannedCharges, reminderPlan } from "@/lib/schedule";

const RENT = 185_000; // $1,850.00

function rent(period: string, dueOn: string, amountCents = RENT, id = `rent-${period}`): LedgerCharge {
  return { id, kind: "rent", amountCents, dueOn, period, waived: false };
}

function paid(
  amountCents: number,
  paidAt: string,
  chargeId: string | null = null,
  extra: Partial<LedgerPayment> = {},
): LedgerPayment {
  return {
    id: `pay-${paidAt}-${amountCents}`,
    chargeId,
    amountCents,
    method: "manual_zelle",
    status: "succeeded",
    paidAt: new Date(`${paidAt}T17:00:00.000Z`),
    ...extra,
  };
}

/** The invariant that makes the ledger auditable. Asserted on every fixture. */
function assertReconciles(charges: LedgerCharge[], payments: LedgerPayment[], asOf: string) {
  const l = computeLedger(charges, payments, asOf);
  const finalLine = l.lines.at(-1);
  const finalBalance = finalLine ? finalLine.balanceCents : 0;
  assert.equal(
    finalBalance,
    l.balanceCents - l.creditCents,
    "statement's final running balance must equal balance minus credit",
  );
  assert.equal(l.chargedCents - l.paidCents, l.balanceCents - l.creditCents);
  const outstanding = l.charges.reduce((s, c) => s + c.outstandingCents, 0);
  assert.equal(outstanding, l.balanceCents, "sum of outstanding charges must equal the balance");
  return l;
}

describe("money primitives", () => {
  it("formats cents without ever touching a float", () => {
    assert.equal(formatMoney(185_000), "$1,850.00");
    assert.equal(formatMoney(0), "$0.00");
    assert.equal(formatMoney(5), "$0.05");
    assert.equal(formatMoney(-12_345), "-$123.45");
    assert.equal(formatMoney(1_234_567_89), "$1,234,567.89");
    assert.equal(formatMoneyShort(185_000), "$1,850");
    assert.equal(formatMoneyShort(185_050), "$1,850.50");
  });

  it("parses what a landlord actually types", () => {
    assert.equal(parseMoneyToCents("1850"), 185_000);
    assert.equal(parseMoneyToCents("$1,850.00"), 185_000);
    assert.equal(parseMoneyToCents(" 1850.5 "), 185_050);
    assert.equal(parseMoneyToCents("0.07"), 7);
    assert.throws(() => parseMoneyToCents("eighteen fifty"));
    assert.throws(() => parseMoneyToCents("1850.005"));
    assert.throws(() => parseMoneyToCents(""));
  });

  it("knows its calendar", () => {
    assert.equal(daysInMonth(2026, 2), 28);
    assert.equal(daysInMonth(2028, 2), 29); // leap
    assert.equal(daysInMonth(2026, 8), 31);
    assert.equal(daysInMonth(2026, 9), 30);
  });

  it("never lets a rent day wander past the end of a short month", () => {
    // A tenancy with rent due on the 31st still pays on the last day of February.
    assert.equal(dueDateFor("2026-02", 31), "2026-02-28");
    assert.equal(dueDateFor("2026-01", 31), "2026-01-31");
    assert.equal(dueDateFor("2026-08", 1), "2026-08-01");
    assert.equal(dueDateFor("2026-08", 0), "2026-08-01");
  });

  it("labels periods in the mono style DESIGN.md asks for", () => {
    assert.equal(formatPeriod("2026-08"), "AUG 2026");
    assert.equal(addMonthsToPeriod("2026-12", 1), "2027-01");
    assert.equal(addMonthsToPeriod("2026-01", -1), "2025-12");
    assert.equal(addMonthsToPeriod("2026-08", 12), "2027-08");
  });
});

describe("proration", () => {
  it("prices a mid-month move-in at that month's own daily rate", () => {
    // Move in 12 Aug 2026. August has 31 days; the tenant holds the keys
    // 12..31 inclusive = 20 days. 185000 * 20 / 31 = 119354.83… -> 119355.
    assert.equal(prorateFirstMonth(RENT, "2026-08-12"), 119_355);
  });

  it("prices a mid-month move-out on the days actually held", () => {
    // Term ends 14 Jul 2027: days 1..14 = 14 days. 185000 * 14 / 31 = 83548.38… -> 83548.
    assert.equal(prorateLastMonth(RENT, "2027-07-14"), 83_548);
  });

  it("charges the full month when the term covers the whole month", () => {
    assert.equal(prorateFirstMonth(RENT, "2026-08-01"), RENT);
    assert.equal(prorateLastMonth(RENT, "2026-08-31"), RENT);
    // February, in full, is still a full month of rent — not 28/31 of one.
    assert.equal(prorateFirstMonth(RENT, "2026-02-01"), RENT);
    assert.equal(prorateLastMonth(RENT, "2026-02-28"), RENT);
  });

  it("uses the short month's own divisor", () => {
    // 16 Feb 2026: 28 - 16 + 1 = 13 days. 185000 * 13 / 28 = 85892.85… -> 85893.
    assert.equal(prorateFirstMonth(RENT, "2026-02-16"), 85_893);
  });

  it("handles the degenerate cases without producing nonsense", () => {
    assert.equal(prorateCents(RENT, 2026, 8, 0), 0);
    assert.equal(prorateCents(RENT, 2026, 8, 99), RENT); // clamped to the month
    assert.equal(prorateCents(0, 2026, 8, 15), 0);
    // One day of an odd rent: 100003 * 1 / 31 = 3225.9… -> 3226.
    assert.equal(prorateCents(100_003, 2026, 8, 1), 3_226);
  });
});

describe("plannedCharges", () => {
  const base = {
    rentCents: RENT,
    depositCents: 185_000,
    rentDueDay: 1,
    prorateFirstMonth: true,
    prorateLastMonth: true,
  };

  it("bills deposit, prorated first month, then whole months", () => {
    const plan = plannedCharges(
      { ...base, startsOn: "2026-08-12", endsOn: "2027-08-11" },
      "2026-10",
    );
    assert.deepEqual(
      plan.map((c) => [c.kind, c.period, c.dueOn, c.amountCents, c.prorated]),
      [
        ["deposit", null, "2026-08-12", 185_000, false],
        // Due on the move-in day, not the 1st: rent cannot be due before the keys.
        ["rent", "2026-08", "2026-08-12", 119_355, true],
        ["rent", "2026-09", "2026-09-01", 185_000, false],
        ["rent", "2026-10", "2026-10-01", 185_000, false],
      ],
    );
  });

  it("stops at the end of the term, and prorates the final month", () => {
    const plan = plannedCharges(
      { ...base, depositCents: 0, startsOn: "2027-06-01", endsOn: "2027-07-14" },
      "2027-12",
    );
    assert.deepEqual(
      plan.map((c) => [c.period, c.amountCents, c.prorated]),
      [
        ["2027-06", 185_000, false],
        ["2027-07", 83_548, true],
      ],
    );
  });

  it("prorates a month that is both the first and the last", () => {
    // 8 Sep to 22 Sep 2026 = 15 days of a 30-day month. 185000*15/30 = 92500.
    const plan = plannedCharges(
      { ...base, depositCents: 0, startsOn: "2026-09-08", endsOn: "2026-09-22" },
      "2026-12",
    );
    assert.deepEqual(plan.map((c) => [c.period, c.amountCents, c.prorated]), [["2026-09", 92_500, true]]);
  });

  it("honours a landlord who does not prorate", () => {
    const plan = plannedCharges(
      { ...base, depositCents: 0, prorateFirstMonth: false, startsOn: "2026-08-12", endsOn: null },
      "2026-09",
    );
    assert.deepEqual(plan.map((c) => [c.period, c.amountCents, c.prorated]), [
      ["2026-08", 185_000, false],
      ["2026-09", 185_000, false],
    ]);
  });

  it("respects a rent day other than the 1st", () => {
    const plan = plannedCharges(
      { ...base, depositCents: 0, rentDueDay: 5, startsOn: "2026-08-01", endsOn: null },
      "2026-09",
    );
    assert.deepEqual(plan.map((c) => c.dueOn), ["2026-08-05", "2026-09-05"]);
  });

  it("generates nothing beyond the horizon", () => {
    const plan = plannedCharges({ ...base, depositCents: 0, startsOn: "2026-08-01", endsOn: null }, "2026-08");
    assert.equal(plan.length, 1);
    assert.equal(generationHorizon("2026-08-17"), "2026-09");
    assert.equal(generationHorizon("2026-12-31"), "2027-01");
  });
});

describe("computeLedger — the ledger a landlord audits", () => {
  it("is empty and balanced with no rows at all", () => {
    const l = assertReconciles([], [], "2026-08-10");
    assert.equal(l.balanceCents, 0);
    assert.equal(l.creditCents, 0);
    assert.equal(l.lines.length, 0);
    assert.equal(l.oldestDue, null);
  });

  it("marks a charge upcoming before its due date and due after", () => {
    const charges = [rent("2026-09", "2026-09-01")];
    assert.equal(computeLedger(charges, [], "2026-08-20").charges[0].status, "upcoming");
    assert.equal(computeLedger(charges, [], "2026-09-01").charges[0].status, "due");
  });

  it("settles a charge paid in full, to the cent", () => {
    const charges = [rent("2026-08", "2026-08-01")];
    const l = assertReconciles(charges, [paid(185_000, "2026-08-01", "rent-2026-08")], "2026-08-05");
    assert.equal(l.charges[0].status, "paid");
    assert.equal(l.balanceCents, 0);
    assert.equal(l.paidCents, 185_000);
  });

  it("records a partial payment as partial, not paid", () => {
    // $900 of $1,850 leaves $950 owing.
    const charges = [rent("2026-08", "2026-08-01")];
    const l = assertReconciles(charges, [paid(90_000, "2026-08-03", "rent-2026-08")], "2026-08-05");
    assert.equal(l.charges[0].status, "partial");
    assert.equal(l.charges[0].allocatedCents, 90_000);
    assert.equal(l.charges[0].outstandingCents, 95_000);
    assert.equal(l.balanceCents, 95_000);
  });

  it("adds up two partial payments into a settled charge", () => {
    const charges = [rent("2026-08", "2026-08-01")];
    const l = assertReconciles(
      charges,
      [paid(90_000, "2026-08-03", "rent-2026-08"), paid(95_000, "2026-08-09", "rent-2026-08")],
      "2026-08-10",
    );
    assert.equal(l.charges[0].status, "paid");
    assert.equal(l.balanceCents, 0);
  });

  it("spills an overpayment onto the next charge instead of losing it", () => {
    // Tenant sends $2,000 against August rent of $1,850: $150 rolls to September.
    const charges = [rent("2026-08", "2026-08-01"), rent("2026-09", "2026-09-01")];
    const l = assertReconciles(charges, [paid(200_000, "2026-08-01", "rent-2026-08")], "2026-08-05");
    assert.equal(l.charges[0].status, "paid");
    assert.equal(l.charges[1].allocatedCents, 15_000);
    assert.equal(l.charges[1].status, "partial");
    assert.equal(l.balanceCents, 170_000); // 185000 - 15000
  });

  it("keeps a true overpayment as credit, not as a negative balance", () => {
    const charges = [rent("2026-08", "2026-08-01")];
    const l = assertReconciles(charges, [paid(200_000, "2026-08-01", "rent-2026-08")], "2026-08-05");
    assert.equal(l.balanceCents, 0);
    assert.equal(l.creditCents, 15_000);
  });

  it("applies an unattached payment to the oldest debt first", () => {
    // Two months owing; a $1,850 Zelle with no charge attached clears August.
    const charges = [rent("2026-08", "2026-08-01"), rent("2026-09", "2026-09-01")];
    const l = assertReconciles(charges, [paid(185_000, "2026-09-02")], "2026-09-05");
    assert.equal(l.charges[0].status, "paid");
    assert.equal(l.charges[1].status, "due");
    assert.equal(l.balanceCents, 185_000);
  });

  it("pays the deposit before the rent when both fall on move-in day", () => {
    const charges: LedgerCharge[] = [
      { id: "dep", kind: "deposit", amountCents: 185_000, dueOn: "2026-08-01", period: null, waived: false },
      rent("2026-08", "2026-08-01"),
    ];
    const l = assertReconciles(charges, [paid(185_000, "2026-08-01")], "2026-08-01");
    assert.equal(l.charges.find((c) => c.charge.id === "dep")!.status, "paid");
    assert.equal(l.charges.find((c) => c.charge.id === "rent-2026-08")!.status, "due");
  });

  it("pays rent before a late fee raised on the same day", () => {
    const charges: LedgerCharge[] = [
      rent("2026-08", "2026-08-01"),
      {
        id: "fee",
        kind: "late_fee",
        amountCents: 5_000,
        dueOn: "2026-08-01",
        period: null,
        waived: false,
        sourceChargeId: "rent-2026-08",
      },
    ];
    const l = assertReconciles(charges, [paid(185_000, "2026-08-09")], "2026-08-09");
    assert.equal(l.charges.find((c) => c.charge.id === "rent-2026-08")!.status, "paid");
    assert.equal(l.charges.find((c) => c.charge.id === "fee")!.outstandingCents, 5_000);
    assert.equal(l.balanceCents, 5_000);
  });

  it("drops a waived charge out of the balance but keeps it on the record", () => {
    const charges: LedgerCharge[] = [
      rent("2026-08", "2026-08-01"),
      {
        id: "fee",
        kind: "late_fee",
        amountCents: 5_000,
        dueOn: "2026-08-07",
        period: null,
        waived: true,
      },
    ];
    const l = assertReconciles(charges, [], "2026-08-10");
    assert.equal(l.balanceCents, 185_000);
    assert.equal(l.charges.find((c) => c.charge.id === "fee")!.status, "waived");
    // Still on the statement, at zero, so the waiver is visible.
    const line = l.lines.find((x) => x.id === "fee")!;
    assert.equal(line.deltaCents, 0);
    assert.match(line.detail, /waived/);
  });

  it("spills a payment attached to a charge that was later waived", () => {
    const charges: LedgerCharge[] = [
      { id: "fee", kind: "late_fee", amountCents: 5_000, dueOn: "2026-08-07", period: null, waived: true },
      rent("2026-09", "2026-09-01"),
    ];
    const l = assertReconciles(charges, [paid(5_000, "2026-08-08", "fee")], "2026-09-02");
    assert.equal(l.charges.find((c) => c.charge.id === "fee")!.allocatedCents, 0);
    assert.equal(l.charges.find((c) => c.charge.id === "rent-2026-09")!.allocatedCents, 5_000);
  });

  it("does not count an ACH payment that has not settled", () => {
    const charges = [rent("2026-08", "2026-08-01")];
    const inFlight = paid(185_000, "2026-08-01", "rent-2026-08", { method: "ach", status: "processing" });
    const l = assertReconciles(charges, [inFlight], "2026-08-02");
    assert.equal(l.balanceCents, 185_000);
    assert.equal(l.processingCents, 185_000);
    assert.equal(l.charges[0].status, "due");
  });

  it("ignores a failed payment entirely", () => {
    const charges = [rent("2026-08", "2026-08-01")];
    const failed = paid(185_000, "2026-08-01", "rent-2026-08", { method: "ach", status: "failed" });
    const l = assertReconciles(charges, [failed], "2026-08-02");
    assert.equal(l.balanceCents, 185_000);
    assert.equal(l.processingCents, 0);
    assert.equal(l.paidCents, 0);
  });

  it("reconciles a whole year with a partial month, a late fee and a waiver", () => {
    // Hand-checked worksheet. Tenancy: $1,850/mo, moved in 12 Aug 2026,
    // deposit $1,850.
    //   deposit                       1,850.00
    //   Aug rent (20/31 days)         1,193.55
    //   Sep rent                      1,850.00
    //   Oct rent                      1,850.00
    //   Oct late fee (flat $50)          50.00
    //   Nov rent (waived, storm)          0.00
    //   charged total                 6,793.55
    // Payments: 3,043.55 (deposit + Aug) on 12 Aug, 1,850.00 on 1 Sep,
    //           1,000.00 on 4 Oct, 900.00 on 20 Oct  => 6,793.55 paid
    //   balance 0.00, credit 0.00
    const charges: LedgerCharge[] = [
      { id: "dep", kind: "deposit", amountCents: 185_000, dueOn: "2026-08-12", period: null, waived: false },
      rent("2026-08", "2026-08-12", 119_355),
      rent("2026-09", "2026-09-01"),
      rent("2026-10", "2026-10-01"),
      {
        id: "fee-oct",
        kind: "late_fee",
        amountCents: 5_000,
        dueOn: "2026-10-07",
        period: null,
        waived: false,
        sourceChargeId: "rent-2026-10",
      },
      { id: "rent-2026-11", kind: "rent", amountCents: 185_000, dueOn: "2026-11-01", period: "2026-11", waived: true },
    ];
    const payments: LedgerPayment[] = [
      paid(304_355, "2026-08-12"),
      paid(185_000, "2026-09-01", "rent-2026-09"),
      paid(100_000, "2026-10-04", "rent-2026-10"),
      paid(90_000, "2026-10-20"),
    ];

    const l = assertReconciles(charges, payments, "2026-11-05");
    assert.equal(l.chargedCents, 679_355);
    assert.equal(l.paidCents, 679_355);
    assert.equal(l.balanceCents, 0);
    assert.equal(l.creditCents, 0);
    assert.deepEqual(
      l.charges.map((c) => [c.charge.id, c.status]),
      [
        ["dep", "paid"],
        ["rent-2026-08", "paid"],
        ["rent-2026-09", "paid"],
        ["rent-2026-10", "paid"],
        ["fee-oct", "paid"],
        ["rent-2026-11", "waived"],
      ],
    );
    // The statement reads like a bank statement: 10 lines, ending at zero.
    assert.equal(l.lines.length, 10);
    assert.equal(l.lines.at(-1)!.balanceCents, 0);
  });

  it("orders the statement by date with charges before payments on the same day", () => {
    const charges = [rent("2026-08", "2026-08-01")];
    const l = computeLedger(charges, [paid(185_000, "2026-08-01", "rent-2026-08")], "2026-08-02");
    assert.deepEqual(
      l.lines.map((x) => [x.kind, x.balanceCents]),
      [
        ["charge", 185_000],
        ["payment", 0],
      ],
    );
  });

  it("finds the oldest still-owing charge for the reminder engine", () => {
    const charges = [rent("2026-08", "2026-08-01"), rent("2026-09", "2026-09-01")];
    const l = computeLedger(charges, [paid(185_000, "2026-09-01", "rent-2026-09")], "2026-09-10");
    assert.equal(l.oldestDue!.charge.id, "rent-2026-08");
  });
});

describe("late fees", () => {
  const flat = { graceDays: 5, kind: "flat" as const, amount: 5_000, maxPerMonthCents: null, enabled: true };
  const pct = { graceDays: 5, kind: "percent" as const, amount: 500, maxPerMonthCents: null, enabled: true };

  it("computes a flat fee", () => {
    assert.equal(lateFeeAmount(flat, 185_000), 5_000);
    assert.equal(lateFeeAmount(flat, 1), 5_000);
    assert.equal(lateFeeAmount(flat, 0), 0);
  });

  it("computes a percentage of what is still owed", () => {
    // 5% of 1,850.00 = 92.50
    assert.equal(lateFeeAmount(pct, 185_000), 9_250);
    // 5% of 50.00 = 2.50 — the tenant who paid all but fifty dollars
    assert.equal(lateFeeAmount(pct, 5_000), 250);
    // 5% of 1.99 = 0.0995 -> rounds to 0.10
    assert.equal(lateFeeAmount(pct, 199), 10);
  });

  it("obeys the monthly cap the landlord acknowledged", () => {
    const capped = { ...pct, maxPerMonthCents: 7_500 };
    assert.equal(lateFeeAmount(capped, 185_000), 7_500);
    assert.equal(lateFeeAmount(capped, 100_000), 5_000); // 5% of 1,000 is under the cap
  });

  it("never returns a negative fee", () => {
    assert.equal(lateFeeAmount({ ...flat, amount: -5_000 }, 185_000), 0);
  });

  it("waits out the grace period to the day", () => {
    // Due 1 Aug, 5 grace days: nothing before 7 Aug.
    assert.equal(lateFeeEarliestDate("2026-08-01", 5), "2026-08-07");
    assert.equal(lateFeeEarliestDate("2026-08-01", 0), "2026-08-02");
    // Grace crossing a month boundary.
    assert.equal(lateFeeEarliestDate("2026-08-29", 5), "2026-09-04");
  });

  it("assesses only when it should", () => {
    const ledger = computeLedger([rent("2026-08", "2026-08-01")], [], "2026-08-07");
    const state = ledger.charges[0];

    assert.equal(assessLateFee(flat, state, "2026-08-06"), null, "inside grace");
    const hit = assessLateFee(flat, state, "2026-08-07");
    assert.equal(hit!.amountCents, 5_000);
    assert.equal(hit!.sourceChargeId, "rent-2026-08");
    assert.equal(hit!.dueOn, "2026-08-07");

    assert.equal(assessLateFee({ ...flat, enabled: false }, state, "2026-08-09"), null, "rule off");

    const settled = computeLedger(
      [rent("2026-08", "2026-08-01")],
      [paid(185_000, "2026-08-02", "rent-2026-08")],
      "2026-08-09",
    );
    assert.equal(assessLateFee(flat, settled.charges[0], "2026-08-09"), null, "already paid");

    const waived = computeLedger(
      [{ ...rent("2026-08", "2026-08-01"), waived: true }],
      [],
      "2026-08-09",
    );
    assert.equal(assessLateFee(flat, waived.charges[0], "2026-08-09"), null, "waived");
  });

  it("never assesses a late fee on a late fee", () => {
    const l = computeLedger(
      [
        {
          id: "fee",
          kind: "late_fee",
          amountCents: 5_000,
          dueOn: "2026-08-07",
          period: null,
          waived: false,
        },
      ],
      [],
      "2026-09-30",
    );
    assert.equal(assessLateFee(flat, l.charges[0], "2026-09-30"), null);
  });

  it("charges a fee on the unpaid remainder of a partly paid month", () => {
    // $1,850 rent, $1,800 paid, 5% rule -> 5% of $50 = $2.50
    const l = computeLedger(
      [rent("2026-08", "2026-08-01")],
      [paid(180_000, "2026-08-02", "rent-2026-08")],
      "2026-08-08",
    );
    assert.equal(assessLateFee(pct, l.charges[0], "2026-08-08")!.amountCents, 250);
  });

  it("describes itself in plain words for the lease and the UI", () => {
    assert.equal(describeLateFeeRule(flat), "$50.00 flat after 5 grace days");
    assert.equal(describeLateFeeRule(pct), "5.00% of the unpaid rent after 5 grace days");
    assert.equal(
      describeLateFeeRule({ ...pct, maxPerMonthCents: 7_500, graceDays: 1 }),
      "5.00% of the unpaid rent after 1 grace day, capped at $75.00",
    );
    assert.equal(describeLateFeeRule({ ...flat, enabled: false }), "No late fee");
  });
});

describe("ledger strip and portfolio roll-up", () => {
  it("fills twelve cells, leaving months without a charge empty", () => {
    const charges = [
      rent("2026-08", "2026-08-01"),
      rent("2026-09", "2026-09-01"),
      rent("2026-10", "2026-10-01"),
    ];
    const l = computeLedger(charges, [paid(185_000, "2026-08-01", "rent-2026-08")], "2026-09-14");
    const strip = ledgerStrip(l, 2026, "2026-09-14");
    assert.equal(strip.length, 12);
    assert.equal(strip[7].status, "paid"); // August
    assert.equal(strip[8].status, "due"); // September, 13 days late
    assert.equal(strip[8].lateDays, 13);
    assert.equal(strip[9].status, "upcoming"); // October
    assert.equal(strip[0].status, "none"); // January, before the tenancy
  });

  it("adds up collected rent for the hero stat", () => {
    const a = computeLedger([rent("2026-08", "2026-08-01")], [paid(185_000, "2026-08-01", "rent-2026-08")], "2026-08-14");
    const b = computeLedger(
      [rent("2026-08", "2026-08-01", 142_500, "rent-b")],
      [paid(70_000, "2026-08-05", "rent-b")],
      "2026-08-14",
    );
    const { collectedCents, billedCents } = collectedForPeriod([a, b], "2026-08");
    assert.equal(billedCents, 327_500);
    assert.equal(collectedCents, 255_000);
  });
});

describe("reminder plan", () => {
  it("lays out the ladder relative to the due date", () => {
    const plan = reminderPlan("2026-08-01", 5, { reminderUpcomingDays: 3 });
    assert.deepEqual(
      plan.map((p) => [p.template, p.channel, p.sendAt.toISOString()]),
      [
        ["upcoming", "email", "2026-07-29T15:00:00.000Z"],
        ["due", "email", "2026-08-01T15:00:00.000Z"],
        ["due", "sms", "2026-08-01T15:00:00.000Z"],
        ["late_1", "email", "2026-08-07T15:00:00.000Z"],
        ["late_1", "sms", "2026-08-07T15:00:00.000Z"],
        ["late_2", "email", "2026-08-13T15:00:00.000Z"],
        ["late_2", "sms", "2026-08-13T15:00:00.000Z"],
      ],
    );
  });

  it("clamps an absurd lead time instead of scheduling in the past century", () => {
    const plan = reminderPlan("2026-08-01", 5, { reminderUpcomingDays: 400 });
    assert.equal(plan[0].sendAt.toISOString(), "2026-07-18T15:00:00.000Z");
  });
});
