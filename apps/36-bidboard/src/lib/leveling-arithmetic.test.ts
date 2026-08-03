/**
 * The leveling arithmetic, exhaustively.
 *
 * leveling.test.ts proves the engine against one hand-computed Division 26 package.
 * This file goes after the edges — the cases that do not show up in a happy-path
 * fixture and are exactly where a leveling engine quietly starts lying:
 *
 *  - cents that do not divide evenly, and totals of many odd amounts
 *  - plugs stacked, plugs on the wrong kind of cell, plugs that must not apply
 *  - ties for a per-line low
 *  - negative adjustments, and totals driven to or below zero
 *  - alternates, allowances, and columns made entirely of one or the other
 *  - the matrix with three or more bidders and contradictory declarations
 *
 * Every expected number is written out so the arithmetic can be checked by eye.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  DEFAULT_PLUG_SHARE_FLAG,
  awardFlags,
  buildLevelingGrid,
  lowStrip,
  type LevelAdjustment,
  type LevelBid,
  type LevelBidLine,
  type LevelFormLine,
  type LevelingGrid,
  type LevelingInput,
} from "./leveling";
import { money, parseMoneyToCents } from "./format";

/* ------------------------------------------------------------------ helpers --- */

let seq = 0;
function formLine(
  id: string,
  sort: number,
  description = `Line ${id}`,
  extra: Partial<LevelFormLine> = {},
): LevelFormLine {
  return {
    id,
    sort,
    description,
    unit: null,
    quantity: null,
    isAlternate: false,
    isAllowance: false,
    ...extra,
  };
}

function priced(formLineId: string | null, cents: number, raw = "priced row"): LevelBidLine {
  return {
    id: `bl-${seq++}`,
    bidFormLineId: formLineId,
    rawDescription: raw,
    state: "priced",
    amountCents: cents,
    mappingStatus: formLineId ? "matched" : "unmapped",
  };
}

function excluded(formLineId: string, raw = "excluded row"): LevelBidLine {
  return {
    id: `bl-${seq++}`,
    bidFormLineId: formLineId,
    rawDescription: raw,
    state: "excluded",
    amountCents: null,
    mappingStatus: "matched",
  };
}

function elsewhere(formLineId: string, raw = "carried elsewhere"): LevelBidLine {
  return {
    id: `bl-${seq++}`,
    bidFormLineId: formLineId,
    rawDescription: raw,
    state: "included_elsewhere",
    amountCents: null,
    mappingStatus: "matched",
  };
}

function bid(
  id: string,
  subName: string,
  lines: LevelBidLine[],
  extra: Partial<LevelBid> = {},
): LevelBid {
  const total = lines.reduce((sum, l) => sum + (l.amountCents ?? 0), 0);
  return {
    id,
    invitationId: `inv-${id}`,
    subCompanyId: `sub-${id}`,
    subName,
    kind: "itemized",
    revision: 1,
    submittedTotalCents: total,
    inclusions: [],
    exclusions: [],
    submittedAt: new Date(`2026-03-1${(seq % 8) + 1}T12:00:00Z`),
    lines,
    ...extra,
  };
}

function plug(
  bidId: string | null,
  bidFormLineId: string | null,
  cents: number,
  reason = "plugged",
): LevelAdjustment {
  return { id: `adj-${seq++}`, bidId, bidFormLineId, kind: "plug", amountCents: cents, reason };
}

function normalize(bidId: string | null, cents: number, reason = "normalised"): LevelAdjustment {
  return { id: `adj-${seq++}`, bidId, bidFormLineId: null, kind: "normalize", amountCents: cents, reason };
}

function grid(input: Partial<LevelingInput> & { bids: LevelBid[] }): LevelingGrid {
  return buildLevelingGrid({
    formLines: input.formLines ?? [formLine("f1", 1), formLine("f2", 2), formLine("f3", 3)],
    bids: input.bids,
    adjustments: input.adjustments ?? [],
    plugShareFlag: input.plugShareFlag,
  });
}

const col = (g: LevelingGrid, id: string) => g.columns.find((c) => c.bid.id === id)!;
const row = (g: LevelingGrid, id: string) =>
  [...g.rows, ...g.alternateRows].find((r) => r.formLine.id === id)!;
const cell = (g: LevelingGrid, lineId: string, bidId: string) =>
  row(g, lineId).cells.find((c) => c.bidId === bidId)!;

