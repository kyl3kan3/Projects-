import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  basisPoints,
  formatMoney,
  parseMoney,
  proportion,
  roundHalfUp,
  splitCents,
  splitMoney,
} from "@/lib/money";

describe("rounding", () => {
  it("rounds .5 away from zero, not to even", () => {
    // Banker's rounding would give 2 here; a treasurer with a calculator gives 3.
    assert.equal(roundHalfUp(2.5), 3);
    assert.equal(roundHalfUp(3.5), 4);
    assert.equal(roundHalfUp(-2.5), -3);
    assert.equal(roundHalfUp(2.4999), 2);
  });

  it("prorates by hand-checked fixtures", () => {
    // $180.00 over 91 days, 50 days owned: 18000 * 50 / 91 = 9890.109...
    assert.equal(proportion(18000, 50, 91), 9890);
    // Exactly half of an odd amount rounds up: 12345 / 2 = 6172.5 -> 6173.
    assert.equal(proportion(12345, 1, 2), 6173);
    assert.equal(proportion(18000, 91, 91), 18000);
    assert.equal(proportion(18000, 0, 91), 0);
    assert.equal(proportion(18000, 5, 0), 0);
  });

  it("computes basis points integrally", () => {
    // 1.5% of $180.00 = $2.70
    assert.equal(basisPoints(18000, 150), 270);
    // 10% of $4.05 = 40.5 cents -> 41 cents
    assert.equal(basisPoints(405, 1000), 41);
    assert.equal(basisPoints(18000, 0), 0);
  });
});

describe("splitCents", () => {
  it("always sums back to the total", () => {
    for (const [total, parts, expected] of [
      [10000, 3, [3334, 3333, 3333]],
      [10001, 3, [3334, 3334, 3333]],
      [18000, 4, [4500, 4500, 4500, 4500]],
      [1, 3, [1, 0, 0]],
    ] as const) {
      const split = splitCents(total, parts);
      assert.deepEqual(split, expected);
      assert.equal(
        split.reduce((a, b) => a + b, 0),
        total,
        `split of ${total} into ${parts} must sum back`,
      );
    }
  });

  it("returns nothing for a nonsense part count", () => {
    assert.deepEqual(splitCents(10000, 0), []);
    assert.deepEqual(splitCents(10000, -2), []);
  });
});

describe("formatting", () => {
  it("always shows two decimals and thousands separators", () => {
    assert.equal(formatMoney(1134000), "$11,340.00");
    assert.equal(formatMoney(9890), "$98.90");
    assert.equal(formatMoney(5), "$0.05");
    assert.equal(formatMoney(0), "$0.00");
    assert.equal(formatMoney(-1500), "-$15.00");
  });

  it("splits a hero stat into whole dollars and cents", () => {
    assert.deepEqual(splitMoney(1134000), { whole: "$11,340", cents: "00", negative: false });
    assert.deepEqual(splitMoney(9890), { whole: "$98", cents: "90", negative: false });
  });
});

describe("parseMoney", () => {
  it("accepts what a treasurer actually types", () => {
    assert.equal(parseMoney("180"), 18000);
    assert.equal(parseMoney("$180.00"), 18000);
    assert.equal(parseMoney("1,180.5"), 118050);
    assert.equal(parseMoney(" 98.90 "), 9890);
    assert.equal(parseMoney("0.05"), 5);
  });

  it("refuses anything ambiguous rather than guessing", () => {
    assert.equal(parseMoney(""), null);
    assert.equal(parseMoney("abc"), null);
    assert.equal(parseMoney("180.005"), null);
    assert.equal(parseMoney("-180"), null);
    assert.equal(parseMoney("1.2.3"), null);
  });
});
