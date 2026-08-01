import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  balanceDue,
  computeTotals,
  currency,
  formatMoney,
  formatMoneyShort,
  formatTaxPercent,
  lineTotal,
  parseMoneyInput,
  parseTaxPercent,
  roundMinor,
  splitDeposit,
} from "@/lib/money";
import type { LineItem } from "@/db/schema";

let seq = 0;
function line(partial: Partial<LineItem>): LineItem {
  return {
    id: `line-${++seq}`,
    description: "Work",
    quantity: 1,
    unitAmount: 100_00,
    optional: false,
    selected: true,
    taxable: true,
    ...partial,
  };
}

describe("roundMinor", () => {
  it("rounds halves away from zero", () => {
    assert.equal(roundMinor(0.5), 1);
    assert.equal(roundMinor(1.5), 2);
    assert.equal(roundMinor(2.5), 3);
    assert.equal(roundMinor(-0.5), -1);
    assert.equal(roundMinor(-2.5), -3);
  });

  it("treats float noise just below a half as a half", () => {
    // 0.145 * 100 is 14.499999999999998 in binary floating point.
    assert.equal(roundMinor(0.145 * 100), 15);
    assert.equal(roundMinor(1.005 * 100), 101);
  });

  it("leaves genuine sub-half values alone", () => {
    assert.equal(roundMinor(14.4999), 14);
    assert.equal(roundMinor(0.49), 0);
  });

  it("survives nonsense", () => {
    assert.equal(roundMinor(Number.NaN), 0);
    assert.equal(roundMinor(Number.POSITIVE_INFINITY), 0);
  });
});

describe("lineTotal", () => {
  it("multiplies whole units exactly", () => {
    assert.equal(lineTotal({ quantity: 3, unitAmount: 185_00 }), 555_00);
  });

  it("handles fractional hours without drifting", () => {
    assert.equal(lineTotal({ quantity: 7.5, unitAmount: 120_00 }), 900_00);
    assert.equal(lineTotal({ quantity: 7.35, unitAmount: 95_00 }), 698_25);
    // 0.1 + 0.2 style trap: 3 × 0.1 hours at $99/h.
    assert.equal(lineTotal({ quantity: 0.3, unitAmount: 99_00 }), 29_70);
  });

  it("rounds a half-cent line up, once", () => {
    // 1.5 units at $0.01 = $0.015 → 2 cents, not 1.
    assert.equal(lineTotal({ quantity: 1.5, unitAmount: 1 }), 2);
  });

  it("treats missing numbers as zero rather than NaN", () => {
    assert.equal(lineTotal({ quantity: Number.NaN, unitAmount: 100 }), 0);
  });
});

describe("computeTotals", () => {
  it("sums required rows and ignores unticked add-ons", () => {
    const totals = computeTotals([
      line({ unitAmount: 600_00 }),
      line({ unitAmount: 1_800_00 }),
      line({ unitAmount: 800_00, optional: true, selected: false }),
    ]);
    assert.equal(totals.subtotal, 2_400_00);
    assert.equal(totals.total, 2_400_00);
  });

  it("includes add-ons the client ticked", () => {
    const totals = computeTotals([
      line({ unitAmount: 600_00 }),
      line({ unitAmount: 800_00, optional: true, selected: true }),
    ]);
    assert.equal(totals.subtotal, 1_400_00);
  });

  it("taxes only the taxable base", () => {
    const totals = computeTotals(
      [
        line({ unitAmount: 1_000_00, taxable: true }),
        line({ unitAmount: 500_00, taxable: false }),
      ],
      2000, // 20%
    );
    assert.equal(totals.subtotal, 1_500_00);
    assert.equal(totals.taxableBase, 1_000_00);
    assert.equal(totals.tax, 200_00);
    assert.equal(totals.total, 1_700_00);
  });

  it("rounds tax once, on the whole taxable base", () => {
    // 8.875% of $4,812.37 = $427.09784… → $427.10
    const totals = computeTotals([line({ unitAmount: 4_812_37 })], 888);
    assert.equal(totals.tax, 427_34);
    assert.equal(totals.total, 4_812_37 + 427_34);
  });

  it("is zero for an empty table", () => {
    assert.deepEqual(computeTotals([]), { subtotal: 0, taxableBase: 0, tax: 0, total: 0 });
  });

  it("ignores a nonsense tax rate", () => {
    const totals = computeTotals([line({ unitAmount: 100_00 })], Number.NaN);
    assert.equal(totals.tax, 0);
  });
});