/* ----------------------------------------------------------- integer cents --- */

test("odd cents survive summation exactly", () => {
  // Three amounts that a float would mangle: 0.1 + 0.2 + 0.3 in cents.
  const g = grid({
    bids: [bid("a", "Alpha", [priced("f1", 10), priced("f2", 20), priced("f3", 30)])],
  });
  assert.equal(col(g, "a").baseCents, 60);
  assert.equal(money(col(g, "a").adjustedTotalCents), "$0.60");
});

test("a hundred odd amounts total exactly, with no drift", () => {
  const lines = [formLine("f1", 1)];
  const bids: LevelBid[] = [];
  let expected = 0;
  for (let i = 0; i < 100; i++) {
    const cents = 10_000_003 + i * 7; // ends in 3, 0, 7, 4, 1 … never round
    expected += cents;
    bids.push(bid(`b${i}`, `Sub ${i}`, [priced("f1", cents)]));
  }
  const g = buildLevelingGrid({ formLines: lines, bids, adjustments: [] });
  const summed = g.columns.reduce((sum, c) => sum + c.adjustedTotalCents, 0);
  assert.equal(summed, expected);
  // And the per-line low is the smallest of them, exactly.
  assert.equal(row(g, "f1").lowCents, 10_000_003);
});

test("cents-level differences decide the apparent low", () => {
  const g = grid({
    bids: [
      bid("a", "Alpha", [priced("f1", 100_000_00), priced("f2", 1), priced("f3", 1)]),
      bid("b", "Beta", [priced("f1", 100_000_00), priced("f2", 1), priced("f3", 2)]),
    ],
  });
  assert.equal(col(g, "a").adjustedTotalCents, 10_000_002);
  assert.equal(col(g, "b").adjustedTotalCents, 10_000_003);
  assert.equal(g.apparentLow?.bidId, "a");
  assert.equal(g.spreadCents, 1); // one cent
});

test("the low strip reports the exact total, never a rounded one", () => {
  const g = grid({ bids: [bid("a", "Alpha", [priced("f1", 17_740_050), priced("f2", 0), priced("f3", 0)])] });
  // 50 cents would vanish if this were rounded to whole dollars.
  assert.equal(lowStrip(g), "LOW: ALPHA · $177,400.50");
  const round = grid({ bids: [bid("a", "Alpha", [priced("f1", 17_740_000), priced("f2", 0), priced("f3", 0)])] });
  assert.equal(lowStrip(round), "LOW: ALPHA · $177,400");
});

test("parsed amounts and levelled totals agree to the cent", () => {
  const typed = ["8,400.33", "46,200.07", "$92,500.60"];
  const cents = typed.map((t) => parseMoneyToCents(t)!);
  const g = grid({
    bids: [bid("a", "Alpha", [priced("f1", cents[0]), priced("f2", cents[1]), priced("f3", cents[2])])],
  });
  assert.equal(col(g, "a").baseCents, 840_033 + 4_620_007 + 9_250_060);
  assert.equal(money(col(g, "a").baseCents), "$147,101.00");
});

/* ------------------------------------------------------------------- plugs --- */

test("two plugs on the same cell sum, and both reasons are kept", () => {
  const g = grid({
    bids: [bid("a", "Alpha", [priced("f1", 100_000), excluded("f2"), priced("f3", 50_000)])],
    adjustments: [plug("a", "f2", 20_000, "half the scope"), plug("a", "f2", 5_000, "the other half")],
  });
  const c = cell(g, "f2", "a");
  assert.equal(c.kind, "plug");
  assert.equal(c.amountCents, 25_000);
  assert.match(c.plugReason!, /half the scope/);
  assert.match(c.plugReason!, /the other half/);
  assert.equal(col(g, "a").plugCents, 25_000);
  assert.equal(col(g, "a").adjustedTotalCents, 150_000 + 25_000);
});

