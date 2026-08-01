import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DecimalParseError,
  MONEY_PER_CENT,
  MULT_SCALE,
  divRound,
  formatCents,
  formatPercent,
  formatPrice,
  formatQty,
  formatR,
  formatScaled,
  moneyToCents,
  notional,
  parseDecimal,
  parseMoney,
  parsePrice,
  parseQty,
  weightedAvgPrice,
} from "@/lib/money";

describe("divRound", () => {
  it("rounds half away from zero, in both directions", () => {
    assert.equal(divRound(5n, 2n), 3n);
    assert.equal(divRound(-5n, 2n), -3n);
    assert.equal(divRound(4n, 2n), 2n);
    assert.equal(divRound(1n, 3n), 0n);
    assert.equal(divRound(2n, 3n), 1n);
    assert.equal(divRound(-2n, 3n), -1n);
  });

  it("handles a negative denominator", () => {
    assert.equal(divRound(5n, -2n), -3n);
    assert.equal(divRound(-5n, -2n), 3n);
  });

  it("refuses to divide by zero rather than returning Infinity", () => {
    assert.throws(() => divRound(1n, 0n), /division by zero/);
  });
});

describe("parseDecimal", () => {
  it("scales a plain decimal exactly", () => {
    assert.equal(parseDecimal("241.15", 8), 24_115_000_000n);
    assert.equal(parseDecimal("0.00001234", 8), 1_234n);
    assert.equal(parseDecimal("200", 8), 20_000_000_000n);
    assert.equal(parseDecimal("0", 8), 0n);
  });

  it("reads the punctuation brokers actually export", () => {
    assert.equal(parseDecimal("$1,234.56", 2), 123_456n);
    assert.equal(parseDecimal("(12.00)", 2), -1_200n);
    assert.equal(parseDecimal("+200", 0), 200n);
    assert.equal(parseDecimal("1,234,567", 0), 1_234_567n);
    assert.equal(parseDecimal(" \"3.50\" ", 2), 350n);
    assert.equal(parseDecimal(".5", 2), 50n);
  });

  it("folds scientific notation into the scale", () => {
    assert.equal(parseDecimal("2.5e-4", 8), 25_000n);
    assert.equal(parseDecimal("1.5E3", 2), 150_000n);
    assert.equal(parseDecimal("1e2", 0), 100n);
  });

  it("rounds excess precision half away from zero", () => {
    // 0.005 at 2dp -> 0.01, and the negative mirrors it.
    assert.equal(parseDecimal("0.005", 2), 1n);
    assert.equal(parseDecimal("-0.005", 2), -1n);
    assert.equal(parseDecimal("0.004", 2), 0n);
    assert.equal(parseDecimal("1.239999999", 4), 12_400n);
  });

  it("throws on anything that is not a number", () => {
    // "1,2," and "12,34" are broken cells: the comma is not grouping digits.
    for (const bad of ["", "  ", "N/A", "12.3.4", "abc", "1e", "1.2e999999", "--3", "1,2,", "12,34"]) {
      assert.throws(() => parseDecimal(bad, 2), DecimalParseError, `expected throw for ${bad}`);
    }
  });
});

describe("formatScaled", () => {
  it("round-trips the parse", () => {
    assert.equal(formatScaled(parseDecimal("241.15", 8), 8), "241.15");
    assert.equal(formatScaled(parseDecimal("-0.00001234", 8), 8), "-0.00001234");
    assert.equal(formatScaled(parseDecimal("1234567.89", 2), 2, { group: true }), "1,234,567.89");
    assert.equal(formatScaled(0n, 8), "0");
    assert.equal(formatScaled(0n, 2, { minDecimals: 2 }), "0.00");
  });
});

describe("notional", () => {
  it("multiplies qty x price x multiplier exactly, with no division", () => {
    // 200 shares at 241.15 = $48,230.00
    const value = notional(parseQty("200"), parsePrice("241.15"), 1 * MULT_SCALE);
    assert.equal(moneyToCents(value), 4_823_000n);

    // 3 option contracts at 4.325, multiplier 100 = $1,297.50
    const options = notional(parseQty("3"), parsePrice("4.325"), 100 * MULT_SCALE);
    assert.equal(moneyToCents(options), 129_750n);

    // 0.05123 BTC at 68,450.10 = $3,506.699623 -> $3,506.70
    const crypto = notional(parseQty("0.05123"), parsePrice("68450.10"), 1 * MULT_SCALE);
    assert.equal(moneyToCents(crypto), 350_670n);

    // 2 MYM at 44,120 with a $0.50/point multiplier = $44,120.00, not $88,240.
    const microDow = notional(parseQty("2"), parsePrice("44120"), 500);
    assert.equal(moneyToCents(microDow), 4_412_000n);
  });

  it("is exact where floating point is not", () => {
    // 0.1 + 0.2 in floats is 0.30000000000000004; here it is three dimes.
    const total = parseMoney("0.1") + parseMoney("0.2");
    assert.equal(moneyToCents(total), 30n);
    assert.equal(formatCents(moneyToCents(total)), "$0.30");

    // A tenth of a cent, 1000 times, is exactly one dollar.
    let acc = 0n;
    for (let i = 0; i < 1000; i++) acc += parseMoney("0.001");
    assert.equal(moneyToCents(acc), 100n);
  });

  it("keeps sub-cent fees alive until the final rounding", () => {
    // SEC fee: $0.0000278 per dollar. 900 fills of a half-cent fee is $4.50 —
    // rounding each fill to cents first would have produced $9.00 or $0.00.
    const perFill = parseMoney("0.005");
    assert.equal(moneyToCents(perFill), 1n, "one fill alone rounds up to a cent");
    let acc = 0n;
    for (let i = 0; i < 900; i++) acc += perFill;
    assert.equal(moneyToCents(acc), 450n);
  });
});

