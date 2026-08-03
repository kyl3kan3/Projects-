import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  candidatesForSegment,
  buildIndex,
  draftFromSegments,
  extractQuantities,
  findCandidates,
  needsPricingFrom,
  parseNumberAt,
  segmentTranscript,
  tokenize,
  type MatchableItem,
} from "@/lib/matching";
import { DEMO_NARRATION, starterBookFor } from "@/lib/trades";

/** The starter book as matchable items, with stable ids. */
function book(trade: Parameters<typeof starterBookFor>[0]): MatchableItem[] {
  return starterBookFor(trade).map((item, i) => ({
    id: `${trade}-${i}`,
    name: item.name,
    description: item.description ?? null,
    category: item.category,
    kind: item.kind,
    unit: item.unit,
    unitCostCents: item.unitCostCents,
    markupPct: item.markupPct ?? null,
  }));
}

function itemNamed(items: MatchableItem[], fragment: string): MatchableItem {
  const found = items.find((item) => item.name.toLowerCase().includes(fragment.toLowerCase()));
  assert.ok(found, `no starter item matching "${fragment}"`);
  return found;
}

describe("spoken numbers", () => {
  it("reads plain digits", () => {
    assert.deepEqual(parseNumberAt(["2200"], 0), { value: 2200, end: 1, spelled: false });
    assert.deepEqual(parseNumberAt(["2.5"], 0), { value: 2.5, end: 1, spelled: false });
  });

  it("reads compound number words", () => {
    assert.equal(parseNumberAt(tokenize("twenty two hundred"), 0)?.value, 2200);
    assert.equal(parseNumberAt(tokenize("a hundred and forty"), 0)?.value, 140);
    assert.equal(parseNumberAt(tokenize("two hundred and ten"), 0)?.value, 210);
    assert.equal(parseNumberAt(tokenize("forty two"), 0)?.value, 42);
    assert.equal(parseNumberAt(tokenize("fifty"), 0)?.value, 50);
  });

  it("is not a number", () => {
    assert.equal(parseNumberAt(["condenser"], 0), null);
  });
});

describe("quantities", () => {
  it("keeps measured units apart", () => {
    const q = extractQuantities(tokenize("about twenty five feet of line set"));
    assert.deepEqual(
      q.map((m) => [m.value, m.kind]),
      [[25, "feet"]],
    );
  });

  it("reads square feet as area, not length", () => {
    const q = extractQuantities(tokenize("roughly twenty two hundred square feet of shingles"));
    assert.deepEqual(
      q.map((m) => [m.value, m.kind]),
      [[2200, "sqft"]],
    );
  });

  it("reads linear feet as length", () => {
    const q = extractQuantities(tokenize("a hundred and forty linear feet of ice and water shield"));
    assert.deepEqual(
      q.map((m) => [m.value, m.kind]),
      [[140, "feet"]],
    );
  });

  it("treats a number in front of a spec word as a spec, not a quantity", () => {
    // The bug this guards: "twelve twenty-amp breakers" read as twenty breakers.
    const q = extractQuantities(tokenize("twelve twenty-amp AFCI breakers"));
    assert.deepEqual(
      q.map((m) => [m.value, m.kind]),
      [[12, "count"]],
    );
  });

  it("reads hours", () => {
    const q = extractQuantities(tokenize("eight hours journeyman, four hours apprentice"));
    assert.deepEqual(
      q.map((m) => [m.value, m.kind]),
      [
        [8, "hours"],
        [4, "hours"],
      ],
    );
  });
});

describe("retrieval", () => {
  it("finds the condenser from a sentence that never says the model number", () => {
    const items = book("hvac");
    const index = buildIndex(items);
    const found = candidatesForSegment(
      { index: 0, startSeconds: 0, text: "We're replacing the condenser with a three-ton 15.2 SEER2." },
      index,
    );
    assert.equal(found[0]?.item.id, itemNamed(items, "Condenser, 3-ton").id);
  });

  it("understands contractor slang for a panel", () => {
    const items = book("electrical");
    const index = buildIndex(items);
    const found = candidatesForSegment(
      { index: 0, startSeconds: 0, text: "That breaker panel is a Federal Pacific Stab-Lok." },
      index,
    );
    assert.ok(
      found.some((c) => c.item.name.includes("Load center")),
      `expected a load center, got ${found.map((c) => c.item.name).join(", ")}`,
    );
  });

  it("returns nothing for a sentence about nothing in the book", () => {
    const items = book("plumbing");
    const index = buildIndex(items);
    const found = candidatesForSegment(
      { index: 0, startSeconds: 0, text: "The dog is friendly and the gate was open." },
      index,
    );
    assert.deepEqual(found, []);
  });

  it("caps the candidate set handed to a model", () => {
    const items = book("hvac");
    const segments = segmentTranscript(DEMO_NARRATION.hvac, 240);
    const candidates = findCandidates(items, segments, 5);
    assert.equal(candidates.length, 5);
  });
});

describe("needs pricing", () => {
  it("flags work the contractor said they would price later", () => {
    const name = needsPricingFrom({
      index: 0,
      startSeconds: 0,
      text:
        "I'll also need a crane to set the rooftop unit at the shop next door, so quote that separately once I hear back from the crane company.",
    });
    assert.ok(name, "expected a flagged row");
    // The row is named after the work, not after the clause that says "later".
    assert.match(String(name), /crane/i);
    assert.doesNotMatch(String(name), /separately|hear back/i);
  });

  it("names the work even when the cue clause is all filler", () => {
    const name = needsPricingFrom({
      index: 0,
      startSeconds: 0,
      text:
        "There's a knob-and-tube run in the attic I can't price until I open the ceiling.",
    });
    assert.match(String(name), /knob/i);
  });

  it("flags another trade's scope", () => {
    const name = needsPricingFrom({
      index: 0,
      startSeconds: 0,
      text:
        "Also there's a satellite dish mount through the deck that somebody needs to come remove — not my scope, price it out separately.",
    });
    assert.match(String(name), /satellite dish/i);
  });

  it("leaves ordinary narration alone", () => {
    assert.equal(
      needsPricingFrom({ index: 0, startSeconds: 0, text: "New condenser pad and a new thermostat." }),
      null,
    );
  });
});

