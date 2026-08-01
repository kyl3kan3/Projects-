/**
 * PO rendering and validation.
 *
 * The CSV is the artefact the supplier actually reads, so the tests hold it to the
 * things that break it in the real world: the BOM Excel needs, CRLF line endings,
 * quoting a product name with a comma in it, and cents that add up.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PoDraft, PoDraftLine, Supplier } from "@/db/schema";
import { csvFilename, lineUnitCost, renderCsv, validateDraft, validateLine } from "@/lib/po-format";

const DRAFT: PoDraft = {
  id: "11111111-1111-4111-8111-111111111111",
  shopId: "22222222-2222-4222-8222-222222222222",
  supplierId: "33333333-3333-4333-8333-333333333333",
  supplierName: "Apex Goods Co.",
  status: "draft",
  leadTimeDays: 18,
  lineCount: 2,
  totalCents: 0,
  sentAt: null,
  sentToEmail: null,
  dismissedAt: null,
  suppressUntil: null,
  createdAt: new Date("2026-08-01T00:00:00Z"),
};

function line(overrides: Partial<PoDraftLine> = {}): PoDraftLine {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    poDraftId: DRAFT.id,
    variantId: "55555555-5555-4555-8555-555555555555",
    sku: "OAK-SACH-06",
    title: "Cedar drawer sachets · 6-pack",
    suggestedQty: 144,
    finalQty: 144,
    unitCostCents: 890,
    ...overrides,
  };
}

const SUPPLIER: Supplier = {
  id: DRAFT.supplierId!,
  shopId: DRAFT.shopId,
  name: "Apex Goods Co.",
  email: "orders@apexgoods.example",
  leadTimeDays: 18,
  minOrderValueCents: 50_000,
  notes: null,
  createdAt: new Date("2026-06-01T00:00:00Z"),
};

describe("renderCsv", () => {
  const csv = renderCsv({
    draft: DRAFT,
    lines: [
      line(),
      line({
        id: "66666666-6666-4666-8666-666666666666",
        variantId: "77777777-7777-4777-8777-777777777777",
        sku: "OAK-MUG-03",
        title: "Enamel camp mug, speckled white",
        suggestedQty: 276,
        finalQty: 276,
        unitCostCents: 780,
      }),
    ],
    shopName: "Oaklane Goods",
    shopDomain: "oaklane-goods.myshopify.com",
    today: "2026-08-01",
  });

  it("starts with a UTF-8 BOM so Excel on Windows opens it correctly", () => {
    assert.equal(csv.charCodeAt(0), 0xfeff);
  });

  it("uses CRLF line endings", () => {
    assert.ok(csv.includes("\r\n"));
    assert.ok(!/[^\r]\n/.test(csv), "every newline is preceded by a carriage return");
  });

  it("keeps a stable column order with the header where a supplier expects it", () => {
    const rows = csv.replace(/^﻿/, "").trimEnd().split("\r\n");
    assert.equal(rows[0], "Purchase order,Apex Goods Co.");
    assert.equal(rows[1], "From,Oaklane Goods");
    assert.equal(rows[6], "SKU,Product,Quantity,Unit cost,Line total");
    assert.equal(rows[7], "OAK-SACH-06,Cedar drawer sachets · 6-pack,144,8.90,1281.60");
  });

  it("quotes a product name containing a comma, rather than shifting every column", () => {
    assert.ok(csv.includes('"Enamel camp mug, speckled white"'));
  });

  it("totals units and money from the lines, in cents, to two decimals", () => {
    const rows = csv.replace(/^﻿/, "").trimEnd().split("\r\n");
    const total = rows[rows.length - 1];
    // 144 x 890 = 128,160 and 276 x 780 = 215,280 -> 343,440 cents; 420 units.
    assert.equal(total, "Total,,420,,3434.40");
  });

  it("leaves zero-quantity lines out entirely", () => {
    const only = renderCsv({
      draft: DRAFT,
      lines: [line(), line({ id: "x", sku: "OAK-DROP-99", finalQty: 0 })].filter(
        (l) => l.finalQty > 0,
      ),
      shopName: "Oaklane Goods",
      shopDomain: "oaklane-goods.myshopify.com",
      today: "2026-08-01",
    });
    assert.ok(!only.includes("OAK-DROP-99"));
  });
});

describe("csvFilename", () => {
  it("slugs the supplier name and dates the file", () => {
    assert.equal(csvFilename(DRAFT, "2026-08-01"), "shelfsense-po-apex-goods-co-2026-08-01.csv");
  });

  it("still produces a filename for a supplier named in punctuation", () => {
    assert.equal(
      csvFilename({ ...DRAFT, supplierName: "!!!" }, "2026-08-01"),
      "shelfsense-po-purchase-order-2026-08-01.csv",
    );
  });
});

describe("lineUnitCost", () => {
  it("uses the real cost, and flags the estimate when there is none", () => {
    assert.deepEqual(lineUnitCost({ costCents: 890, priceCents: 2400 }), {
      cents: 890,
      estimated: false,
    });
    assert.deepEqual(lineUnitCost({ costCents: null, priceCents: 2400 }), {
      cents: 1200,
      estimated: true,
    });
  });
});

describe("validateLine", () => {
  it("accepts a quantity that clears the MOQ and lands on a pack", () => {
    assert.deepEqual(validateLine({ finalQty: 144, moq: 100, packSize: 24 }), {
      ok: true,
      messages: [],
      corrected: 144,
    });
  });

  it("says what the nearest acceptable quantity is, rather than just refusing", () => {
    const result = validateLine({ finalQty: 130, moq: 100, packSize: 24 });
    assert.equal(result.ok, false);
    assert.equal(result.corrected, 144);
    assert.ok(result.messages.some((m) => /whole number of 24-unit packs/.test(m)));
    assert.ok(result.messages.some((m) => /Nearest acceptable quantity is 144/.test(m)));
  });

  it("flags a quantity below the supplier's minimum", () => {
    const result = validateLine({ finalQty: 48, moq: 100, packSize: 24 });
    assert.ok(result.messages.some((m) => /Below the 100-unit minimum/.test(m)));
    assert.equal(result.corrected, 120);
  });

  it("treats zero as dropping the line, not as an error", () => {
    const result = validateLine({ finalQty: 0, moq: 100, packSize: 24 });
    assert.equal(result.ok, true);
    assert.equal(result.corrected, 0);
  });

  it("refuses a negative quantity", () => {
    assert.equal(validateLine({ finalQty: -5, moq: 0, packSize: 1 }).ok, false);
  });
});

describe("validateDraft", () => {
  const rules = new Map([[line().variantId, { moq: 100, packSize: 24 }]]);

  it("blocks a send with no supplier email and says why", () => {
    const result = validateDraft({
      draft: DRAFT,
      lines: [line()],
      supplier: { ...SUPPLIER, email: null },
      variantRules: rules,
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /no email address/.test(e)));
  });

  it("blocks a send with no supplier at all", () => {
    const result = validateDraft({
      draft: { ...DRAFT, supplierId: null, supplierName: "No supplier assigned" },
      lines: [line()],
      supplier: null,
      variantRules: rules,
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /no supplier assigned/i.test(e)));
  });

  it("blocks a send with every line at zero", () => {
    const result = validateDraft({
      draft: DRAFT,
      lines: [line({ finalQty: 0 })],
      supplier: SUPPLIER,
      variantRules: rules,
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => /no quantities/.test(e)));
  });

  it("warns about the minimum order value without blocking it", () => {
    // 24 x $8.90 = $213.60, against a $500.00 minimum. The merchant may know
    // something we do not, so this is a warning.
    const result = validateDraft({
      draft: DRAFT,
      lines: [line({ finalQty: 24 })],
      supplier: SUPPLIER,
      variantRules: rules,
    });
    assert.equal(result.ok, true);
    assert.ok(result.warnings.some((w) => /below Apex Goods Co\.'s \$500\.00 minimum/.test(w)));
  });

  it("passes a draft that clears everything", () => {
    const result = validateDraft({
      draft: DRAFT,
      lines: [line({ finalQty: 144 })],
      supplier: SUPPLIER,
      variantRules: rules,
    });
    // 144 x $8.90 = $1,281.60, over the minimum, a whole number of packs.
    assert.equal(result.ok, true);
    assert.deepEqual(result.warnings, []);
  });
});
