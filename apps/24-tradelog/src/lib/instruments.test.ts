import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  displaySymbol,
  expiryDaysApart,
  formatOptionSymbol,
  formatStrike,
  futuresSpec,
  multiplierFor,
  optionSymbol,
  parseFuturesSymbol,
  parseOptionSymbol,
  strikePrice,
  underlyingOf,
} from "@/lib/instruments";
import { MULT_SCALE, formatPrice } from "@/lib/money";
import { describeStrategy, groupLegs, type LegLike } from "@/lib/legs";
import type { Direction } from "@/lib/matcher";

describe("option symbols", () => {
  it("round-trips the canonical form", () => {
    const contract = { underlying: "AAPL", expiry: "20260116", right: "C" as const, strikeMills: 185_000 };
    const symbol = optionSymbol(contract);
    assert.equal(symbol, "AAPL|20260116|C|185000");
    assert.deepEqual(parseOptionSymbol(symbol), contract);
  });

  it("rejects malformed symbols instead of half-parsing them", () => {
    for (const bad of ["AAPL", "AAPL|20260116|C", "AAPL|2026|C|185000", "AAPL|20260116|X|185000", "aapl|20260116|C|1"]) {
      assert.equal(parseOptionSymbol(bad), null, bad);
    }
  });

  it("formats for the journal", () => {
    assert.equal(formatOptionSymbol("AAPL|20260116|C|185000"), "AAPL 16 Jan 26 185C");
    assert.equal(formatOptionSymbol("SPY|20260220|P|605500"), "SPY 20 Feb 26 605.5P");
    // An unparseable symbol is shown as-is rather than mangled.
    assert.equal(formatOptionSymbol("WEIRD"), "WEIRD");
  });

  it("formats fractional strikes without trailing zeros", () => {
    assert.equal(formatStrike(185_000), "185");
    assert.equal(formatStrike(605_500), "605.5");
    assert.equal(formatStrike(7_250), "7.25");
    assert.equal(formatStrike(1_125), "1.125");
  });

  it("converts a strike to an exact price", () => {
    assert.equal(formatPrice(strikePrice(605_500)), "605.50");
    assert.equal(formatPrice(strikePrice(1_125), 3), "1.125");
  });

  it("measures expiry distance in days", () => {
    assert.equal(expiryDaysApart("20260116", "20260116"), 0);
    assert.equal(expiryDaysApart("20260116", "20260123"), 7);
    assert.equal(expiryDaysApart("20260123", "20260116"), 7);
    assert.equal(expiryDaysApart("20260228", "20260301"), 1); // 2026 is not a leap year
  });
});

describe("futures symbols", () => {
  it("finds the root through the broker's various spellings", () => {
    assert.deepEqual(parseFuturesSymbol("MESZ5"), { root: "MES", contract: "Z5" });
    assert.deepEqual(parseFuturesSymbol("/MESZ25"), { root: "MES", contract: "Z25" });
    assert.deepEqual(parseFuturesSymbol("MES 12-25"), { root: "MES", contract: "12-25" });
    assert.deepEqual(parseFuturesSymbol("ESH26"), { root: "ES", contract: "H26" });
    assert.deepEqual(parseFuturesSymbol("MES"), { root: "MES", contract: "" });
  });

  it("returns the specification with the multiplier in thousandths", () => {
    assert.equal(futuresSpec("MESZ5")?.multiplierMilli, 5_000);
    assert.equal(futuresSpec("ESH26")?.multiplierMilli, 50_000);
    assert.equal(futuresSpec("MYMH6")?.multiplierMilli, 500);
    assert.equal(futuresSpec("CLG6")?.multiplierMilli, 1_000_000);
  });

  it("refuses to guess an unknown contract", () => {
    assert.equal(futuresSpec("XYZZ5"), null);
    assert.equal(multiplierFor("future", "XYZZ5"), null);
  });
});

describe("multiplierFor", () => {
  it("is 1 for equities and crypto, 100 for options, per-table for futures", () => {
    assert.equal(multiplierFor("equity", "AAPL"), 1 * MULT_SCALE);
    assert.equal(multiplierFor("crypto", "BTCUSDT"), 1 * MULT_SCALE);
    assert.equal(multiplierFor("option", "AAPL|20260116|C|185000"), 100 * MULT_SCALE);
    assert.equal(multiplierFor("future", "MESZ5"), 5 * MULT_SCALE);
  });
});

