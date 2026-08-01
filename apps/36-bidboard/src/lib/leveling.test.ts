/**
 * Leveling arithmetic, against a hand-checked fixture.
 *
 * The fixture is one real-shaped Division 26 package: three bidders, one of whom
 * refused to itemise, one of whom priced scope nobody asked for, and one of whom
 * struck out the fire alarm. Every expected number below was computed by hand
 * first and is written out in dollars in the comments — if the engine and the
 * comment ever disagree, the comment is the specification.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  awardFlags,
  buildLevelingGrid,
  lowStrip,
  type LevelAdjustment,
  type LevelBid,
  type LevelFormLine,
  type LevelingInput,
} from "./leveling";
import { normalizeDescription, suggestMappings, tokenSimilarity } from "./normalize";

/* ------------------------------------------------------------- the fixture --- */

const FORM: LevelFormLine[] = [
  line("f1", 1, "Temporary power and distribution"),
  line("f2", 2, "Panelboards and feeders"),
  line("f3", 3, "Branch wiring and devices"),
  line("f4", 4, "Light fixtures (owner-furnished)", { isAllowance: true }),
  line("f5", 5, "Fire alarm rough-in"),
  line("fa1", 6, "ALT 1: Site lighting poles", { isAlternate: true }),
];

function line(
  id: string,
  sort: number,
  description: string,
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

/** Meridian: itemised, excludes the fire alarm, prices the alternate. */
const meridian: LevelBid = {
  id: "b-meridian",
  invitationId: "i-meridian",
  subCompanyId: "s-meridian",
  subName: "Meridian Electric",
  kind: "itemized",
  revision: 1,
  //   8,400 + 46,200 + 92,500 + 18,000 = 165,100 base (the alternate is not in it)
  submittedTotalCents: 16_510_000,
  inclusions: ["Permits and fees"],
  exclusions: ["Fire alarm", "Dumpsters"],
  submittedAt: new Date("2026-03-14T15:00:00Z"),
  lines: [
    bl("m1", "f1", "Temporary power and distribution", 840_000),
    bl("m2", "f2", "Panelboards and feeders", 4_620_000),
    bl("m3", "f3", "Branch wiring and devices", 9_250_000),
    bl("m4", "f4", "Light fixtures (owner-furnished)", 1_800_000),
    { ...bl("m5", "f5", "Fire alarm rough-in", null), state: "excluded" },
    bl("m6", "fa1", "ALT 1: Site lighting poles", 2_200_000),
  ],
};

/** Harlan: itemised, prices everything, adds a row of their own. */
const harlan: LevelBid = {
  id: "b-harlan",
  invitationId: "i-harlan",
  subCompanyId: "s-harlan",
  subName: "Harlan Voss Electric",
  kind: "itemized",
  revision: 1,
  // 9,100 + 44,800 + 95,750 + 17,400 + 12,300 + 4,200 free-form = 183,550
  submittedTotalCents: 18_355_000,
  inclusions: ["Dumpsters", "Permits & fees"],
  exclusions: [],
  submittedAt: new Date("2026-03-15T09:30:00Z"),
  lines: [
    bl("h1", "f1", "Temporary power and distribution", 910_000),
    bl("h2", "f2", "Panelboards and feeders", 4_480_000),
    bl("h3", "f3", "Branch wiring and devices", 9_575_000),
    bl("h4", "f4", "Light fixtures (owner-furnished)", 1_740_000),
    bl("h5", "f5", "Fire alarm rough-in", 1_230_000),
    {
      ...bl("h6", null, "Temp power poles + meter base", 420_000),
      mappingStatus: "unmapped",
    },
  ],
};

/** Brightline: refuses to itemise. One number and a PDF. */
const brightline: LevelBid = {
  id: "b-brightline",
  invitationId: "i-brightline",
  subCompanyId: "s-brightline",
  subName: "Brightline Electric",
  kind: "lump_sum",
  revision: 1,
  submittedTotalCents: 16_490_000, // $164,900 — the apparent low, until it isn't
  inclusions: [],
  exclusions: ["Fire alarm"],
  submittedAt: new Date("2026-03-15T16:45:00Z"),
  lines: [],
};

const ADJUSTMENTS: LevelAdjustment[] = [
  {
    id: "a1",
    bidId: "b-meridian",
    bidFormLineId: "f5",
    kind: "plug",
    amountCents: 1_230_000,
    reason: "Plugged at Harlan's fire alarm number",
  },
  {
    id: "a2",
    bidId: "b-brightline",
    bidFormLineId: "f5",
    kind: "plug",
    amountCents: 1_230_000,
    reason: "Lump sum excludes fire alarm",
  },
  {
    id: "a3",
    bidId: "b-brightline",
    bidFormLineId: null,
    kind: "scope_add",
    amountCents: 240_000,
    reason: "Dumpsters not carried in the lump sum",
  },
];

function bl(
  id: string,
  formLineId: string | null,
  raw: string,
  cents: number | null,
): LevelBid["lines"][number] {
  return {
    id,
    bidFormLineId: formLineId,
    rawDescription: raw,
    state: "priced",
    amountCents: cents,
    mappingStatus: formLineId ? "matched" : "unmapped",
  };
}

function input(over: Partial<LevelingInput> = {}): LevelingInput {
  return {
    formLines: FORM,
    bids: [meridian, harlan, brightline],
    adjustments: ADJUSTMENTS,
    ...over,
  };
}

const col = (grid: ReturnType<typeof buildLevelingGrid>, id: string) =>
  grid.columns.find((c) => c.bid.id === id)!;
const row = (grid: ReturnType<typeof buildLevelingGrid>, id: string) =>
  [...grid.rows, ...grid.alternateRows].find((r) => r.formLine.id === id)!;
const cell = (grid: ReturnType<typeof buildLevelingGrid>, formLineId: string, bidId: string) =>
  row(grid, formLineId).cells.find((c) => c.bidId === bidId)!;

/* ------------------------------------------------------------------ tests --- */

test("column totals: base, alternates, plugs and adjustments are kept apart", () => {
  const grid = buildLevelingGrid(input());

  const m = col(grid, "b-meridian");
  assert.equal(m.baseCents, 16_510_000); //   $165,100 of priced base lines
  assert.equal(m.alternatesCents, 2_200_000); // $22,000, beside the base, not in it
  assert.equal(m.plugCents, 1_230_000); //     $12,300 fire alarm plug
  assert.equal(m.adjustedTotalCents, 17_740_000); // $177,400

  const h = col(grid, "b-harlan");
  assert.equal(h.mappedBaseCents, 17_935_000); // $179,350 on the GC's own lines
  assert.equal(h.unmappedExtraCents, 420_000); //   $4,200 they added themselves
  assert.equal(h.baseCents, 18_355_000); //         $183,550 — free-form money counts
  assert.equal(h.plugCents, 0);
  assert.equal(h.adjustedTotalCents, 18_355_000);
  assert.equal(h.unmappedCount, 1);

  const b = col(grid, "b-brightline");
  assert.equal(b.isLumpSum, true);
  assert.equal(b.baseCents, 16_490_000); //  $164,900 as submitted
  assert.equal(b.plugCents, 1_230_000);
  assert.equal(b.adjustmentCents, 240_000);
  assert.equal(b.adjustedTotalCents, 17_960_000); // $179,600
});

test("apparent low is computed on adjusted totals, so the raw low can lose", () => {
  const grid = buildLevelingGrid(input());

  // Raw: Brightline at $164,900 is cheapest by $250.
  const raw = [...grid.columns].sort((a, b) => a.baseCents - b.baseCents)[0];
  assert.equal(raw.bid.id, "b-brightline");

  // Adjusted: Meridian at $177,400 wins — Brightline's number was missing the
  // fire alarm and the dumpsters, which is exactly the trap the product exists for.
  assert.equal(grid.apparentLow?.bidId, "b-meridian");
  assert.equal(grid.apparentLow?.adjustedTotalCents, 17_740_000);
  assert.equal(grid.apparentLowProvisional, false);
  assert.equal(col(grid, "b-meridian").isApparentLow, true);
  assert.equal(col(grid, "b-brightline").isApparentLow, false);

  // Spread: 183,550 − 177,400 = 6,150
  assert.equal(grid.spreadCents, 615_000);
  assert.equal(lowStrip(grid), "LOW: MERIDIAN ELECTRIC · $177,400");
});

test("per-line low: only money a sub actually wrote can win it", () => {
  const grid = buildLevelingGrid(input());

  assert.equal(row(grid, "f1").lowCents, 840_000); // Meridian
  assert.equal(cell(grid, "f1", "b-meridian").isLow, true);
  assert.equal(row(grid, "f2").lowCents, 4_480_000); // Harlan
  assert.equal(cell(grid, "f2", "b-harlan").isLow, true);
  assert.equal(cell(grid, "f2", "b-meridian").isLow, false);

  // f5: two of the three cells are plugs of exactly the same amount as Harlan's
  // real price. The low is Harlan's, and neither plug is marked low.
  assert.equal(row(grid, "f5").lowCents, 1_230_000);
  assert.equal(cell(grid, "f5", "b-harlan").isLow, true);
  assert.equal(cell(grid, "f5", "b-meridian").kind, "plug");
  assert.equal(cell(grid, "f5", "b-meridian").isLow, false);
  assert.equal(cell(grid, "f5", "b-brightline").kind, "plug");
  assert.equal(cell(grid, "f5", "b-brightline").isLow, false);
});

test("a plug records what the sub actually said, so nothing is disguised", () => {
  const grid = buildLevelingGrid(input());
  const plugged = cell(grid, "f5", "b-meridian");
  assert.equal(plugged.kind, "plug");
  assert.equal(plugged.declared, "excluded"); // the sub struck it out
  assert.equal(plugged.amountCents, 1_230_000);
  assert.match(plugged.plugReason!, /Harlan/);
});

test("a plug retires itself when a revision prices the line — never double-counts", () => {
  const revised: LevelBid = {
    ...meridian,
    revision: 2,
    lines: meridian.lines.map((l) =>
      l.id === "m5"
        ? { ...l, state: "priced" as const, amountCents: 1_180_000 }
        : l,
    ),
  };
  const grid = buildLevelingGrid(input({ bids: [revised, harlan, brightline] }));
  const m = col(grid, "b-meridian");

  // The stale $12,300 plug row is still in the database and is simply not applied.
  assert.equal(m.plugCents, 0);
  assert.equal(cell(grid, "f5", "b-meridian").kind, "priced");
  assert.equal(m.baseCents, 16_510_000 + 1_180_000); // $177,110
  assert.equal(m.adjustedTotalCents, 17_690_000);
  // And Meridian's real $11,800 now takes the per-line low from Harlan.
  assert.equal(row(grid, "f5").lowCents, 1_180_000);
});

test("scope gaps: one sub priced it, another did not", () => {
  const grid = buildLevelingGrid(input());

  assert.equal(row(grid, "f1").scopeGap, false);
  assert.equal(row(grid, "f5").scopeGap, true); // Meridian excluded, Harlan priced
  // The lump-sum column is never used to accuse a row of a gap: it priced the
  // whole scope in one number and says nothing per line.
  assert.equal(cell(grid, "f1", "b-brightline").kind, "missing");
  assert.equal(cell(grid, "f1", "b-brightline").isLumpSumColumn, true);
  assert.equal(row(grid, "f1").scopeGap, false);

  // The alternate: only Meridian priced it. Flagged, but alternates never touch
  // the base comparison.
  assert.equal(row(grid, "fa1").scopeGap, true);
  assert.equal(grid.rows.some((r) => r.formLine.isAlternate), false);
});

test("inclusion/exclusion matrix surfaces the dumpster gap", () => {
  const grid = buildLevelingGrid(input());

  // Gap rows sort first.
  assert.equal(grid.matrix[0].label, "Dumpsters");
  assert.equal(grid.matrix[0].scopeGap, true);
  // Column order is submission order: Meridian, Harlan, Brightline.
  assert.deepEqual(grid.matrix[0].states, ["excluded", "included", "unstated"]);

  // "Permits and fees" and "Permits & fees" are one row, not two.
  const permits = grid.matrix.find((m) => /permit/i.test(m.label))!;
  assert.deepEqual(permits.states, ["included", "included", "unstated"]);
  assert.equal(permits.scopeGap, false);

  const alarm = grid.matrix.find((m) => /alarm/i.test(m.label))!;
  assert.deepEqual(alarm.states, ["excluded", "unstated", "excluded"]);
  assert.equal(alarm.scopeGap, false); // nobody included it, so it is not a gap

  assert.equal(grid.matrix.length, 3);
  assert.equal(grid.scopeGapCount, 2); // the f5 row + the dumpster matrix row
});

test("a contradictory sub (included and excluded) reads as excluded", () => {
  const confused: LevelBid = {
    ...harlan,
    id: "b-confused",
    subName: "Cass Ridge Electric",
    inclusions: ["Dumpsters"],
    exclusions: ["dumpsters"],
    lines: [],
    kind: "lump_sum",
    submittedTotalCents: 17_000_000,
  };
  const grid = buildLevelingGrid(input({ bids: [confused], adjustments: [] }));
  assert.equal(grid.matrix.length, 1);
  assert.deepEqual(grid.matrix[0].states, ["excluded"]);
});

test("the needs-mapping tray holds exactly the rows the sub invented", () => {
  const grid = buildLevelingGrid(input());
  assert.equal(grid.tray.length, 1);
  assert.deepEqual(grid.tray[0], {
    bidId: "b-harlan",
    subName: "Harlan Voss Electric",
    bidLineId: "h6",
    rawDescription: "Temp power poles + meter base",
    amountCents: 420_000,
  });
});

test("a column that leaves a base line unpriced is not complete", () => {
  const thin: LevelBid = {
    ...harlan,
    id: "b-thin",
    subName: "Pike Street Electric",
    submittedTotalCents: 9_000_000,
    lines: [bl("t1", "f1", "Temporary power and distribution", 900_000)],
  };
  const grid = buildLevelingGrid(input({ bids: [meridian, thin], adjustments: [] }));

  const t = col(grid, "b-thin");
  assert.equal(t.complete, false);
  assert.deepEqual(t.gapFormLineIds, ["f2", "f3", "f4", "f5"]);

  // Meridian has an unplugged exclusion here (no adjustments in this run), so it
  // is not complete either — nothing covers the scope, and the low says so.
  assert.equal(col(grid, "b-meridian").complete, false);
  assert.equal(grid.apparentLowProvisional, true);
  assert.equal(grid.apparentLow?.bidId, "b-thin"); // $9,000, and flagged as provisional
});

test("a complete column always beats an incomplete one for apparent low", () => {
  const thin: LevelBid = {
    ...harlan,
    id: "b-thin",
    subName: "Pike Street Electric",
    submittedTotalCents: 900_000,
    lines: [bl("t1", "f1", "Temporary power and distribution", 900_000)],
  };
  const grid = buildLevelingGrid(input({ bids: [harlan, thin], adjustments: [] }));
  assert.equal(col(grid, "b-harlan").complete, true);
  assert.equal(grid.apparentLow?.bidId, "b-harlan");
  assert.equal(grid.apparentLowProvisional, false);
});

test("an empty column cannot win the apparent low", () => {
  const blank: LevelBid = {
    ...brightline,
    id: "b-blank",
    subName: "Orchard Row Electric",
    submittedTotalCents: 0,
    kind: "itemized",
    lines: [],
  };
  const grid = buildLevelingGrid(input({ bids: [harlan, blank], adjustments: [] }));
  assert.equal(grid.apparentLow?.bidId, "b-harlan");
  assert.equal(col(grid, "b-blank").adjustedTotalCents, 0);
});

test("with no bids at all the grid is empty rather than wrong", () => {
  const grid = buildLevelingGrid(input({ bids: [], adjustments: [] }));
  assert.equal(grid.apparentLow, null);
  assert.equal(grid.spreadCents, null);
  assert.equal(grid.rows.length, 5);
  assert.equal(grid.rows[0].cells.length, 0);
  assert.equal(grid.rows[0].lowCents, null);
  assert.equal(lowStrip(grid), "NO BIDS IN YET");
});

test("plug-heavy columns are flagged, not hidden", () => {
  const half: LevelBid = {
    ...harlan,
    id: "b-half",
    subName: "Cormac & Sons Electric",
    submittedTotalCents: 200_000,
    lines: [bl("x1", "f1", "Temporary power and distribution", 200_000)],
  };
  const plugs: LevelAdjustment[] = ["f2", "f3", "f4", "f5"].map((f, i) => ({
    id: `p${i}`,
    bidId: "b-half",
    bidFormLineId: f,
    kind: "plug" as const,
    amountCents: 300_000,
    reason: "plugged from the low bidder",
  }));
  const grid = buildLevelingGrid(input({ bids: [half], adjustments: plugs }));
  const c = col(grid, "b-half");
  assert.equal(c.plugCents, 1_200_000);
  assert.equal(c.adjustedTotalCents, 1_400_000);
  assert.equal(Math.round(c.plugShare * 100), 86);
  assert.equal(c.plugHeavy, true);
  assert.equal(c.complete, true); // plugs do cover the scope — that is their job
});

test("a package-wide adjustment lands on every column once", () => {
  const grid = buildLevelingGrid(
    input({
      bids: [meridian, harlan],
      adjustments: [
        {
          id: "w1",
          bidId: null,
          bidFormLineId: null,
          kind: "normalize",
          amountCents: -150_000,
          reason: "Owner is furnishing the switchgear; deduct from all bidders",
        },
      ],
    }),
  );
  assert.equal(col(grid, "b-meridian").adjustmentCents, -150_000);
  assert.equal(col(grid, "b-harlan").adjustmentCents, -150_000);
  assert.equal(col(grid, "b-harlan").adjustedTotalCents, 18_355_000 - 150_000);
});

test("award flags tell the estimator what they are about to ignore", () => {
  const grid = buildLevelingGrid(input());

  const low = awardFlags(grid, "b-meridian");
  assert.equal(low.notApparentLow, false);
  assert.equal(low.unmappedLines, 1);
  assert.equal(low.scopeGaps, 2);
  assert.deepEqual(low.plugHeavyColumns, []);

  const notLow = awardFlags(grid, "b-harlan");
  assert.equal(notLow.notApparentLow, true);

  const nonsense = awardFlags(grid, "b-nobody");
  assert.equal(nonsense.notApparentLow, true);
});

/* -------------------------------------------------------- normalisation --- */

test("normalisation folds phrasing, not meaning", () => {
  assert.equal(
    normalizeDescription("Furnish and install panelboards"),
    normalizeDescription("Panelboards"),
  );
  assert.equal(normalizeDescription("Temp power"), normalizeDescription("temporary power"));
  assert.equal(normalizeDescription("Dumpsters"), normalizeDescription("debris"));
  // Different scope stays different.
  assert.notEqual(
    normalizeDescription("Branch wiring and devices"),
    normalizeDescription("Panelboards and feeders"),
  );
  // All-stopword input matches nothing rather than everything.
  assert.equal(normalizeDescription("furnish and install all materials"), "");
});

test("suggestMappings suggests, and only a remembered mapping auto-applies", () => {
  const forms = FORM.map((f) => ({ id: f.id, description: f.description }));
  const lines = [{ id: "h6", rawDescription: "Temp power poles + meter base" }];

  const fresh = suggestMappings(lines, forms);
  assert.equal(fresh.length, 1);
  assert.equal(fresh[0].bidFormLineId, "f1");
  assert.equal(fresh[0].reason, "overlap");
  assert.equal(fresh[0].autoApply, false);
  assert.equal(tokenSimilarity("Temp power poles + meter base", FORM[0].description), 0.5);

  const remembered = suggestMappings(lines, forms, [
    {
      rawKey: normalizeDescription("Temp power poles + meter base"),
      formKey: normalizeDescription("Temporary power and distribution"),
      formLabel: "Temporary power and distribution",
    },
  ]);
  assert.equal(remembered[0].reason, "remembered");
  assert.equal(remembered[0].autoApply, true);
  assert.equal(remembered[0].confidence, 1);
});

test("suggestMappings stays quiet when nothing is close enough", () => {
  const forms = FORM.map((f) => ({ id: f.id, description: f.description }));
  const out = suggestMappings(
    [{ id: "z1", rawDescription: "Scissor lift rental, 4 weeks" }],
    forms,
  );
  assert.deepEqual(out, []);
});