test("a plug is never applied over 'included in another line'", () => {
  // The sub has already carried this scope inside their number. Plugging it would
  // charge them twice and hand the job to someone else.
  const g = grid({
    bids: [bid("a", "Alpha", [priced("f1", 100_000), elsewhere("f2"), priced("f3", 50_000)])],
    adjustments: [plug("a", "f2", 40_000)],
  });
  assert.equal(cell(g, "f2", "a").kind, "included_elsewhere");
  assert.equal(col(g, "a").plugCents, 0);
  assert.equal(col(g, "a").adjustedTotalCents, 150_000);
  // And it is not a gap either: they said where the money is.
  assert.deepEqual(col(g, "a").gapFormLineIds, []);
  assert.equal(col(g, "a").complete, true);
});

test("a plug on a line the sub priced is ignored, in both directions", () => {
  const g = grid({
    bids: [bid("a", "Alpha", [priced("f1", 100_000), priced("f2", 60_000), priced("f3", 50_000)])],
    adjustments: [plug("a", "f2", 999_999)],
  });
  assert.equal(cell(g, "f2", "a").kind, "priced");
  assert.equal(cell(g, "f2", "a").amountCents, 60_000);
  assert.equal(col(g, "a").plugCents, 0);
  assert.equal(col(g, "a").adjustedTotalCents, 210_000);
});

test("a plug on an alternate line stays out of the base total", () => {
  const lines = [formLine("f1", 1), formLine("fa", 2, "ALT 1", { isAlternate: true })];
  const g = buildLevelingGrid({
    formLines: lines,
    bids: [bid("a", "Alpha", [priced("f1", 100_000)])],
    adjustments: [plug("a", "fa", 30_000)],
  });
  assert.equal(cell(g, "fa", "a").kind, "plug");
  assert.equal(cell(g, "fa", "a").amountCents, 30_000);
  // Counted nowhere in the comparison: alternates are beside the base, never inside.
  assert.equal(col(g, "a").plugCents, 0);
  assert.equal(col(g, "a").adjustedTotalCents, 100_000);
  assert.equal(col(g, "a").alternatesCents, 0);
});

test("a column-level plug with no form line counts once", () => {
  const g = grid({
    bids: [bid("a", "Alpha", [priced("f1", 100_000), priced("f2", 1), priced("f3", 1)])],
    adjustments: [plug("a", null, 7_500, "general allowance")],
  });
  assert.equal(col(g, "a").plugCents, 7_500);
  assert.equal(col(g, "a").adjustedTotalCents, 100_002 + 7_500);
});

test("plug share is measured against the adjusted total and flagged at the threshold", () => {
  const mostlyPlug = grid({
    bids: [bid("a", "Alpha", [priced("f1", 100_000), excluded("f2"), excluded("f3")])],
    adjustments: [plug("a", "f2", 200_000), plug("a", "f3", 200_000)],
  });
  const c = col(mostlyPlug, "a");
  assert.equal(c.plugCents, 400_000);
  assert.equal(c.adjustedTotalCents, 500_000);
  assert.equal(c.plugShare, 0.8);
  assert.equal(c.plugHeavy, true);

  // Just under the default flag: 29% is not flagged, 31% is.
  const under = grid({
    bids: [bid("a", "Alpha", [priced("f1", 71_000), excluded("f2")])],
    adjustments: [plug("a", "f2", 29_000)],
  });
  assert.equal(col(under, "a").plugShare, 0.29);
  assert.equal(col(under, "a").plugHeavy, false);
  const over = grid({
    bids: [bid("a", "Alpha", [priced("f1", 69_000), excluded("f2")])],
    adjustments: [plug("a", "f2", 31_000)],
  });
  assert.equal(col(over, "a").plugHeavy, true);
  assert.equal(DEFAULT_PLUG_SHARE_FLAG, 0.3);
});

test("a bespoke plug-share threshold is honoured", () => {
  const g = grid({
    bids: [bid("a", "Alpha", [priced("f1", 90_000), excluded("f2")])],
    adjustments: [plug("a", "f2", 10_000)],
    plugShareFlag: 0.05,
  });
  assert.equal(col(g, "a").plugShare, 0.1);
  assert.equal(col(g, "a").plugHeavy, true);
});

/* --------------------------------------------------------------- row lows --- */

test("a tie for the per-line low marks every tied cell", () => {
  const g = grid({
    bids: [
      bid("a", "Alpha", [priced("f1", 50_000)]),
      bid("b", "Beta", [priced("f1", 50_000)]),
      bid("c", "Gamma", [priced("f1", 60_000)]),
    ],
  });
  assert.equal(row(g, "f1").lowCents, 50_000);
  assert.equal(cell(g, "f1", "a").isLow, true);
  assert.equal(cell(g, "f1", "b").isLow, true);
  assert.equal(cell(g, "f1", "c").isLow, false);
});

