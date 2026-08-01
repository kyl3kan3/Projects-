import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MIN_ITEM_UNITS,
  MIN_SECTION_ITEMS,
  MIN_SECTION_UNITS,
  classify,
  plotPoint,
  sectionStats,
  summarise,
  type EngineeringInput,
} from "./engineering";

/** Builder so each test only states what it cares about. */
function row(over: Partial<EngineeringInput> & { itemId: string }): EngineeringInput {
  return {
    itemName: over.itemId,
    sectionId: "mains",
    sectionName: "Mains",
    priceCents: 2400,
    costCents: 800,
    qtySold: 50,
    revenueCents: (over.priceCents ?? 2400) * (over.qtySold ?? 50),
    ...over,
  };
}

/**
 * A four-item section, 200 units. The popularity line is 0.70/4 = 17.5% =
 * 35 units. Costs are chosen so the unit-weighted average contribution margin
 * lands on a round number.
 */
function baseSection(): EngineeringInput[] {
  return [
    row({ itemId: "chicken", priceCents: 2400, costCents: 800, qtySold: 80 }), // cm 1600
    row({ itemId: "swordfish", priceCents: 3200, costCents: 1400, qtySold: 40 }), // cm 1800
    row({ itemId: "burrata", priceCents: 1600, costCents: 700, qtySold: 50 }), // cm 900
    row({ itemId: "shrimptoast", priceCents: 1400, costCents: 800, qtySold: 30 }), // cm 600
  ];
}

test("section stats: popularity line and unit-weighted average margin", () => {
  const s = sectionStats("mains", baseSection());
  assert.equal(s.itemCount, 4);
  assert.equal(s.totalUnits, 200);
  // 200 * 0.7 / 4 = 35 units exactly
  assert.equal(s.popularityLineUnits, 35);
  // (1600*80 + 1800*40 + 900*50 + 600*30) / 200 = (128000+72000+45000+18000)/200 = 1315
  assert.equal(s.averageMarginCents, 1315);
  assert.equal(s.costedItemCount, 4);
});

test("the four quadrants come out where hand calculation puts them", () => {
  const out = classify(baseSection());
  const by = Object.fromEntries(out.map((c) => [c.itemId, c]));

  // chicken: 40% mix (popular), cm 1600 >= 1315 -> star
  assert.equal(by.chicken.quadrant, "star");
  // swordfish: 20% mix >= 17.5% (popular), cm 1800 >= 1315 -> star
  assert.equal(by.swordfish.quadrant, "star");
  // burrata: 25% mix (popular), cm 900 < 1315 -> plowhorse
  assert.equal(by.burrata.quadrant, "plowhorse");
  // shrimptoast: 15% mix < 17.5% (not popular), cm 600 < 1315 -> dog
  assert.equal(by.shrimptoast.quadrant, "dog");

  assert.equal(by.burrata.mixShareBp, 2500);
  assert.equal(by.shrimptoast.mixShareBp, 1500);
  assert.equal(by.chicken.contributionMarginCents, 1600);
});

test("a puzzle is low popularity with high margin", () => {
  // 5 items, 200 units, line = 0.7/5 = 14% = 28 units.
  const rows: EngineeringInput[] = [
    row({ itemId: "a", priceCents: 2000, costCents: 900, qtySold: 60 }), // cm 1100
    row({ itemId: "b", priceCents: 2000, costCents: 900, qtySold: 60 }), // cm 1100
    row({ itemId: "c", priceCents: 2000, costCents: 900, qtySold: 50 }), // cm 1100
    row({ itemId: "d", priceCents: 2000, costCents: 900, qtySold: 20 }), // cm 1100
    row({ itemId: "veal", priceCents: 4200, costCents: 1500, qtySold: 10 }), // cm 2700
  ];
  const by = Object.fromEntries(classify(rows).map((c) => [c.itemId, c]));
  assert.equal(by.veal.quadrant, "puzzle");
  assert.equal(by.veal.popularityHigh, false);
  assert.equal(by.veal.marginHigh, true);
  assert.equal(by.d.quadrant, "dog");
});