describe("display helpers", () => {
  it("shows options in human form and everything else verbatim", () => {
    assert.equal(displaySymbol("option", "AAPL|20260116|C|185000"), "AAPL 16 Jan 26 185C");
    assert.equal(displaySymbol("equity", "AAPL"), "AAPL");
    assert.equal(displaySymbol("future", "MESZ5"), "MESZ5");
  });

  it("resolves the underlying a trader thinks in", () => {
    assert.equal(underlyingOf("option", "AAPL|20260116|C|185000"), "AAPL");
    assert.equal(underlyingOf("future", "MESZ5"), "MES");
    assert.equal(underlyingOf("equity", "AAPL"), "AAPL");
  });
});

/* ------------------------------------------------------------- leg groups --- */

let legSeq = 0;
function leg(symbol: string, direction: Direction, minute: number, assetClass = "option"): LegLike {
  legSeq += 1;
  return {
    id: `l${legSeq}`,
    symbol,
    assetClass,
    direction,
    openedAt: new Date(`2026-01-13T14:${String(minute).padStart(2, "0")}:00Z`),
  };
}

describe("describeStrategy", () => {
  it("names a single leg by direction and right", () => {
    assert.equal(describeStrategy([leg("AAPL|20260116|C|185000", "long", 31)]), "Long call");
    assert.equal(describeStrategy([leg("AAPL|20260116|P|180000", "short", 31)]), "Short put");
  });

  it("names verticals, straddles, strangles, calendars and diagonals", () => {
    assert.equal(
      describeStrategy([
        leg("AAPL|20260116|C|185000", "long", 31),
        leg("AAPL|20260116|C|190000", "short", 31),
      ]),
      "Call vertical",
    );
    assert.equal(
      describeStrategy([
        leg("AAPL|20260116|P|180000", "long", 31),
        leg("AAPL|20260116|P|175000", "short", 31),
      ]),
      "Put vertical",
    );
    assert.equal(
      describeStrategy([
        leg("AAPL|20260116|C|185000", "long", 31),
        leg("AAPL|20260116|P|185000", "long", 31),
      ]),
      "Straddle",
    );
    assert.equal(
      describeStrategy([
        leg("AAPL|20260116|C|190000", "long", 31),
        leg("AAPL|20260116|P|180000", "long", 31),
      ]),
      "Strangle",
    );
    assert.equal(
      describeStrategy([
        leg("AAPL|20260116|C|185000", "short", 31),
        leg("AAPL|20260220|C|185000", "long", 31),
      ]),
      "Calendar spread",
    );
    assert.equal(
      describeStrategy([
        leg("AAPL|20260116|C|185000", "short", 31),
        leg("AAPL|20260220|C|190000", "long", 31),
      ]),
      "Diagonal spread",
    );
  });

  it("tells an iron condor from an iron butterfly", () => {
    const condor = [
      leg("SPY|20260220|P|590000", "long", 31),
      leg("SPY|20260220|P|595000", "short", 31),
      leg("SPY|20260220|C|610000", "short", 31),
      leg("SPY|20260220|C|615000", "long", 31),
    ];
    assert.equal(describeStrategy(condor), "Iron condor");

    const butterfly = [
      leg("SPY|20260220|P|595000", "long", 31),
      leg("SPY|20260220|P|602500", "short", 31),
      leg("SPY|20260220|C|602500", "short", 31),
      leg("SPY|20260220|C|610000", "long", 31),
    ];
    assert.equal(describeStrategy(butterfly), "Iron butterfly");
  });

  it("says what it does not recognise instead of guessing", () => {
    const three = [
      leg("SPY|20260220|C|600000", "long", 31),
      leg("SPY|20260220|C|605000", "short", 31),
      leg("SPY|20260220|C|610000", "long", 31),
    ];
    assert.equal(describeStrategy(three), "3-leg position");
  });
});

describe("groupLegs", () => {
  it("groups legs opened together and leaves legged-in trades apart", () => {
    const trades = [
      leg("AAPL|20260116|C|185000", "long", 31),
      leg("AAPL|20260116|C|190000", "short", 31),
      leg("AAPL|20260116|P|180000", "long", 45), // 14 minutes later: its own position
    ];
    const groups = groupLegs(trades);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].strategy, "Call vertical");
    assert.equal(groups[0].legs.length, 2);
    assert.equal(groups[1].strategy, "Long put");
  });

  it("never groups across underlyings", () => {
    const groups = groupLegs([
      leg("AAPL|20260116|C|185000", "long", 31),
      leg("MSFT|20260116|C|420000", "long", 31),
    ]);
    assert.equal(groups.length, 2);
    assert.equal(new Set(groups.map((g) => g.underlying)).size, 2);
  });

  it("passes non-option trades through as single-leg groups", () => {
    const groups = groupLegs([
      leg("AAPL", "long", 31, "equity"),
      leg("MESZ5", "short", 32, "future"),
    ]);
    assert.equal(groups.length, 2);
    assert.equal(groups.every((g) => g.legs.length === 1 && g.strategy === ""), true);
  });
});