test("a row nobody priced has no low, and is not a scope gap", () => {
  const g = grid({
    bids: [
      bid("a", "Alpha", [excluded("f1")]),
      bid("b", "Beta", [excluded("f1")]),
    ],
  });
  assert.equal(row(g, "f1").lowCents, null);
  // Everyone excluded it: that is agreement, not a gap. The GC has to buy it elsewhere.
  assert.equal(row(g, "f1").scopeGap, false);
});

test("a zero-priced line can win the low — free is a real number", () => {
  const g = grid({
    bids: [
      bid("a", "Alpha", [priced("f1", 0, "no charge, included with f2")]),
      bid("b", "Beta", [priced("f1", 10_000)]),
    ],
  });
  assert.equal(row(g, "f1").lowCents, 0);
  assert.equal(cell(g, "f1", "a").isLow, true);
  assert.equal(cell(g, "f1", "a").kind, "priced");
});

test("two rows mapped onto one form line sum into a single cell", () => {
  const g = grid({
    bids: [
      bid("a", "Alpha", [
        priced("f1", 40_000, "temp power"),
        priced("f1", 20_000, "poles and meter base"),
      ]),
      bid("b", "Beta", [priced("f1", 55_000)]),
    ],
  });
  const c = cell(g, "f1", "a");
  assert.equal(c.amountCents, 60_000);
  assert.equal(c.lineCount, 2);
  // The summed cell competes on the summed figure, so Beta's single row wins.
  assert.equal(row(g, "f1").lowCents, 55_000);
  assert.equal(cell(g, "f1", "b").isLow, true);
  assert.equal(c.isLow, false);
});

test("a priced row alongside an excluded row on the same line reads as priced", () => {
  // Subs really do this: strike the printed line and write their own number beside it.
  const g = grid({
    bids: [bid("a", "Alpha", [excluded("f1"), priced("f1", 12_000, "revised scope")])],
  });
  assert.equal(cell(g, "f1", "a").kind, "priced");
  assert.equal(cell(g, "f1", "a").declared, "priced");
  assert.equal(cell(g, "f1", "a").amountCents, 12_000);
});

/* ------------------------------------------------------------ adjustments --- */

test("a negative adjustment reduces the total and can flip the apparent low", () => {
  const g = grid({
    bids: [
      bid("a", "Alpha", [priced("f1", 100_000), priced("f2", 0), priced("f3", 0)]),
      bid("b", "Beta", [priced("f1", 110_000), priced("f2", 0), priced("f3", 0)]),
    ],
    adjustments: [normalize("b", -20_000, "owner furnishing the switchgear")],
  });
  assert.equal(col(g, "b").adjustedTotalCents, 90_000);
  assert.equal(g.apparentLow?.bidId, "b");
  assert.equal(g.spreadCents, 10_000);
});

test("a column driven to zero or below cannot win the apparent low", () => {
  const g = grid({
    bids: [
      bid("a", "Alpha", [priced("f1", 100_000), priced("f2", 0), priced("f3", 0)]),
      bid("b", "Beta", [priced("f1", 50_000), priced("f2", 0), priced("f3", 0)]),
    ],
    adjustments: [normalize("b", -50_000, "duplicate scope removed")],
  });
  assert.equal(col(g, "b").adjustedTotalCents, 0);
  assert.equal(g.apparentLow?.bidId, "a");

  const negative = grid({
    bids: [bid("b", "Beta", [priced("f1", 50_000), priced("f2", 0), priced("f3", 0)])],
    adjustments: [normalize("b", -80_000, "over-deducted")],
  });
  assert.equal(col(negative, "b").adjustedTotalCents, -30_000);
  assert.equal(negative.apparentLow, null); // nothing comparable at all
  assert.equal(negative.spreadCents, null);
});

test("plug share is not a divide-by-zero when the total is zero", () => {
  const g = grid({
    bids: [bid("a", "Alpha", [excluded("f1"), excluded("f2"), excluded("f3")])],
    adjustments: [],
  });
  assert.equal(col(g, "a").adjustedTotalCents, 0);
  assert.equal(col(g, "a").plugShare, 0);
  assert.equal(col(g, "a").plugHeavy, false);
});