describe("splitDeposit", () => {
  it("splits a round total exactly", () => {
    assert.deepEqual(splitDeposit(4_800_00, 50), { deposit: 2_400_00, balance: 2_400_00 });
  });

  it("never loses a cent to rounding", () => {
    for (const total of [1_00, 3_33, 99_99, 4_812_37, 1_000_01]) {
      for (const pct of [0, 10, 25, 33, 40, 50, 66, 75, 100]) {
        const { deposit, balance } = splitDeposit(total, pct);
        assert.equal(deposit + balance, total, `${total} at ${pct}%`);
        assert.ok(deposit >= 0 && balance >= 0);
      }
    }
  });

  it("rounds the deposit half up", () => {
    // 50% of $33.33 = $16.665 → $16.67, balance $16.66.
    assert.deepEqual(splitDeposit(33_33, 50), { deposit: 16_67, balance: 16_66 });
  });

  it("clamps silly percentages", () => {
    assert.deepEqual(splitDeposit(1_000_00, 0), { deposit: 0, balance: 1_000_00 });
    assert.deepEqual(splitDeposit(1_000_00, 250), { deposit: 1_000_00, balance: 0 });
    assert.deepEqual(splitDeposit(1_000_00, -20), { deposit: 0, balance: 1_000_00 });
  });
});

describe("formatting", () => {
  it("formats two-decimal currencies", () => {
    assert.equal(formatMoney(4_800_00, "USD"), "$4,800.00");
    assert.equal(formatMoney(16_66, "USD"), "$16.66");
  });

  it("formats yen with no decimals", () => {
    assert.equal(currency("JPY").exponent, 0);
    assert.equal(formatMoney(480_000, "JPY"), "¥480,000");
  });

  it("drops .00 in the short form only when whole", () => {
    assert.equal(formatMoneyShort(18_250_00, "USD"), "$18,250");
    assert.equal(formatMoneyShort(18_250_40, "USD"), "$18,250.40");
  });

  it("falls back to USD for an unknown code", () => {
    assert.equal(currency("ZZZ").code, "USD");
  });
});

describe("parsing", () => {
  it("reads what a freelancer actually types", () => {
    assert.equal(parseMoneyInput("1,200.50"), 1_200_50);
    assert.equal(parseMoneyInput("$4,800"), 4_800_00);
    assert.equal(parseMoneyInput("95"), 95_00);
    assert.equal(parseMoneyInput(".5"), 50);
  });

  it("uses the currency's own scale", () => {
    assert.equal(parseMoneyInput("480000", "JPY"), 480_000);
  });

  it("refuses nonsense instead of silently billing zero", () => {
    assert.equal(parseMoneyInput(""), null);
    assert.equal(parseMoneyInput("tbd"), null);
    assert.equal(parseMoneyInput("1.2.3"), null);
  });

  it("reads tax rates as basis points", () => {
    assert.equal(parseTaxPercent("20"), 2000);
    assert.equal(parseTaxPercent("8.875"), 888);
    assert.equal(parseTaxPercent("0"), 0);
    assert.equal(parseTaxPercent(""), 0);
    assert.equal(parseTaxPercent("120"), null);
    assert.equal(parseTaxPercent("lots"), null);
  });

  it("renders basis points back for display", () => {
    assert.equal(formatTaxPercent(2000), "20%");
    assert.equal(formatTaxPercent(888), "8.88%");
    assert.equal(formatTaxPercent(0), "0%");
  });
});

describe("balanceDue", () => {
  it("is what is left", () => {
    assert.equal(balanceDue({ total: 4_800_00, amountPaid: 1_440_00 }), 3_360_00);
  });

  it("is never negative when a client overpays", () => {
    assert.equal(balanceDue({ total: 100_00, amountPaid: 120_00 }), 0);
  });
});