test("boundary: exactly on the popularity line counts as popular", () => {
  // 4 items, 200 units -> line is exactly 35 units.
  const rows = [
    row({ itemId: "onTheLine", qtySold: 35, priceCents: 2000, costCents: 500 }),
    row({ itemId: "big", qtySold: 100, priceCents: 2000, costCents: 500 }),
    row({ itemId: "mid", qtySold: 45, priceCents: 2000, costCents: 500 }),
    row({ itemId: "small", qtySold: 20, priceCents: 2000, costCents: 500 }),
  ];
  const by = Object.fromEntries(classify(rows).map((c) => [c.itemId, c]));
  assert.equal(by.onTheLine.popularityHigh, true, "35 of 200 with n=4 is exactly the line");
  assert.equal(by.onTheLine.popularityIndex, 10000, "index 10000 means on the line");
  assert.equal(by.small.popularityHigh, false);
});

test("boundary: one unit below the popularity line is not popular", () => {
  const rows = [
    row({ itemId: "justUnder", qtySold: 34, priceCents: 2000, costCents: 500 }),
    row({ itemId: "big", qtySold: 101, priceCents: 2000, costCents: 500 }),
    row({ itemId: "mid", qtySold: 45, priceCents: 2000, costCents: 500 }),
    row({ itemId: "small", qtySold: 20, priceCents: 2000, costCents: 500 }),
  ];
  const by = Object.fromEntries(classify(rows).map((c) => [c.itemId, c]));
  assert.equal(by.justUnder.popularityHigh, false);
  assert.ok(by.justUnder.popularityIndex < 10000);
});

test("boundary: margin exactly equal to the section average counts as high", () => {
  // All four items cm 1000 -> weighted average 1000, everyone is on the line.
  const rows = [
    row({ itemId: "a", priceCents: 2000, costCents: 1000, qtySold: 80 }),
    row({ itemId: "b", priceCents: 2500, costCents: 1500, qtySold: 60 }),
    row({ itemId: "c", priceCents: 1800, costCents: 800, qtySold: 40 }),
    row({ itemId: "d", priceCents: 3000, costCents: 2000, qtySold: 20 }),
  ];
  const out = classify(rows);
  for (const c of out) {
    assert.equal(c.marginHigh, true, `${c.itemId} sits on the margin line and counts as high`);
    assert.equal(c.marginIndex, 10000);
  }
  // 20/200 = 10% < 17.5% -> not popular, but high margin -> puzzle
  assert.equal(out.find((c) => c.itemId === "d")!.quadrant, "puzzle");
});

test("boundary: one cent below the section average margin is low", () => {
  const rows = [
    row({ itemId: "a", priceCents: 2000, costCents: 1000, qtySold: 100 }), // cm 1000
    row({ itemId: "b", priceCents: 2000, costCents: 1000, qtySold: 60 }), // cm 1000
    row({ itemId: "c", priceCents: 2000, costCents: 1000, qtySold: 30 }), // cm 1000
    row({ itemId: "thin", priceCents: 2000, costCents: 1001, qtySold: 60 }), // cm 999
  ];
  const by = Object.fromEntries(classify(rows).map((c) => [c.itemId, c]));
  // weighted avg = (1000*190 + 999*60)/250 = (190000+59940)/250 = 999.76 -> 999.76
  // thin cm 999 < 999.76 -> low
  assert.equal(by.thin.marginHigh, false);
  assert.equal(by.a.marginHigh, true);
  assert.equal(by.thin.quadrant, "plowhorse");
});

test("withheld: a section with too few items gets no quadrants", () => {
  const rows = [
    row({ itemId: "a", qtySold: 100 }),
    row({ itemId: "b", qtySold: 100 }),
    row({ itemId: "c", qtySold: 100 }),
  ];
  assert.ok(rows.length < MIN_SECTION_ITEMS);
  for (const c of classify(rows)) {
    assert.equal(c.quadrant, null);
    assert.equal(c.withheldReason, "too_few_items");
    assert.match(c.recommendation, /only 3 items/);
  }
});

test("withheld: a section under the unit floor gets no quadrants", () => {
  const rows = [
    row({ itemId: "a", qtySold: 9 }),
    row({ itemId: "b", qtySold: 9 }),
    row({ itemId: "c", qtySold: 9 }),
    row({ itemId: "d", qtySold: 9 }),
  ];
  assert.ok(36 < MIN_SECTION_UNITS);
  for (const c of classify(rows)) {
    assert.equal(c.withheldReason, "too_few_sales");
    assert.match(c.recommendation, /36 covers/);
  }
});

