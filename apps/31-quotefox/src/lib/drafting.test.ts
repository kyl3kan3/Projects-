import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPrompt, parseModelDraft, PROMPT_VERSION } from "@/lib/drafting";
import type { MatchableItem } from "@/lib/matching";

const CANDIDATES: MatchableItem[] = [
  {
    id: "item-condenser",
    name: "Condenser, 3-ton 15.2 SEER2 R-410A",
    description: null,
    category: "Equipment",
    kind: "material",
    unit: "each",
    unitCostCents: 195_000,
    markupPct: null,
  },
  {
    id: "item-permit",
    name: "Permit filing and inspection",
    description: null,
    category: "Flat rate",
    kind: "flat_rate",
    unit: "each",
    unitCostCents: 32_500,
    markupPct: 0,
  },
  {
    id: "item-labor",
    name: "Install labor, lead technician",
    description: null,
    category: "Labor",
    kind: "labor",
    unit: "hour",
    unitCostCents: 9_500,
    markupPct: null,
  },
];

const REQUEST = {
  trade: "hvac" as const,
  segments: [
    { index: 0, startSeconds: 12, text: "Replacing the condenser with a three-ton." },
    { index: 1, startSeconds: 48, text: "Six hours for the lead tech." },
  ],
  photoCaptions: ["Rusted pad in standing water"],
  items: CANDIDATES,
  defaultMarkupPct: 35,
  jobTitle: "Ramsey Ave — condenser changeout",
  address: "4412 Ramsey Ave, Austin, TX 78756",
};

describe("the prompt", () => {
  it("lists every candidate id the model is allowed to use", () => {
    const prompt = buildPrompt(REQUEST, CANDIDATES);
    for (const item of CANDIDATES) assert.ok(prompt.includes(item.id), `missing ${item.id}`);
  });

  it("never shows the model a price", () => {
    // The model must not be able to copy or invent a number: prices are applied
    // by the system from the price book after the reply comes back.
    const prompt = buildPrompt(REQUEST, CANDIDATES);
    assert.doesNotMatch(prompt, /195000|1950\.00|\$1,950/);
    assert.doesNotMatch(prompt, /32500|325\.00/);
  });

  it("carries the transcript with its timestamps and the photo captions", () => {
    const prompt = buildPrompt(REQUEST, CANDIDATES);
    assert.ok(prompt.includes("[12] Replacing the condenser"));
    assert.ok(prompt.includes("Rusted pad in standing water"));
  });

  it("has a version recorded on every draft", () => {
    assert.match(PROMPT_VERSION, /^\d{4}-\d{2}-[a-z]$/);
  });
});

describe("parsing a model reply", () => {
  it("prices matched rows from the price book, not from the model", () => {
    const parsed = parseModelDraft(
      {
        line_items: [
          {
            price_book_item_id: "item-condenser",
            quantity: 1,
            transcript_excerpt: "Replacing the condenser with a three-ton.",
            offset_seconds: 12,
          },
        ],
      },
      CANDIDATES,
      35,
    );
    assert.ok(parsed);
    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.rows[0].unitPriceCents, 263_250); // 195000 × 1.35
    assert.equal(parsed.rows[0].needsPricing, false);
    assert.equal(parsed.rows[0].unit, "each");
  });

  it("honours a per-item markup override", () => {
    const parsed = parseModelDraft(
      { line_items: [{ price_book_item_id: "item-permit", quantity: 1 }] },
      CANDIDATES,
      35,
    );
    assert.equal(parsed?.rows[0].unitPriceCents, 32_500);
  });

  it("turns a hallucinated item id into a flagged row, never a lookup", () => {
    const parsed = parseModelDraft(
      {
        line_items: [
          {
            price_book_item_id: "item-crane-lift-i-made-up",
            name: "Crane lift for rooftop unit",
            quantity: 1,
            transcript_excerpt: "I'll need a crane.",
          },
        ],
      },
      CANDIDATES,
      35,
    );
    assert.ok(parsed);
    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.rows[0].priceBookItemId, null);
    assert.equal(parsed.rows[0].needsPricing, true);
    assert.equal(parsed.rows[0].unitPriceCents, 0);
    assert.deepEqual(parsed.issues.map((issue) => issue.kind), ["unknown_item_id"]);
  });

  it("keeps a legitimately unmatched row as needs-pricing", () => {
    const parsed = parseModelDraft(
      {
        line_items: [
          {
            price_book_item_id: null,
            name: "Crane to set the rooftop unit",
            quantity: 1,
            transcript_excerpt: "Quote the crane separately.",
          },
        ],
      },
      CANDIDATES,
      35,
    );
    assert.equal(parsed?.rows[0].needsPricing, true);
    assert.equal(parsed?.rows[0].name, "Crane to set the rooftop unit");
  });

  it("drops an unpriced row with no name rather than showing a blank line", () => {
    const parsed = parseModelDraft(
      { line_items: [{ price_book_item_id: null, quantity: 1 }] },
      CANDIDATES,
      35,
    );
    assert.equal(parsed?.rows.length, 0);
    assert.deepEqual(parsed?.issues.map((issue) => issue.kind), ["no_name"]);
  });

  it("merges a duplicated item instead of billing it twice", () => {
    const parsed = parseModelDraft(
      {
        line_items: [
          { price_book_item_id: "item-labor", quantity: 6 },
          { price_book_item_id: "item-labor", quantity: 6 },
        ],
      },
      CANDIDATES,
      35,
    );
    assert.equal(parsed?.rows.length, 1);
    assert.equal(parsed?.rows[0].quantityMilli, 6_000);
  });

  it("returns null for a reply that is not the agreed shape", () => {
    // A parse failure has to be visible: the caller falls back to the
    // deterministic drafter and labels the estimate degraded.
    assert.equal(parseModelDraft({ items: [] }, CANDIDATES, 35), null);
    assert.equal(parseModelDraft("I'm sorry, I can't help with that.", CANDIDATES, 35), null);
    assert.equal(
      parseModelDraft({ line_items: [{ price_book_item_id: "item-labor", quantity: -3 }] }, CANDIDATES, 35),
      null,
    );
  });
});