describe("drafting without a model", () => {
  it("drafts the HVAC walkthrough into priced rows and one flag", () => {
    const items = book("hvac");
    const outcome = draftFromSegments({
      segments: segmentTranscript(DEMO_NARRATION.hvac, 260),
      items,
      defaultMarkupPct: 35,
    });

    const names = outcome.rows.map((row) => row.name);
    assert.ok(outcome.rows.length >= 8, `expected >= 8 rows, got ${outcome.rows.length}: ${names}`);
    assert.ok(names.some((n) => n.includes("Condenser, 3-ton")), names.join(" | "));
    assert.ok(names.some((n) => n.includes("Condenser pad")), names.join(" | "));
    assert.ok(names.some((n) => n.includes("Line set")), names.join(" | "));
    assert.ok(names.some((n) => n.includes("Thermostat")), names.join(" | "));

    // Every priced row references a real item; every unpriced row carries no money.
    for (const row of outcome.rows) {
      if (row.needsPricing) {
        assert.equal(row.priceBookItemId, null);
        assert.equal(row.unitPriceCents, 0);
      } else {
        assert.ok(row.priceBookItemId, `row "${row.name}" has no price book item`);
        assert.ok(items.some((item) => item.id === row.priceBookItemId));
        assert.ok(row.unitPriceCents > 0);
      }
      assert.ok(row.transcriptExcerpt.length > 0, "every row cites its narration");
    }
    assert.equal(outcome.needsPricingCount, 1);
  });

  it("carries spoken quantities onto the rows", () => {
    const items = book("hvac");
    const outcome = draftFromSegments({
      segments: segmentTranscript(DEMO_NARRATION.hvac, 260),
      items,
      defaultMarkupPct: 35,
    });
    const lineSet = outcome.rows.find((row) => row.name.startsWith("Line set"));
    assert.equal(lineSet?.quantityMilli, 25_000, "line set should be 25 linear feet");
    const apprentice = outcome.rows.find((row) => row.name.includes("apprentice"));
    assert.equal(apprentice?.quantityMilli, 6_000, "six apprentice hours");
  });

  it("prices from the item's own markup override, not the org default", () => {
    const items: MatchableItem[] = [
      {
        id: "permit",
        name: "Permit filing and inspection",
        category: "Flat rate",
        kind: "flat_rate",
        unit: "each",
        unitCostCents: 32_500,
        markupPct: 0,
      },
    ];
    const outcome = draftFromSegments({
      segments: [{ index: 0, startSeconds: 0, text: "Permit gets filed with the county." }],
      items,
      defaultMarkupPct: 35,
    });
    assert.equal(outcome.rows[0]?.unitPriceCents, 32_500);
  });

  it("drafts the roofing walkthrough with areas and lengths", () => {
    const items = book("roofing");
    const outcome = draftFromSegments({
      segments: segmentTranscript(DEMO_NARRATION.roofing, 220),
      items,
      defaultMarkupPct: 30,
    });
    const shingles = outcome.rows.find((row) => row.name.includes("Architectural shingles"));
    assert.equal(shingles?.quantityMilli, 2_200_000, "2,200 sqft of shingles");
    const ridge = outcome.rows.find((row) => row.name.includes("Ridge vent"));
    assert.equal(ridge?.quantityMilli, 42_000, "42 lf of ridge vent");
    assert.ok(outcome.needsPricingCount >= 1);
  });

  it("drafts the electrical walkthrough with the breaker count read correctly", () => {
    const items = book("electrical");
    const outcome = draftFromSegments({
      segments: segmentTranscript(DEMO_NARRATION.electrical, 240),
      items,
      defaultMarkupPct: 40,
    });
    const afci = outcome.rows.find((row) => row.name.includes("AFCI"));
    assert.equal(afci?.quantityMilli, 12_000, "twelve AFCI breakers, not twenty");
    const panel = outcome.rows.find((row) => row.name.includes("Load center"));
    assert.ok(panel, "the load center should be drafted");
  });

  it("drafts the plumbing walkthrough and flags the unknown slab break", () => {
    const items = book("plumbing");
    const outcome = draftFromSegments({
      segments: segmentTranscript(DEMO_NARRATION.plumbing, 200),
      items,
      defaultMarkupPct: 35,
    });
    assert.ok(outcome.rows.some((row) => row.name.includes("Water heater, 50-gallon")));
    assert.ok(outcome.rows.some((row) => row.name.includes("Pressure-reducing valve")));
    const flagged = outcome.rows.filter((row) => row.needsPricing);
    assert.equal(flagged.length, 1);
    assert.match(flagged[0].name, /slab|break/i);
  });

  it("uses photo captions as evidence", () => {
    const items = book("hvac");
    const outcome = draftFromSegments({
      segments: [{ index: 0, startSeconds: 0, text: "Standing at the outdoor unit." }],
      items,
      defaultMarkupPct: 35,
      photoCaptions: ["Rusted condenser pad, sitting in standing water"],
    });
    assert.ok(outcome.rows.some((row) => row.name.includes("Condenser pad")));
  });
});