describe("moneyToCents", () => {
  it("rounds half away from zero at the cent", () => {
    assert.equal(moneyToCents(MONEY_PER_CENT / 2n), 1n);
    assert.equal(moneyToCents(-MONEY_PER_CENT / 2n), -1n);
    assert.equal(moneyToCents(MONEY_PER_CENT / 2n - 1n), 0n);
  });
});

describe("weightedAvgPrice", () => {
  it("weights by quantity, not by fill count", () => {
    // 100 @ 10.00 and 300 @ 11.00 -> (1000 + 3300) / 400 = 10.75
    const avg = weightedAvgPrice([
      { qty: parseQty("100"), price: parsePrice("10.00") },
      { qty: parseQty("300"), price: parsePrice("11.00") },
    ]);
    assert.equal(formatPrice(avg), "10.75");
  });

  it("rounds a repeating average to 8dp", () => {
    // 3 @ 10.00 and 1 @ 11.00 -> 41/4 = 10.25 exactly
    assert.equal(
      formatPrice(
        weightedAvgPrice([
          { qty: parseQty("3"), price: parsePrice("10") },
          { qty: parseQty("1"), price: parsePrice("11") },
        ]),
      ),
      "10.25",
    );
    // 1 @ 10.00 and 2 @ 11.00 -> 32/3 = 10.66666667 (8dp, rounded up)
    assert.equal(
      formatScaled(
        weightedAvgPrice([
          { qty: parseQty("1"), price: parsePrice("10") },
          { qty: parseQty("2"), price: parsePrice("11") },
        ]),
        8,
      ),
      "10.66666667",
    );
  });

  it("returns zero for no fills rather than dividing by zero", () => {
    assert.equal(weightedAvgPrice([]), 0n);
  });
});

describe("formatting", () => {
  it("formats money with a real minus sign and grouped thousands", () => {
    assert.equal(formatCents(4_823_000n), "$48,230.00");
    assert.equal(formatCents(-214_000n), "−$2,140.00");
    assert.equal(formatCents(3_800n, { signed: true }), "+$38.00");
    assert.equal(formatCents(0n, { signed: true }), "+$0.00");
    assert.equal(formatCents(-214_000n, { ascii: true }), "-$2,140.00");
  });

  it("drops cents on compact figures at or above $1,000", () => {
    assert.equal(formatCents(-214_000n, { compact: true }), "−$2,140");
    assert.equal(formatCents(99_999n, { compact: true }), "$999.99");
    assert.equal(formatCents(100_000n, { compact: true }), "$1,000");
    // Compact rounds to the nearest dollar rather than truncating.
    assert.equal(formatCents(123_456n, { compact: true }), "$1,235");
  });

  it("formats quantities and prices", () => {
    assert.equal(formatQty(parseQty("200")), "200");
    assert.equal(formatQty(parseQty("0.05123")), "0.05123");
    assert.equal(formatPrice(parsePrice("241.1")), "241.10");
    assert.equal(formatPrice(parsePrice("0.00001234"), 2), "0.00001234");
  });

  it("formats R-multiples and ratios", () => {
    assert.equal(formatR(23_000n), "+2.30R");
    assert.equal(formatR(-10_000n), "−1.00R");
    assert.equal(formatR(null), "—");
    // Stored to 4dp, shown to 2 — and rounded, not truncated.
    assert.equal(formatR(24_996n), "+2.50R");
    assert.equal(formatR(-24_996n), "−2.50R");
    assert.equal(formatR(24_996n, 4), "+2.4996R");
    // Percentages are whole by default — 83.33% of 72 trades is false precision.
    assert.equal(formatPercent(5_400n), "54%");
    assert.equal(formatPercent(8_333n), "83%");
    assert.equal(formatPercent(8_350n), "84%", "rounds, not truncates");
    assert.equal(formatPercent(5_425n, 2), "54.25%");
    assert.equal(formatPercent(null), "—");
  });
});
