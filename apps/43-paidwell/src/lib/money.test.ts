import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  balanceOf,
  cascade,
  clampPartialPayment,
  formatMoney,
  formatMoneyShort,
  parseAmountToCents,
  roundCents,
  splitCents,
} from "@/lib/money";

describe("parseAmountToCents", () => {
  it("reads the shapes a real CSV export contains", () => {
    assert.equal(parseAmountToCents("1200.50"), 120_050);
    assert.equal(parseAmountToCents("$12,400.00"), 1_240_000);
    assert.equal(parseAmountToCents("12 400"), 1_240_000);
    assert.equal(parseAmountToCents("USD 840.25"), 84_025);
    assert.equal(parseAmountToCents(840.25), 84_025);
  });

  it("reads accounting parentheses as negative", () => {
    assert.equal(parseAmountToCents("(120.00)"), -12_000);
  });

  it("refuses to guess — a bad cell is null, never a silent zero", () => {
    assert.equal(parseAmountToCents("n/a"), null);
    assert.equal(parseAmountToCents(""), null);
    assert.equal(parseAmountToCents(null), null);
    assert.equal(parseAmountToCents("12.4.5"), null);
  });

  it("rounds once, half away from zero", () => {
    assert.equal(parseAmountToCents("0.005"), 1);
    assert.equal(parseAmountToCents("1.145"), 115);
    // Binary noise: this value *is* 14.5, so it must round up, not down.
    assert.equal(roundCents(14.499999999999998), 15);
    assert.equal(roundCents(14.4), 14);
    assert.equal(roundCents(0.5), 1);
    assert.equal(roundCents(-0.5), -1);
  });
});

describe("formatting", () => {
  it("formats money to the cent", () => {
    assert.equal(formatMoney(1_240_000), "$12,400.00");
    assert.equal(formatMoney(0), "$0.00");
  });

  it("drops a zero tail on hero figures but keeps a real one", () => {
    assert.equal(formatMoneyShort(6_124_000), "$61,240");
    assert.equal(formatMoneyShort(6_124_050), "$61,240.50");
  });
});

describe("cascade", () => {
  const targets = [
    { invoiceId: "a", balanceCents: 300_000 },
    { invoiceId: "b", balanceCents: 500_000 },
    { invoiceId: "c", balanceCents: 200_000 },
  ];

  it("applies one payment oldest-first across open invoices", () => {
    const result = cascade(targets, 700_000);
    assert.deepEqual(result.allocations, [
      { invoiceId: "a", appliedCents: 300_000 },
      { invoiceId: "b", appliedCents: 400_000 },
    ]);
    assert.equal(result.appliedCents, 700_000);
    assert.equal(result.creditCents, 0);
  });

  it("parks a genuine overpayment as credit, not a negative balance", () => {
    const result = cascade(targets, 1_100_000);
    assert.equal(result.appliedCents, 1_000_000);
    assert.equal(result.creditCents, 100_000);
  });

  it("does not leave a client delinquent on invoices the money covered", () => {
    // The failure this exists to prevent: a single wire clearing three quarters
    // must clear all three, not one plus a useless credit balance.
    const result = cascade(targets, 1_000_000);
    assert.equal(result.allocations.length, 3);
    assert.equal(result.creditCents, 0);
  });

  it("ignores zero-balance and negative rows", () => {
    const result = cascade([{ invoiceId: "x", balanceCents: 0 }, ...targets], 100_000);
    assert.deepEqual(result.allocations, [{ invoiceId: "a", appliedCents: 100_000 }]);
  });

  it("handles nothing to apply", () => {
    assert.deepEqual(cascade(targets, 0).allocations, []);
    assert.deepEqual(cascade([], 500).allocations, []);
  });
});

describe("splitCents", () => {
  it("splits so the parts sum back exactly", () => {
    const parts = splitCents(1000, 3);
    assert.deepEqual(parts, [334, 333, 333]);
    assert.equal(parts.reduce((a, b) => a + b, 0), 1000);
  });
});

describe("balanceOf", () => {
  it("never goes negative", () => {
    assert.equal(balanceOf(1000, 1200), 0);
    assert.equal(balanceOf(1000, 400), 600);
  });
});

describe("clampPartialPayment", () => {
  it("accepts a partial above the floor", () => {
    assert.deepEqual(clampPartialPayment(200_000, 1_240_000, 100_000), { cents: 200_000 });
  });

  it("refuses more than the balance", () => {
    const result = clampPartialPayment(2_000_000, 1_240_000, 100_000);
    assert.ok("error" in result && /most that can be paid/.test(result.error));
  });

  it("refuses dust below the floor", () => {
    const result = clampPartialPayment(500, 1_240_000, 100_000);
    assert.ok("error" in result && /Part payments start at \$1,000\.00/.test(result.error));
  });

  it("lets a small balance be paid in full even below the floor", () => {
    assert.deepEqual(clampPartialPayment(4_000, 4_000, 100_000), { cents: 4_000 });
  });

  it("refuses to charge for a settled invoice", () => {
    const result = clampPartialPayment(1000, 0, 100_000);
    assert.ok("error" in result && /already settled/.test(result.error));
  });
});
