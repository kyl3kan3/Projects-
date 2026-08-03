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
import {
  csvFilename,
  groupForPurchase,
  lineUnitCost,
  renderCsv,
  validateDraft,
  validateLine,
  UNASSIGNED_SUPPLIER_NAME,
  type GroupableRow,
  type SupplierRules,
} from "@/lib/po-format";

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

/* ---------------------------------------------------------------- grouping --- */

/**
 * Fixture E — a variant that shares a supplier with others.
 *
 * The fourth case the brief names, and the one that costs money quietly: four SKUs on
 * a 34-day sea-freight account belong on one PO, because the merchant places one order
 * and the supplier's minimum applies to the order rather than the line. Split into
 * four, every one of them misses the £1,200 minimum and the supplier rejects the lot.
 *
 * Arithmetic is written out longhand below and asserted, not read back from the
 * implementation.
 */
describe("fixture E — grouping SKUs that share a supplier", () => {
  const NORTHBAY: SupplierRules = {
    id: "northbay",
    name: "Northbay Textiles",
    leadTimeDays: 34,
    minOrderValueCents: 120_000,
  };
  const KETTLE: SupplierRules = {
    id: "kettle",
    name: "Kettle & Co",
    leadTimeDays: 7,
    minOrderValueCents: 15_000,
  };

  function row(overrides: Partial<GroupableRow> & { sku: string }): GroupableRow {
    return {
      variantId: `v-${overrides.sku}`,
      displayTitle: overrides.sku,
      status: "order_now",
      reorderQty: 100,
      moq: 0,
      packSize: 1,
      costCents: 1000,
      priceCents: 4000,
      supplierId: NORTHBAY.id,
      leadTimeDays: 34,
      snoozedUntil: null,
      ...overrides,
    };
  }

  it("puts four SKUs on one PO, not four", () => {
    const result = groupForPurchase({
      rows: [
        row({ sku: "OAK-BLKT-07", reorderQty: 250, moq: 40, packSize: 10, costCents: 5900 }),
        row({ sku: "OAK-APRN-05N", reorderQty: 96, moq: 60, packSize: 12, costCents: 2450 }),
        row({ sku: "OAK-APRN-05C", reorderQty: 60, moq: 60, packSize: 12, costCents: null, priceCents: 6400 }),
        row({ sku: "OAK-TOTE-01", reorderQty: 50, moq: 50, packSize: 10, costCents: 1800 }),
      ],
      suppliers: [NORTHBAY],
    });

    assert.equal(result.groups.length, 1);
    const group = result.groups[0];
    assert.equal(group.supplierId, "northbay");
    assert.equal(group.leadTimeDays, 34, "the supplier's lead time, not the row's");
    assert.equal(group.lines.length, 4);
    assert.deepEqual(
      group.lines.map((l) => l.sku),
      ["OAK-APRN-05C", "OAK-APRN-05N", "OAK-BLKT-07", "OAK-TOTE-01"],
      "lines are SKU-sorted, so the PO reads the same every time",
    );

    // 250 x 59.00 = 14,750.00 · 96 x 24.50 = 2,352.00 · 60 x 32.00 = 1,920.00
    // (no cost on file, so half of 64.00) · 50 x 18.00 = 900.00
    assert.deepEqual(
      group.lines.map((l) => [l.sku, l.qty, l.unitCostCents, l.lineTotalCents]),
      [
        ["OAK-APRN-05C", 60, 3200, 192_000],
        ["OAK-APRN-05N", 96, 2450, 235_200],
        ["OAK-BLKT-07", 250, 5900, 1_475_000],
        ["OAK-TOTE-01", 50, 1800, 90_000],
      ],
    );
    assert.equal(group.totalCents, 192_000 + 235_200 + 1_475_000 + 90_000);
    assert.equal(group.totalCents, 1_992_200);
    assert.equal(group.belowMinimum, false, "$19,922 clears the $1,200 minimum");
  });

  it("flags the estimated cost on the line whose cost is missing", () => {
    const result = groupForPurchase({
      rows: [
        row({ sku: "A", costCents: 1000 }),
        row({ sku: "B", costCents: null, priceCents: 6400 }),
      ],
      suppliers: [NORTHBAY],
    });
    const lines = result.groups[0].lines;
    assert.equal(lines.find((l) => l.sku === "A")!.costEstimated, false);
    assert.equal(lines.find((l) => l.sku === "B")!.costEstimated, true);
    assert.equal(lines.find((l) => l.sku === "B")!.unitCostCents, 3200);
  });

  it("keeps two suppliers apart, and each minimum against its own order", () => {
    const result = groupForPurchase({
      rows: [
        row({ sku: "OAK-BLKT-07", reorderQty: 10, moq: 10, packSize: 10, costCents: 5900 }),
        row({ sku: "OAK-HOOK-02", supplierId: KETTLE.id, reorderQty: 24, moq: 24, packSize: 6, costCents: 1550 }),
      ],
      suppliers: [NORTHBAY, KETTLE],
    });
    assert.equal(result.groups.length, 2);
    const northbay = result.groups.find((g) => g.supplierId === "northbay")!;
    const kettle = result.groups.find((g) => g.supplierId === "kettle")!;
    // 10 x 59.00 = 590.00, under Northbay's 1,200.00 minimum.
    assert.equal(northbay.totalCents, 59_000);
    assert.equal(northbay.belowMinimum, true);
    // 24 x 15.50 = 372.00, over Kettle's 150.00 minimum.
    assert.equal(kettle.totalCents, 37_200);
    assert.equal(kettle.belowMinimum, false);
  });

  it("rounds every line up to its own MOQ and pack size", () => {
    // The roadmap's case, inside a group: 130 needed, MOQ 100, packs of 24 -> 144.
    const result = groupForPurchase({
      rows: [row({ sku: "OAK-SACH-06", reorderQty: 130, moq: 100, packSize: 24, costCents: 890 })],
      suppliers: [NORTHBAY],
    });
    const line = result.groups[0].lines[0];
    assert.equal(line.qty, 144);
    assert.equal(line.lineTotalCents, 144 * 890);
  });

  it("groups the SKUs with no supplier together, and puts them last", () => {
    const result = groupForPurchase({
      rows: [
        row({ sku: "NO-SUPPLIER-1", supplierId: null, leadTimeDays: 14 }),
        row({ sku: "OAK-BLKT-07" }),
        row({ sku: "NO-SUPPLIER-2", supplierId: null, leadTimeDays: 14 }),
      ],
      suppliers: [NORTHBAY],
    });
    assert.equal(result.groups.length, 2);
    assert.equal(result.groups[0].supplierId, "northbay");
    const orphans = result.groups[1];
    assert.equal(orphans.supplierId, null);
    assert.equal(orphans.supplierName, UNASSIGNED_SUPPLIER_NAME);
    assert.equal(orphans.lines.length, 2);
    assert.equal(orphans.leadTimeDays, 14, "falls back to the lead time the forecast used");
    assert.equal(orphans.minOrderValueCents, 0);
    assert.equal(orphans.belowMinimum, false, "there is no minimum to be below");
    assert.equal(result.unassignedCount, 2);
  });

  it("only takes the SKUs that need ordering", () => {
    const result = groupForPurchase({
      rows: [
        row({ sku: "NOW", status: "order_now" }),
        row({ sku: "SOON", status: "order_soon" }),
        row({ sku: "HEALTHY", status: "healthy" }),
        row({ sku: "OVER", status: "overstocked" }),
        row({ sku: "DEAD", status: "dead" }),
        row({ sku: "ZERO-QTY", status: "order_now", reorderQty: 0 }),
      ],
      suppliers: [NORTHBAY],
    });
    assert.deepEqual(result.groups[0].lines.map((l) => l.sku), ["NOW", "SOON"]);
  });

  it("excludes snoozed and suppressed SKUs, and counts them so the screen can say why", () => {
    const result = groupForPurchase({
      rows: [
        row({ sku: "KEPT" }),
        row({ sku: "SNOOZED", snoozedUntil: new Date("2026-12-01T00:00:00Z") }),
        row({ sku: "ON-A-SENT-PO", variantId: "v-suppressed" }),
      ],
      suppliers: [NORTHBAY],
      suppressedVariantIds: new Set(["v-suppressed"]),
      now: new Date("2026-08-01T00:00:00Z"),
    });
    assert.deepEqual(result.groups[0].lines.map((l) => l.sku), ["KEPT"]);
    assert.equal(result.snoozedCount, 1);
    assert.equal(result.suppressedCount, 1);
  });

  it("brings a snoozed SKU back once the snooze lapses", () => {
    const result = groupForPurchase({
      rows: [row({ sku: "WAS-SNOOZED", snoozedUntil: new Date("2026-07-01T00:00:00Z") })],
      suppliers: [NORTHBAY],
      now: new Date("2026-08-01T00:00:00Z"),
    });
    assert.equal(result.groups.length, 1);
    assert.equal(result.snoozedCount, 0);
  });

  it("returns nothing when nothing needs ordering, rather than an empty PO", () => {
    const result = groupForPurchase({
      rows: [row({ sku: "HEALTHY", status: "healthy" })],
      suppliers: [NORTHBAY],
    });
    assert.deepEqual(result.groups, []);
  });

  it("still groups a SKU whose supplier row has gone missing", () => {
    // A deleted supplier must not make a needed reorder disappear.
    const result = groupForPurchase({
      rows: [row({ sku: "ORPHANED", supplierId: "deleted-supplier" })],
      suppliers: [],
    });
    assert.equal(result.groups.length, 1);
    assert.equal(result.groups[0].supplierName, UNASSIGNED_SUPPLIER_NAME);
  });
});
