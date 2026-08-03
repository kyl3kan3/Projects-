import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTO_ACCEPT_BP,
  billSchema,
  costOf,
  deterministicExtractor,
  formatMicrocents,
  isSupportedMime,
  minConfidence,
  toReading,
  type ExtractedLine,
} from "./extraction";

const line = (over: Partial<ExtractedLine> = {}): ExtractedLine => ({
  category: "electricity_kwh",
  quantityMilli: 4_182_000,
  unit: "kWh",
  sourceQuantity: "4182",
  sourceUnit: "kWh",
  serviceStart: "2025-03-01",
  serviceEnd: "2025-03-31",
  provider: "Consolidated Edison",
  fieldConfidences: { quantity: 9_700, period: 9_800, provider: 9_900, category: 9_700 },
  evidence: {},
  ...over,
});

const bytesOf = (s: string) => new Uint8Array(Buffer.from(s, "utf8"));

/* ------------------------------------------------------------- confidence --- */

test("document confidence is the minimum across the fields that change a number", () => {
  assert.equal(minConfidence([line()]), 9_700);
  assert.equal(minConfidence([line({ fieldConfidences: { quantity: 5_000, period: 9_800 } })]), 5_000);
  assert.equal(minConfidence([]), 0);
});

test("a low-confidence provider does not block acceptance", () => {
  // A municipal utility nobody has heard of scores 52% on the name. The quantity, the
  // period and the category were all read cleanly, and none of the arithmetic touches the
  // provider — so this document is accepted, with the provider flagged on the review screen.
  const c = minConfidence([
    line({ fieldConfidences: { quantity: 9_700, period: 9_800, provider: 5_200, category: 9_700 } }),
  ]);
  assert.ok(c >= AUTO_ACCEPT_BP, `expected auto-accept, got ${c}`);
});

test("the weakest line drags the whole document down", () => {
  const c = minConfidence([line(), line({ fieldConfidences: { quantity: 4_000, period: 9_000 } })]);
  assert.equal(c, 4_000);
});

/* ------------------------------------------------------- schema and mapping --- */

const rawBill = {
  provider: "Consolidated Edison",
  service_address: "118 Meserole Ave, Brooklyn NY",
  lines: [
    {
      category: "electricity_kwh" as const,
      quantity: "4182",
      unit: "kWh",
      period_start: "2025-03-01",
      period_end: "2025-03-31",
      confidence: { quantity: 0.99, period: 0.98, provider: 0.99, category: 0.99 },
      evidence: { quantity: "Total kWh used 4,182", period: "Service Period: Mar 1 - Mar 31" },
    },
  ],
};

test("a well-formed model response maps to a canonical reading", () => {
  const { reading, dropped } = toReading(billSchema.parse(rawBill));
  assert.deepEqual(dropped, []);
  assert.equal(reading.lines.length, 1);
  assert.equal(reading.lines[0].quantityMilli, 4_182_000);
  assert.equal(reading.confidenceBp, 9_800);
});

test("a unit that does not belong to the category is dropped, with a reason", () => {
  const { reading, dropped } = toReading(
    billSchema.parse({
      ...rawBill,
      lines: [{ ...rawBill.lines[0], unit: "gallons" }],
    }),
  );
  assert.equal(reading.lines.length, 0);
  assert.match(dropped[0], /not a unit of electricity_kwh/);
});

test("therms on a gas line convert; therms on an electricity line do not", () => {
  const gas = toReading(
    billSchema.parse({
      ...rawBill,
      lines: [{ ...rawBill.lines[0], category: "natural_gas_kwh", unit: "therms", quantity: "812" }],
    }),
  );
  assert.equal(gas.reading.lines[0].quantityMilli, 23_791_681);
  assert.equal(gas.reading.lines[0].sourceUnit, "therms");
});

test("a period that runs backwards or is not a date is dropped", () => {
  for (const bad of [
    { period_start: "2025-03-31", period_end: "2025-03-01" },
    // The model was asked for ISO dates. A slashed date is not one, and coercing it here
    // would mean guessing whether 03/01 is March or January.
    { period_start: "03/01/2025", period_end: "03/31/2025" },
  ]) {
    const { reading, dropped } = toReading(
      billSchema.parse({ ...rawBill, lines: [{ ...rawBill.lines[0], ...bad }] }),
    );
    assert.equal(reading.lines.length, 0);
    assert.ok(dropped.length === 1, JSON.stringify(dropped));
  }
});

test("a non-numeric quantity is dropped rather than coerced to zero", () => {
  const { reading, dropped } = toReading(
    billSchema.parse({ ...rawBill, lines: [{ ...rawBill.lines[0], quantity: "n/a" }] }),
  );
  assert.equal(reading.lines.length, 0);
  assert.match(dropped[0], /is not a number/);
});

test("the schema rejects a category the engine has no factor for", () => {
  const bad = { ...rawBill, lines: [{ ...rawBill.lines[0], category: "nuclear_fusion" }] };
  assert.equal(billSchema.safeParse(bad).success, false);
});

test("the schema rejects a confidence outside 0..1", () => {
  const bad = {
    ...rawBill,
    lines: [{ ...rawBill.lines[0], confidence: { quantity: 42, period: 1, provider: 1, category: 1 } }],
  };
  assert.equal(billSchema.safeParse(bad).success, false);
});

/* ------------------------------------------------- deterministic extractor --- */

test("the deterministic extractor reads a text bill", async () => {
  const outcome = await deterministicExtractor().extract({
    bytes: bytesOf(
      [
        "Consolidated Edison Company of New York",
        "Service Period: Mar 1, 2025 - Mar 31, 2025",
        "Total kWh used 4,182",
      ].join("\n"),
    ),
    mimeType: "text/plain",
    filename: "march.txt",
    contentHash: "abc",
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.reading.lines[0].quantityMilli, 4_182_000);
  assert.equal(outcome.costMicrocents, 0);
});

test("with no text at all it fails rather than inventing a reading", async () => {
  const outcome = await deterministicExtractor().extract({
    bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    mimeType: "image/png",
    filename: "photo.png",
    contentHash: "def",
  });
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.failure, "no_text");
  assert.match(outcome.message, /vision extractor|type the figures/i);
});

test("an incomplete reading fails with the missing fields named", async () => {
  const outcome = await deterministicExtractor().extract({
    bytes: bytesOf("Consolidated Edison\nAmount due $993.53\nThank you for your business"),
    mimeType: "text/plain",
    filename: "stub.txt",
    contentHash: "ghi",
  });
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.failure, "parse_failed");
  assert.match(outcome.message, /billed quantity|service period/);
});

/* ------------------------------------------------------------------- cost --- */

test("cost accounting is in microcents and uses current model ids", () => {
  assert.equal(costOf("claude-haiku-4-5-20251001", 3_000, 400), 500_000);
  assert.equal(costOf("claude-sonnet-5", 1_000, 100), 450_000);
  // An unknown model must still be charged rather than counted as free.
  assert.ok(costOf("some-future-model", 1_000, 100) > 0);
  assert.equal(formatMicrocents(500_000), "$0.0050");
});

test("supported input types", () => {
  assert.equal(isSupportedMime("application/pdf"), true);
  assert.equal(isSupportedMime("image/jpeg"), true);
  assert.equal(isSupportedMime("text/csv"), true);
  assert.equal(isSupportedMime("application/zip"), false);
});
