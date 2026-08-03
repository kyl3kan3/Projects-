import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  commissionLines,
  formatBps,
  formatCents,
  formatDollars,
  grossCommissionCents,
  netCommissionCents,
  parseCommission,
  parseMoneyToCents,
  parseRateToBps,
  pipelineByMonth,
  splitTotalCents,
  type CommissionBasis,
} from "@/lib/commissions";

const basis: CommissionBasis = {
  rateBps: 250,
  split: [
    { label: "Buyer's agent (70%)", bps: 7000 },
    { label: "Broker (30%)", bps: 3000 },
  ],
  referralFeeCents: 0,
  tcFeeCents: 45000,
};

test("gross commission is exact integer cents, not a float", () => {
  // 2.5% of $438,000 = $10,950.00 exactly. In floats this is 1095000.0000000002.
  assert.equal(grossCommissionCents(43_800_000, basis), 1_095_000);
  assert.equal(formatCents(grossCommissionCents(43_800_000, basis)), "$10,950.00");
  // A rate that does not divide evenly still lands on a whole cent.
  assert.equal(grossCommissionCents(33_333_300, { ...basis, rateBps: 275 }), 916_666);
});

test("the lines balance: gross less fees equals the shares plus the remainder", () => {
  const lines = commissionLines(43_800_000, basis);
  const of = (kind: string) =>
    lines.filter((l) => l.kind === kind).reduce((sum, l) => sum + l.amountCents, 0);
  assert.equal(of("gross"), 1_095_000);
  // Deductions are stored negative, so this is a single balance identity: every
  // cent of the gross ends up on exactly one line below it.
  assert.equal(of("gross") + of("deduction") - of("share") - of("net"), 0);
});

test("fees come off the top before the splits are taken", () => {
  const lines = commissionLines(43_800_000, basis);
  const labels = lines.map((l) => l.label);
  assert.deepEqual(labels, [
    "Gross commission",
    "Transaction coordination fee",
    "Buyer's agent (70%)",
    "Broker (30%)",
    "Remainder to the house",
  ]);
  const afterFees = 1_095_000 - 45_000;
  assert.equal(lines[2].amountCents, Math.round((afterFees * 7000) / 10_000));
  assert.equal(lines[3].amountCents, Math.round((afterFees * 3000) / 10_000));
  assert.equal(lines[4].amountCents, 0, "70/30 leaves nothing behind");
  assert.match(lines[2].detail, /of \$10,500 after fees/);
});

test("a rounding remainder lands on the house line, never lost", () => {
  const thirds: CommissionBasis = {
    rateBps: 300,
    split: [
      { label: "A", bps: 3333 },
      { label: "B", bps: 3333 },
      { label: "C", bps: 3333 },
    ],
    referralFeeCents: 0,
    tcFeeCents: 0,
  };
  const lines = commissionLines(41_500_000, thirds);
  const gross = 1_245_000;
  assert.equal(lines[0].amountCents, gross);
  const shares = lines.filter((l) => l.kind === "share").reduce((s, l) => s + l.amountCents, 0);
  const house = lines.find((l) => l.kind === "net")?.amountCents ?? -1;
  assert.equal(shares + house, gross);
  assert.ok(house > 0, "the unallocated basis points stay visible");
});

test("a fee larger than the gross is clamped, never negative", () => {
  const heavy: CommissionBasis = {
    rateBps: 100,
    split: [],
    referralFeeCents: 0,
    tcFeeCents: 900_000,
  };
  // 1% of $80,000 = $800; the $9,000 fee cannot make the net negative.
  const lines = commissionLines(8_000_000, heavy);
  assert.equal(lines[0].amountCents, 80_000);
  assert.equal(lines[1].amountCents, -80_000);
  assert.equal(lines[2].amountCents, 0);
  assert.equal(netCommissionCents(8_000_000, heavy), 0);
});