test("plugs and adjustments stack in a fixed order that always reconciles", () => {
  const g = grid({
    bids: [bid("a", "Alpha", [priced("f1", 500_000), excluded("f2"), priced("f3", 250_000)])],
    adjustments: [plug("a", "f2", 90_000), normalize("a", -40_000), normalize(null, 15_000)],
  });
  const c = col(g, "a");
  assert.equal(c.baseCents, 750_000);
  assert.equal(c.plugCents, 90_000);
  assert.equal(c.adjustmentCents, -40_000 + 15_000);
  // base + plugs + adjustments, and nothing else.
  assert.equal(c.adjustedTotalCents, 750_000 + 90_000 - 25_000);
  assert.equal(c.adjustedTotalCents, c.baseCents + c.plugCents + c.adjustmentCents);
});

/* -------------------------------------------------- alternates, allowances --- */

test("a column made only of alternates has a zero base and cannot win", () => {
  const lines = [formLine("f1", 1), formLine("fa", 2, "ALT 1", { isAlternate: true })];
  const g = buildLevelingGrid({
    formLines: lines,
    bids: [
      bid("a", "Alpha", [priced("fa", 80_000)]),
      bid("b", "Beta", [priced("f1", 120_000)]),
    ],
    adjustments: [],
  });
  assert.equal(col(g, "a").baseCents, 0);
  assert.equal(col(g, "a").alternatesCents, 80_000);
  assert.equal(col(g, "a").complete, false);
  assert.equal(g.apparentLow?.bidId, "b");
});

test("allowance lines are part of the base, unlike alternates", () => {
  const lines = [
    formLine("f1", 1),
    formLine("fw", 2, "Fixture allowance", { isAllowance: true }),
    formLine("fa", 3, "ALT 1", { isAlternate: true }),
  ];
  const g = buildLevelingGrid({
    formLines: lines,
    bids: [bid("a", "Alpha", [priced("f1", 100_000), priced("fw", 30_000), priced("fa", 50_000)])],
    adjustments: [],
  });
  assert.equal(col(g, "a").baseCents, 130_000);
  assert.equal(col(g, "a").alternatesCents, 50_000);
  assert.equal(g.rows.length, 2); // base rows only
  assert.equal(g.alternateRows.length, 1);
});

test("free-form money counts in the base even while it waits in the tray", () => {
  const g = grid({
    bids: [
      bid("a", "Alpha", [
        priced("f1", 100_000),
        priced("f2", 0),
        priced("f3", 0),
        priced(null, 25_000, "scaffold and hoisting"),
      ]),
      bid("b", "Beta", [priced("f1", 110_000), priced("f2", 0), priced("f3", 0)]),
    ],
  });
  assert.equal(col(g, "a").mappedBaseCents, 100_000);
  assert.equal(col(g, "a").unmappedExtraCents, 25_000);
  assert.equal(col(g, "a").baseCents, 125_000);
  assert.equal(col(g, "a").unmappedCount, 1);
  // Alpha priced more scope, so Alpha is not the low — which is the honest answer.
  assert.equal(g.apparentLow?.bidId, "b");
  assert.equal(g.tray.length, 1);
  assert.equal(g.tray[0].rawDescription, "scaffold and hoisting");
});

test("an unpriced free-form row is in the tray but adds nothing", () => {
  const noAmount: LevelBidLine = {
    id: "bl-x",
    bidFormLineId: null,
    rawDescription: "allowance TBD",
    state: "priced",
    amountCents: null,
    mappingStatus: "unmapped",
  };
  const g = grid({ bids: [bid("a", "Alpha", [priced("f1", 100_000), noAmount])] });
  assert.equal(col(g, "a").unmappedExtraCents, 0);
  assert.equal(col(g, "a").baseCents, 100_000);
  assert.equal(g.tray.length, 1);
  assert.equal(g.tray[0].amountCents, null);
});

/* ------------------------------------------------------------- lump sums --- */