test("withheld: an item under the item floor is not called a dog", () => {
  const rows = [
    row({ itemId: "a", qtySold: 100 }),
    row({ itemId: "b", qtySold: 100 }),
    row({ itemId: "c", qtySold: 100 }),
    row({ itemId: "rare", qtySold: MIN_ITEM_UNITS - 1, priceCents: 1200, costCents: 1100 }),
  ];
  const by = Object.fromEntries(classify(rows).map((c) => [c.itemId, c]));
  assert.equal(by.rare.quadrant, null);
  assert.equal(by.rare.withheldReason, "too_few_sales");
  assert.match(by.rare.recommendation, /too thin a sample/);
  // Its popularity is still reported honestly.
  assert.equal(by.rare.mixShareBp, 291);
  assert.equal(by.a.quadrant !== null, true, "its neighbours are still classified");
});

test("withheld: no plate cost means no quadrant, but popularity still reports", () => {
  const rows = [
    row({ itemId: "a", qtySold: 80 }),
    row({ itemId: "b", qtySold: 60 }),
    row({ itemId: "c", qtySold: 40 }),
    row({ itemId: "nocost", qtySold: 60, costCents: null }),
  ];
  const by = Object.fromEntries(classify(rows).map((c) => [c.itemId, c]));
  assert.equal(by.nocost.quadrant, null);
  assert.equal(by.nocost.withheldReason, "needs_cost");
  assert.equal(by.nocost.contributionMarginCents, null);
  assert.equal(by.nocost.marginIndex, null);
  assert.equal(by.nocost.popularityHigh, true);
  assert.match(by.nocost.recommendation, /Add a plate cost/);
  assert.equal(plotPoint(by.nocost), null, "an item with no margin axis is not plotted");
});

test("withheld: one costed item in a section is not an average", () => {
  const rows = [
    row({ itemId: "a", qtySold: 80, costCents: 800 }),
    row({ itemId: "b", qtySold: 60, costCents: null }),
    row({ itemId: "c", qtySold: 40, costCents: null }),
    row({ itemId: "d", qtySold: 60, costCents: null }),
  ];
  const by = Object.fromEntries(classify(rows).map((c) => [c.itemId, c]));
  assert.equal(by.a.quadrant, null);
  assert.equal(by.a.withheldReason, "needs_cost");
  assert.match(by.a.recommendation, /costed items are the minimum/);
});

test("sample-size refusal outranks the missing-cost refusal", () => {
  // Section is fine on items but starved on units; one item also has no cost.
  const rows = [
    row({ itemId: "a", qtySold: 5 }),
    row({ itemId: "b", qtySold: 5 }),
    row({ itemId: "c", qtySold: 5, costCents: null }),
    row({ itemId: "d", qtySold: 5 }),
  ];
  const by = Object.fromEntries(classify(rows).map((c) => [c.itemId, c]));
  assert.equal(by.c.withheldReason, "too_few_sales", "period problems are reported first");
});

test("sections are analysed independently of each other", () => {
  const mains = baseSection();
  const desserts: EngineeringInput[] = [
    row({ itemId: "sundae", sectionId: "desserts", sectionName: "Desserts", priceCents: 900, costCents: 200, qtySold: 60 }),
    row({ itemId: "tart", sectionId: "desserts", sectionName: "Desserts", priceCents: 1100, costCents: 400, qtySold: 30 }),
    row({ itemId: "affogato", sectionId: "desserts", sectionName: "Desserts", priceCents: 800, costCents: 150, qtySold: 25 }),
    row({ itemId: "cheese", sectionId: "desserts", sectionName: "Desserts", priceCents: 1600, costCents: 900, qtySold: 15 }),
  ];
  const out = classify([...mains, ...desserts]);
  assert.equal(out.length, 8);
  const by = Object.fromEntries(out.map((c) => [c.itemId, c]));
  // The $9 sundae is a star in Desserts even though every main out-prices it.
  assert.equal(by.sundae.quadrant, "star");
  assert.equal(by.sundae.sectionName, "Desserts");
  // Mains are unaffected by the dessert rows.
  assert.equal(by.chicken.quadrant, "star");
  assert.equal(by.chicken.mixShareBp, 4000);
});