test("missing price or rate says so instead of showing zero dollars", () => {
  assert.equal(commissionLines(null, basis)[0].kind, "note");
  assert.match(commissionLines(null, basis)[0].detail, /Add a sale price/);
  assert.match(commissionLines(43_800_000, { ...basis, rateBps: 0 })[0].detail, /Add a commission rate/);
  assert.equal(netCommissionCents(null, basis), 0);
  assert.equal(splitTotalCents(null, basis), 0);
});

test("a malformed commission column degrades to an empty basis", () => {
  assert.deepEqual(parseCommission(null), {
    rateBps: 0,
    split: [],
    referralFeeCents: 0,
    tcFeeCents: 0,
  });
  assert.deepEqual(parseCommission({ rateBps: "2.5" }).split, []);
  assert.equal(parseCommission({ rateBps: 250, split: [], referralFeeCents: 0, tcFeeCents: 0 }).rateBps, 250);
  // A rate above 20% is refused rather than silently computing a fantasy.
  assert.equal(parseCommission({ rateBps: 9999, split: [] }).rateBps, 0);
});

test("pipeline totals group by month of expected close and drop terminations", () => {
  const rows = pipelineByMonth([
    {
      id: "1",
      address: "412 Pecan Grove",
      status: "active",
      closingDate: "2026-06-30",
      priceCents: 43_800_000,
      commission: basis,
    },
    {
      id: "2",
      address: "88 Larkspur",
      status: "clear_to_close",
      closingDate: "2026-06-12",
      priceCents: 61_000_000,
      commission: basis,
    },
    {
      id: "3",
      address: "9 Anselmo",
      status: "terminated",
      closingDate: "2026-06-20",
      priceCents: 30_000_000,
      commission: basis,
    },
    {
      id: "4",
      address: "1500 Bellaire",
      status: "closed",
      closingDate: "2026-07-02",
      priceCents: 22_500_000,
      commission: basis,
    },
    { id: "5", address: "No date yet", status: "active", closingDate: null, priceCents: 1, commission: basis },
  ]);
  assert.deepEqual(
    rows.map((r) => [r.month, r.dealCount]),
    [
      ["2026-06", 2],
      ["2026-07", 1],
    ],
  );
  assert.equal(rows[0].volumeCents, 104_800_000);
  assert.equal(rows[0].grossCents, 1_095_000 + 1_525_000);
  assert.equal(rows[0].netCents, rows[0].grossCents - 90_000, "two TC fees come out");
});

test("money and rate parsing refuses garbage rather than guessing", () => {
  assert.equal(parseMoneyToCents("438,000"), 43_800_000);
  assert.equal(parseMoneyToCents("$438,000.50"), 43_800_050);
  assert.equal(parseMoneyToCents("438000"), 43_800_000);
  assert.equal(parseMoneyToCents("438.5"), 43_850);
  assert.equal(parseMoneyToCents(""), null);
  assert.equal(parseMoneyToCents("about four hundred"), null);
  assert.equal(parseMoneyToCents("-5"), null);
  assert.equal(parseMoneyToCents("1.234"), null);

  assert.equal(parseRateToBps("2.5"), 250);
  assert.equal(parseRateToBps("2.5%"), 250);
  assert.equal(parseRateToBps("3"), 300);
  assert.equal(parseRateToBps("25"), null, "25% is refused as a typo");
  assert.equal(parseRateToBps("abc"), null);
});

test("formatting is stable and never shows a float artefact", () => {
  assert.equal(formatCents(1_095_000), "$10,950.00");
  assert.equal(formatCents(5), "$0.05");
  assert.equal(formatCents(-45_000), "−$450.00");
  assert.equal(formatDollars(1_095_050), "$10,951");
  assert.equal(formatBps(250), "2.5%");
  assert.equal(formatBps(300), "3%");
  assert.equal(formatBps(275), "2.75%");
  assert.equal(formatBps(7000), "70%");
});