test("a lump sum is comparable on its total and covers the scope", () => {
  const g = grid({
    bids: [
      bid("a", "Alpha", [], { kind: "lump_sum", submittedTotalCents: 900_000 }),
      bid("b", "Beta", [priced("f1", 400_000), priced("f2", 300_000), priced("f3", 250_000)]),
    ],
  });
  const a = col(g, "a");
  assert.equal(a.isLumpSum, true);
  assert.equal(a.baseCents, 900_000);
  assert.equal(a.mappedBaseCents, 900_000);
  assert.equal(a.unmappedExtraCents, 0);
  assert.deepEqual(a.gapFormLineIds, []);
  assert.equal(a.complete, true);
  assert.equal(g.apparentLow?.bidId, "a"); // 9,000 against 9,500
  // Its cells say "lump sum", not "missing".
  assert.equal(cell(g, "f1", "a").kind, "missing");
  assert.equal(cell(g, "f1", "a").isLumpSumColumn, true);
  // And it never competes for a per-line low.
  assert.equal(row(g, "f1").lowCents, 400_000);
  assert.equal(cell(g, "f1", "b").isLow, true);
});

test("a lump sum with lines attached still prices by its total", () => {
  // Belt and braces: if a lump-sum bid somehow carries lines, the total wins.
  const g = grid({
    bids: [
      bid("a", "Alpha", [priced("f1", 1)], { kind: "lump_sum", submittedTotalCents: 900_000 }),
    ],
  });
  assert.equal(col(g, "a").baseCents, 900_000);
  assert.equal(cell(g, "f1", "a").kind, "missing");
});

test("a lump sum can be plugged and scope-added without double counting", () => {
  const g = grid({
    bids: [bid("a", "Alpha", [], { kind: "lump_sum", submittedTotalCents: 16_490_000 })],
    adjustments: [plug("a", "f2", 1_230_000, "excludes fire alarm"), normalize("a", 240_000, "dumpsters")],
  });
  const c = col(g, "a");
  assert.equal(c.plugCents, 1_230_000);
  assert.equal(c.adjustmentCents, 240_000);
  assert.equal(c.adjustedTotalCents, 17_960_000);
  assert.equal(money(c.adjustedTotalCents), "$179,600.00");
});

/* ------------------------------------------------------------- completeness --- */

test("gaps are exactly the base lines with neither a price nor a plug", () => {
  const g = grid({
    bids: [
      bid("a", "Alpha", [priced("f1", 100_000), excluded("f2")]), // f3 blank
    ],
    adjustments: [plug("a", "f2", 10_000)],
  });
  assert.deepEqual(col(g, "a").gapFormLineIds, ["f3"]);
  assert.equal(col(g, "a").complete, false);

  const plugged = grid({
    bids: [bid("a", "Alpha", [priced("f1", 100_000), excluded("f2")])],
    adjustments: [plug("a", "f2", 10_000), plug("a", "f3", 5_000)],
  });
  assert.deepEqual(col(plugged, "a").gapFormLineIds, []);
  assert.equal(col(plugged, "a").complete, true);
});

test("a complete column always beats an incomplete cheaper one, and says so", () => {
  const g = grid({
    bids: [
      bid("thin", "Thin", [priced("f1", 10_000)]),
      bid("full", "Full", [priced("f1", 90_000), priced("f2", 5_000), priced("f3", 5_000)]),
    ],
  });
  assert.equal(g.apparentLow?.bidId, "full");
  assert.equal(g.apparentLowProvisional, false);
  // The cheap column is still shown, with its gaps named.
  assert.equal(col(g, "thin").adjustedTotalCents, 10_000);
  assert.deepEqual(col(g, "thin").gapFormLineIds, ["f2", "f3"]);
});

test("when nothing covers the scope the low is provisional, not hidden", () => {
  const g = grid({
    bids: [
      bid("a", "Alpha", [priced("f1", 30_000)]),
      bid("b", "Beta", [priced("f1", 40_000)]),
    ],
  });
  assert.equal(g.apparentLowProvisional, true);
  assert.equal(g.apparentLow?.bidId, "a");
  assert.equal(awardFlags(g, "a").provisionalLow, true);
});

/* --------------------------------------------------------------- scope gaps --- */