test("classify preserves input order across interleaved sections", () => {
  const inputs = [
    row({ itemId: "m1", sectionId: "m", qtySold: 40 }),
    row({ itemId: "d1", sectionId: "d", qtySold: 40 }),
    row({ itemId: "m2", sectionId: "m", qtySold: 40 }),
    row({ itemId: "d2", sectionId: "d", qtySold: 40 }),
  ];
  const out = classify(inputs);
  assert.deepEqual(
    out.map((c) => c.itemId),
    ["m1", "d1", "m2", "d2"],
  );
});

test("plot points put both thresholds at the middle of the chart", () => {
  const on = classify([
    row({ itemId: "onLine", qtySold: 35, priceCents: 2000, costCents: 1000 }),
    row({ itemId: "b", qtySold: 100, priceCents: 2000, costCents: 1000 }),
    row({ itemId: "c", qtySold: 45, priceCents: 2000, costCents: 1000 }),
    row({ itemId: "d", qtySold: 20, priceCents: 2000, costCents: 1000 }),
  ]).find((c) => c.itemId === "onLine")!;
  const p = plotPoint(on)!;
  assert.equal(p.x, 0.5);
  assert.equal(p.y, 0.5);
});

test("summarise counts quadrants and abstentions", () => {
  const s = summarise(
    classify([
      ...baseSection(),
      row({ itemId: "nocost", qtySold: 60, costCents: null }),
    ]),
  );
  assert.equal(s.total, 5);
  assert.equal(s.classified, 4);
  assert.equal(s.withheld, 1);
  assert.equal(s.needsCost, 1);
  assert.equal(s.star + s.plowhorse + s.puzzle + s.dog, 4);
});

test("recommendations carry the item's own numbers", () => {
  const by = Object.fromEntries(classify(baseSection()).map((c) => [c.itemId, c]));
  // burrata: cm 900, section average 1315, gap 415 -> 1600+415=2015 -> round up to 2050
  assert.match(by.burrata.recommendation, /\$20\.50 \(\+\$4\.50\)/);
  assert.match(by.burrata.recommendation, /\$13\.15 section average/);
  assert.match(by.chicken.recommendation, /80 sold at a \$16\.00 margin/);
  assert.match(by.shrimptoast.recommendation, /Cut or reinvent/);
});

test("zero sales in a section does not divide by zero", () => {
  const rows = [
    row({ itemId: "a", qtySold: 0 }),
    row({ itemId: "b", qtySold: 0 }),
    row({ itemId: "c", qtySold: 0 }),
    row({ itemId: "d", qtySold: 0 }),
  ];
  const out = classify(rows);
  for (const c of out) {
    assert.equal(c.mixShareBp, 0);
    assert.equal(c.popularityIndex, 0);
    assert.equal(c.quadrant, null);
    assert.equal(c.withheldReason, "too_few_sales");
  }
});

test("an item sold at a loss is a dog, not a crash", () => {
  const rows = [
    row({ itemId: "a", priceCents: 2000, costCents: 800, qtySold: 80 }),
    row({ itemId: "b", priceCents: 2000, costCents: 800, qtySold: 60 }),
    row({ itemId: "c", priceCents: 2000, costCents: 800, qtySold: 40 }),
    row({ itemId: "loss", priceCents: 1200, costCents: 1500, qtySold: 20 }),
  ];
  const by = Object.fromEntries(classify(rows).map((c) => [c.itemId, c]));
  assert.equal(by.loss.contributionMarginCents, -300);
  assert.equal(by.loss.marginHigh, false);
  assert.equal(by.loss.quadrant, "dog");
  assert.ok((by.loss.marginIndex ?? 0) < 0, "a negative margin gets a negative index, not NaN");
  const p = plotPoint(by.loss)!;
  assert.equal(p.x, 0, "below-zero margin clamps to the left edge rather than escaping the chart");
  assert.ok(p.y > 0.28 && p.y < 0.29);
});