test("a scope gap needs one priced cell and one absent cell", () => {
  const pricedVsExcluded = grid({
    bids: [bid("a", "Alpha", [priced("f1", 1_000)]), bid("b", "Beta", [excluded("f1")])],
  });
  assert.equal(row(pricedVsExcluded, "f1").scopeGap, true);

  const pricedVsBlank = grid({
    bids: [bid("a", "Alpha", [priced("f1", 1_000)]), bid("b", "Beta", [priced("f2", 1)])],
  });
  assert.equal(row(pricedVsBlank, "f1").scopeGap, true);

  // "Included in another line" is not a gap: they told us where the money is.
  const pricedVsElsewhere = grid({
    bids: [bid("a", "Alpha", [priced("f1", 1_000)]), bid("b", "Beta", [elsewhere("f1")])],
  });
  assert.equal(row(pricedVsElsewhere, "f1").scopeGap, false);

  // A plugged gap stays flagged: the plug is the GC's fix, not the sub's price.
  const plugged = grid({
    bids: [bid("a", "Alpha", [priced("f1", 1_000)]), bid("b", "Beta", [excluded("f1")])],
    adjustments: [plug("b", "f1", 900)],
  });
  assert.equal(row(plugged, "f1").scopeGap, true);
  assert.equal(cell(plugged, "f1", "b").kind, "plug");
});

test("a lone bidder never has a scope gap with themselves", () => {
  const g = grid({ bids: [bid("a", "Alpha", [priced("f1", 1_000), excluded("f2")])] });
  assert.equal(row(g, "f1").scopeGap, false);
  assert.equal(row(g, "f2").scopeGap, false);
  assert.equal(g.scopeGapCount, 0);
});

/* ------------------------------------------------------------------ matrix --- */

test("the matrix handles four bidders with mixed declarations", () => {
  const g = grid({
    bids: [
      bid("a", "Alpha", [priced("f1", 1)], { inclusions: ["Dumpsters", "Permits"], exclusions: [] }),
      bid("b", "Beta", [priced("f1", 1)], { inclusions: ["Permits"], exclusions: ["Dumpsters"] }),
      bid("c", "Gamma", [priced("f1", 1)], { inclusions: [], exclusions: [] }),
      bid("d", "Delta", [priced("f1", 1)], { inclusions: ["dumpsters"], exclusions: ["permits"] }),
    ],
  });
  const dumpsters = g.matrix.find((m) => /dumpster/i.test(m.label))!;
  assert.deepEqual(dumpsters.states, ["included", "excluded", "unstated", "included"]);
  assert.equal(dumpsters.scopeGap, true);
  const permits = g.matrix.find((m) => /permit/i.test(m.label))!;
  assert.deepEqual(permits.states, ["included", "included", "unstated", "excluded"]);
  assert.equal(permits.scopeGap, true);
  // Both gap rows sort ahead of anything quiet, and there are only two rows.
  assert.equal(g.matrix.length, 2);
  assert.equal(g.matrix.every((m) => m.scopeGap), true);
});

test("the matrix label is the wording most bidders used", () => {
  const g = grid({
    bids: [
      bid("a", "Alpha", [], { inclusions: ["Debris removal"] }),
      bid("b", "Beta", [], { inclusions: ["Dumpsters"] }),
      bid("c", "Gamma", [], { inclusions: ["Dumpsters"] }),
    ],
  });
  assert.equal(g.matrix.length, 1); // "debris" folds onto "dumpster"
  assert.equal(g.matrix[0].label, "Dumpsters");
  assert.deepEqual(g.matrix[0].states, ["included", "included", "included"]);
  assert.equal(g.matrix[0].scopeGap, false);
});

test("blank and whitespace-only chips never become matrix rows", () => {
  const g = grid({
    bids: [bid("a", "Alpha", [], { inclusions: ["", "   ", "Permits"], exclusions: ["\n"] })],
  });
  assert.equal(g.matrix.length, 1);
  assert.equal(g.matrix[0].label, "Permits");
});

/* --------------------------------------------------------- column ordering --- */

test("columns are ordered by arrival, and an unsubmitted column sorts last", () => {
  const g = grid({
    bids: [
      bid("c", "Gamma", [priced("f1", 1)], { submittedAt: new Date("2026-03-20T09:00:00Z") }),
      bid("a", "Alpha", [priced("f1", 1)], { submittedAt: new Date("2026-03-18T09:00:00Z") }),
      bid("n", "NoDate", [priced("f1", 1)], { submittedAt: null }),
      bid("b", "Beta", [priced("f1", 1)], { submittedAt: new Date("2026-03-19T09:00:00Z") }),
    ],
  });
  assert.deepEqual(
    g.columns.map((c) => c.bid.subName),
    ["Alpha", "Beta", "Gamma", "NoDate"],
  );
  // Matrix and grid cells stay aligned to that order.
  assert.equal(row(g, "f1").cells.length, 4);
  assert.deepEqual(
    row(g, "f1").cells.map((c) => c.bidId),
    ["a", "b", "c", "n"],
  );
});

test("form lines are ordered by sort, with a stable tiebreak", () => {
  const g = buildLevelingGrid({
    formLines: [formLine("z", 5), formLine("b", 1), formLine("a", 1), formLine("m", 3)],
    bids: [],
    adjustments: [],
  });
  assert.deepEqual(
    g.rows.map((r) => r.formLine.id),
    ["a", "b", "m", "z"],
  );
});

/* ------------------------------------------------------------ award flags --- */

test("award flags count every open question the estimator is stepping over", () => {
  const g = grid({
    bids: [
      bid("a", "Alpha", [priced("f1", 10_000), priced(null, 500, "extra")], {
        exclusions: ["Dumpsters"],
      }),
      bid("b", "Beta", [priced("f1", 20_000), excluded("f2")], { inclusions: ["Dumpsters"] }),
    ],
    adjustments: [plug("b", "f2", 40_000)],
  });
  const flags = awardFlags(g, "b");
  assert.equal(flags.unmappedLines, 1);
  assert.equal(flags.notApparentLow, true);
  assert.equal(flags.scopeGaps, g.scopeGapCount);
  assert.equal(flags.plugHeavyColumns.includes("Beta"), true);

  const lowFlags = awardFlags(g, "a");
  assert.equal(lowFlags.notApparentLow, false);
});

test("awarding a bid that is not on the package is always flagged", () => {
  const g = grid({ bids: [bid("a", "Alpha", [priced("f1", 1_000)])] });
  assert.equal(awardFlags(g, "not-a-bid").notApparentLow, true);
});

/* ------------------------------------------------------------- degenerate --- */

test("a package with no form lines still levels lump sums and free-form rows", () => {
  const g = buildLevelingGrid({
    formLines: [],
    bids: [
      bid("a", "Alpha", [], { kind: "lump_sum", submittedTotalCents: 500_000 }),
      bid("b", "Beta", [priced(null, 450_000, "everything, one line")]),
    ],
    adjustments: [],
  });
  assert.equal(g.rows.length, 0);
  assert.equal(col(g, "a").adjustedTotalCents, 500_000);
  assert.equal(col(g, "b").adjustedTotalCents, 450_000);
  assert.equal(col(g, "b").complete, true); // nothing to leave unpriced
  assert.equal(g.apparentLow?.bidId, "b");
  assert.equal(g.tray.length, 1);
});

test("an adjustment naming a bid that is not in the grid changes nothing", () => {
  const g = grid({
    bids: [bid("a", "Alpha", [priced("f1", 100_000)])],
    adjustments: [plug("ghost", "f1", 50_000), normalize("ghost", 90_000)],
  });
  assert.equal(col(g, "a").adjustedTotalCents, 100_000);
  assert.equal(col(g, "a").plugCents, 0);
  assert.equal(col(g, "a").adjustmentCents, 0);
});

test("a plug naming a form line that is not on the package changes nothing", () => {
  const g = grid({
    bids: [bid("a", "Alpha", [priced("f1", 100_000)])],
    adjustments: [plug("a", "not-a-line", 50_000)],
  });
  assert.equal(col(g, "a").plugCents, 0);
  assert.equal(col(g, "a").adjustedTotalCents, 100_000);
});

test("the grid is a pure function of its input", () => {
  const input: LevelingInput = {
    formLines: [formLine("f1", 1), formLine("f2", 2)],
    bids: [bid("a", "Alpha", [priced("f1", 12_345), excluded("f2")])],
    adjustments: [plug("a", "f2", 6_789)],
  };
  const before = JSON.stringify(input);
  const first = buildLevelingGrid(input);
  const second = buildLevelingGrid(input);
  assert.equal(JSON.stringify(input), before, "the input must not be mutated");
  assert.deepEqual(
    first.columns.map((c) => c.adjustedTotalCents),
    second.columns.map((c) => c.adjustedTotalCents),
  );
  assert.equal(first.columns[0].adjustedTotalCents, 12_345 + 6_789);
});
