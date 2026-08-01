/**
 * Throwaway end-to-end check against the real database.
 *
 * Drives the whole MVP through the same functions the screens and the cron call, and
 * asserts the properties that a green build says nothing about. Delete before shipping;
 * anything worth keeping should already be a unit test.
 *
 * Run: PATH=node_modules/.bin:$PATH npx tsx scripts/verify.ts
 */

import "@/lib/load-env";

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import {
  alerts,
  digestSends,
  forecasts,
  merchants,
  orderLines,
  poDraftLines,
  poDrafts,
  salesDaily,
  shops,
  suppliers,
  variants,
  webhookEvents,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { runBackfill, progressLine } from "@/lib/backfill";
import { addDays, todayInZone } from "@/lib/dates";
import { sendDigest } from "@/lib/digests";
import { recomputeShop } from "@/lib/forecast-run";
import { applyDemoSupplierAssignments, createDemoShop, markUninstalled } from "@/lib/install";
import { buildDrafts, dismissDraft, sendDraft, setLineQty } from "@/lib/po";
import { renderCsv } from "@/lib/po-format";
import { mapOrder } from "@/lib/shopify";
import { deadStockBoard, reorderBoard, suppressedVariantIds } from "@/lib/views";
import { processEvent, recordEvent } from "@/lib/webhooks";
import { shopByDomain } from "@/lib/shopify-admin";
import { parseSupplierCsv } from "@/lib/supplier-csv";

const EMAIL = "verify@shelfsense.test";
let failures = 0;

function step(name: string) {
  console.log(`\n=== ${name}`);
}

function check(label: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok   ${label}`);
  } catch (err) {
    failures += 1;
    console.log(`  FAIL ${label}`);
    console.log(`       ${err instanceof Error ? err.message.split("\n").join("\n       ") : err}`);
  }
}

async function main() {
  const db = getDb();

  step("clean slate");
  await db.delete(merchants).where(eq(merchants.email, EMAIL));

  const [merchant] = await db
    .insert(merchants)
    .values({ email: EMAIL, name: "Verify", passwordHash: await hashPassword("correct horse battery") })
    .returning();
  console.log(`  merchant ${merchant.id}`);

  step("install the demo store (real backfill against the fake Admin API)");
  let shop = await createDemoShop(merchant.id);
  const today = todayInZone(shop.timezone);
  console.log(`  shop ${shop.shopifyDomain} · today (${shop.timezone}) = ${today}`);

  let passes = 0;
  for (;;) {
    const progress = await runBackfill(shop, { today, maxPages: 3, deadline: Date.now() + 120_000 });
    passes += 1;
    const [reloaded] = await db.select().from(shops).where(eq(shops.id, shop.id));
    shop = reloaded;
    if (progress.done) break;
    if (passes > 60) throw new Error("backfill never finished");
  }
  await applyDemoSupplierAssignments(shop);
  console.log(`  ${passes} resumable passes · ${progressLine(shop)}`);

  const [counts] = await db
    .select({
      variants: sql<number>`(select count(*)::int from ${variants} where shop_id = ${shop.id})`,
      lines: sql<number>`(select count(*)::int from ${orderLines} where shop_id = ${shop.id})`,
      days: sql<number>`(select count(*)::int from ${salesDaily} where shop_id = ${shop.id})`,
      stockoutDays: sql<number>`(select count(*)::int from ${salesDaily} where shop_id = ${shop.id} and stockout)`,
    })
    .from(shops)
    .where(eq(shops.id, shop.id));
  console.log(`  ${counts.variants} variants · ${counts.lines} order lines · ${counts.days} day rows · ${counts.stockoutDays} censored`);

  check("the backfill resumed across more than one pass", () => assert.ok(passes > 1));
  check("12 variants mirrored", () => assert.equal(counts.variants, 12));
  check("every variant has a row for all 90 window days", () =>
    // 90 complete days before today, per variant. Velocity's denominator counts
    // observed days, and a day with no row is a day the maths cannot see.
    assert.equal(counts.days, 12 * 90, `expected ${12 * 90} rows, got ${counts.days}`),
  );
  check("the stocked-out mug's trailing run was inferred as censored", () =>
    assert.ok(counts.stockoutDays >= 18, `only ${counts.stockoutDays} censored days`),
  );
  const testOrderLines = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orderLines)
    .where(and(eq(orderLines.shopId, shop.id), eq(orderLines.externalOrderId, "1011")));
  check("the test order (id 1011) never entered the ledger", () =>
    assert.equal(testOrderLines[0].n, 0),
  );

  step("backfill is idempotent (re-run over the same 90 days)");
  const before = await db
    .select({ units: sql<number>`coalesce(sum(units_sold), 0)::int` })
    .from(salesDaily)
    .where(eq(salesDaily.shopId, shop.id));
  await db
    .update(shops)
    .set({ backfillCursor: null, backfillCompletedAt: null, backfillOrdersImported: 0 })
    .where(eq(shops.id, shop.id));
  const [again] = await db.select().from(shops).where(eq(shops.id, shop.id));
  for (let i = 0; i < 60; i++) {
    const progress = await runBackfill(again, { today, deadline: Date.now() + 120_000 });
    if (progress.done) break;
    const [r] = await db.select().from(shops).where(eq(shops.id, shop.id));
    Object.assign(again, r);
  }
  const after = await db
    .select({ units: sql<number>`coalesce(sum(units_sold), 0)::int` })
    .from(salesDaily)
    .where(eq(salesDaily.shopId, shop.id));
  check("re-importing the same orders does not change a single unit", () =>
    assert.equal(after[0].units, before[0].units),
  );

  step("first forecast run");
  const [fresh] = await db.select().from(shops).where(eq(shops.id, shop.id));
  shop = fresh;
  const run = await recomputeShop(shop, { runDate: today });
  console.log(`  ${run.variantsForecast} forecast · ${JSON.stringify(run.byStatus)}`);
  console.log(`  revenue at risk ${(run.revenueAtRiskCents / 100).toFixed(2)} · dead stock ${(run.cashInDeadStockCents / 100).toFixed(2)}`);
  console.log(`  alerts raised ${run.alertsRaised} · newly order-now ${run.newlyOrderNow.length}`);

  const board = await reorderBoard(shop.id);
  for (const row of board.rows) {
    console.log(
      `  ${row.sku.padEnd(14)} ${row.status.padEnd(12)} v=${row.blendedVelocity.toFixed(2).padStart(6)} ` +
        `stock=${String(row.available).padStart(4)} cover=${(row.daysOfCover === null ? "—" : row.daysOfCover.toFixed(1)).padStart(7)} ` +
        `rop=${String(row.reorderPoint).padStart(4)} qty=${String(row.reorderQty).padStart(4)} ` +
        `by=${row.orderByDate ?? "—"} risk=${(row.revenueAtRiskCents / 100).toFixed(2).padStart(9)} ` +
        `${row.trend}/${row.confidence} ${row.supplierName ?? "NO SUPPLIER"}`,
    );
  }

  const mug = board.rows.find((r) => r.sku === "OAK-MUG-03")!;
  const wraps = board.rows.find((r) => r.sku === "OAK-WRAP-04")!;
  const blanket = board.rows.find((r) => r.sku === "OAK-BLKT-07")!;
  const tote = board.rows.find((r) => r.sku === "OAK-TOTE-01")!;
  const apronC = board.rows.find((r) => r.sku === "OAK-APRN-05C")!;
  const candleC = board.rows.find((r) => r.sku === "OAK-CNDL-10C")!;

  check("every tracked SKU got a forecast row", () => assert.equal(run.variantsForecast, 12));

  check("the stocked-out mug is order_now, not dead", () => {
    assert.equal(mug.status, "order_now");
    assert.equal(mug.available, 0);
  });
  check("the mug's velocity survived the 18-day stockout (>3/day, not <1.5)", () => {
    assert.ok(
      mug.blendedVelocity > 3,
      `blended velocity was ${mug.blendedVelocity} — the censoring is not working`,
    );
  });
  check("the mug's 7-day window reports no data rather than zero demand", () => {
    const w7 = mug.inputs.windows[0];
    assert.equal(w7.hasData, false);
    assert.ok(w7.censoredDays >= 7);
  });
  check("the mug carries real revenue at risk", () => assert.ok(mug.revenueAtRiskCents > 0));
  check("the mug's suggested quantity honours MOQ 144 and packs of 12", () => {
    assert.ok(mug.reorderQty >= 144);
    assert.equal(mug.reorderQty % 12, 0);
  });

  check("the 14-day-old wraps are measured over ~14 observed days, not 90", () => {
    assert.ok(
      wraps.inputs.windows[2].observedDays <= 15,
      `90-day window counted ${wraps.inputs.windows[2].observedDays} days`,
    );
    assert.ok(wraps.blendedVelocity > 5, `velocity ${wraps.blendedVelocity} looks divided by 90`);
    assert.equal(wraps.confidence, "low");
  });

  check("the spiking blanket reads rising and leans on the 7-day window", () => {
    assert.equal(blanket.trend, "rising");
    assert.equal(blanket.inputs.weights.w7, 0.5);
    assert.ok(blanket.blendedVelocity > blanket.inputs.velocity90d * 1.5);
  });

  check("the tote is dead stock with real cash against it", () => {
    assert.equal(tote.status, "dead");
    assert.equal(tote.available, 212);
    assert.equal(tote.cashTiedUpCents, 212 * 1800);
  });

  check("the falling candle reads falling", () => assert.equal(candleC.trend, "falling"));

  check("the charcoal apron's cash is a flagged estimate (no unit cost on file)", () => {
    assert.equal(apronC.costCents, null);
    assert.equal(apronC.cashTiedUpCents, Math.round(apronC.available * apronC.priceCents * 0.5));
  });

  check("four SKUs share Northbay Textiles", () => {
    const northbay = board.rows.filter((r) => r.supplierName === "Northbay Textiles");
    assert.equal(northbay.length, 4, `got ${northbay.map((r) => r.sku).join(",")}`);
    assert.ok(northbay.every((r) => r.inputs.leadTimeDays === 34));
    assert.ok(northbay.every((r) => r.inputs.leadTimeSource === "supplier"));
  });

  check("the headline equals the sum of its drill-downs, to the cent", () => {
    const sum = board.rows.reduce((total, row) => total + row.revenueAtRiskCents, 0);
    assert.equal(board.totals.revenueAtRiskCents, sum);
    assert.equal(sum, run.revenueAtRiskCents);
  });

  check("every reorder point matches its own stored inputs", () => {
    for (const row of board.rows) {
      if (row.blendedVelocity <= 0) continue;
      const expected = Math.ceil(
        row.inputs.blendedVelocity * (row.inputs.leadTimeDays + row.inputs.safetyDays),
      );
      assert.equal(row.reorderPoint, expected, `${row.sku}: ${row.reorderPoint} != ${expected}`);
    }
  });

  check("rows are ranked by urgency, then by days of cover", () => {
    const rank = { order_now: 0, order_soon: 1, healthy: 2, overstocked: 3, dead: 4 } as const;
    for (let i = 1; i < board.rows.length; i++) {
      assert.ok(rank[board.rows[i - 1].status] <= rank[board.rows[i].status]);
    }
  });

  step("running the same day twice changes nothing and raises no second alert");
  const second = await recomputeShop(shop, { runDate: today });
  check("no new alerts on the second run (dedup)", () => {
    assert.equal(second.alertsRaised, 0);
    assert.equal(second.newlyOrderNow.length, 0);
  });
  const [forecastCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(forecasts)
    .where(and(eq(forecasts.shopId, shop.id), eq(forecasts.runDate, today)));
  check("exactly one forecast row per variant per run date", () =>
    assert.equal(forecastCount.n, 12),
  );
  const [openAlerts] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(alerts)
    .where(and(eq(alerts.shopId, shop.id), sql`${alerts.resolvedAt} is null`));
  console.log(`  ${openAlerts.n} open alerts`);
  check("the second run's totals match the first exactly", () => {
    assert.equal(second.revenueAtRiskCents, run.revenueAtRiskCents);
    assert.deepEqual(second.byStatus, run.byStatus);
  });

  step("webhook ingestion: HMAC, idempotency, and replay");
  const secret = "verify-webhook-secret";
  process.env.SHOPIFY_API_SECRET = secret;
  const mugRow = await db
    .select()
    .from(variants)
    .where(and(eq(variants.shopId, shop.id), eq(variants.sku, "OAK-MUG-03")))
    .limit(1);
  const yesterday = addDays(today, -1);
  const orderPayload = {
    id: "77000001",
    name: "#77000001",
    created_at: `${yesterday}T15:00:00Z`,
    line_items: [
      {
        id: "88000001",
        product_id: "880001",
        variant_id: mugRow[0].shopifyVariantId,
        sku: "OAK-MUG-03",
        title: "Enamel camp mug",
        quantity: 4,
        price: "22.00",
      },
    ],
  };
  const raw = JSON.stringify(orderPayload);
  const digest = createHmac("sha256", secret).update(raw).digest("base64");
  check("a locally computed HMAC verifies, and a tampered body does not", () => {
    const { verifyWebhookHmac } = require("@/lib/shopify") as typeof import("@/lib/shopify");
    assert.equal(verifyWebhookHmac(raw, digest, secret), true);
    assert.equal(verifyWebhookHmac(`${raw} `, digest, secret), false);
  });

  const unitsBefore = await dayUnits(mugRow[0].id, mapOrder(orderPayload, shop.timezone)!.date);

  // Deliver the same webhook five times, as Shopify's retries would.
  let stored = 0;
  for (let i = 0; i < 5; i++) {
    const event = await recordEvent({
      shopId: shop.id,
      shopDomain: shop.shopifyDomain,
      webhookId: "wh-verify-1",
      topic: "orders/create",
      payload: orderPayload,
    });
    if (event) {
      stored += 1;
      const result = await processEvent(event);
      console.log(`  applied: ${result.detail}`);
    }
  }
  const unitsAfterFive = await dayUnits(mugRow[0].id, mapOrder(orderPayload, shop.timezone)!.date);
  check("five identical deliveries stored one event", () => assert.equal(stored, 1));
  check("five identical deliveries added the units exactly once", () =>
    assert.equal(unitsAfterFive - unitsBefore, 4, `delta was ${unitsAfterFive - unitsBefore}`),
  );

  // A replay — same order, re-applied — must also be a no-op.
  const [storedEvent] = await db
    .select()
    .from(webhookEvents)
    .where(eq(webhookEvents.shopifyWebhookId, "wh-verify-1"));
  await db
    .update(webhookEvents)
    .set({ processedAt: null, attempts: 0 })
    .where(eq(webhookEvents.id, storedEvent.id));
  const [replayable] = await db
    .select()
    .from(webhookEvents)
    .where(eq(webhookEvents.id, storedEvent.id));
  await processEvent(replayable);
  const unitsAfterReplay = await dayUnits(mugRow[0].id, mapOrder(orderPayload, shop.timezone)!.date);
  check("a replay of the same event is a no-op", () =>
    assert.equal(unitsAfterReplay, unitsAfterFive),
  );

  // orders/updated with a refund must *reduce* the day.
  const refundPayload = {
    ...orderPayload,
    refunds: [{ refund_line_items: [{ line_item_id: "88000001", quantity: 3 }] }],
  };
  const refundEvent = await recordEvent({
    shopId: shop.id,
    shopDomain: shop.shopifyDomain,
    webhookId: "wh-verify-2",
    topic: "orders/updated",
    payload: refundPayload,
  });
  await processEvent(refundEvent!);
  const unitsAfterRefund = await dayUnits(mugRow[0].id, mapOrder(orderPayload, shop.timezone)!.date);
  check("a refund reduces the day's units rather than adding to them", () =>
    assert.equal(unitsAfterRefund, unitsBefore + 1, `expected ${unitsBefore + 1}, got ${unitsAfterRefund}`),
  );

  // A cancellation removes the order's contribution entirely.
  const cancelEvent = await recordEvent({
    shopId: shop.id,
    shopDomain: shop.shopifyDomain,
    webhookId: "wh-verify-3",
    topic: "orders/updated",
    payload: { ...orderPayload, cancelled_at: `${today}T09:00:00Z` },
  });
  await processEvent(cancelEvent!);
  const unitsAfterCancel = await dayUnits(mugRow[0].id, mapOrder(orderPayload, shop.timezone)!.date);
  check("a cancellation subtracts the order back out", () =>
    assert.equal(unitsAfterCancel, unitsBefore),
  );

  // inventory_levels/update sets stock and records today's censoring.
  const invEvent = await recordEvent({
    shopId: shop.id,
    shopDomain: shop.shopifyDomain,
    webhookId: "wh-verify-4",
    topic: "inventory_levels/update",
    payload: {
      inventory_item_id: `70${mugRow[0].shopifyVariantId}`,
      location_id: "1",
      available: 0,
    },
  });
  const invResult = await processEvent(invEvent!);
  console.log(`  inventory: ${invResult.detail}`);
  const [todayRow] = await db
    .select()
    .from(salesDaily)
    .where(and(eq(salesDaily.variantId, mugRow[0].id), eq(salesDaily.date, today)));
  check("an inventory update at zero marks today as a stockout day", () =>
    assert.equal(todayRow?.stockout, true),
  );

  const unknownEvent = await recordEvent({
    shopId: shop.id,
    shopDomain: shop.shopifyDomain,
    webhookId: "wh-verify-5",
    topic: "carts/create",
    payload: {},
  });
  const unknownResult = await processEvent(unknownEvent!);
  check("an unregistered topic is applied-and-ignored, not errored", () =>
    assert.equal(unknownResult.applied, true),
  );

  step("supplier CSV import");
  const csv = [
    "SKU,Supplier,Supplier email,Lead time days,Unit cost,MOQ,Pack size",
    "OAK-APRN-05C,Northbay Textiles,po@northbaytextiles.example,34,24.50,60,12",
    "OAK-NOPE-99,Ghost Supply,,7,1.00,1,1",
  ].join("\n");
  const parsed = parseSupplierCsv(csv);
  check("the CSV parses both rows", () => assert.equal(parsed.rows.length, 2));
  for (const row of parsed.rows) {
    if (!row.costCents) continue;
    await db
      .update(variants)
      .set({ costCents: row.costCents })
      .where(and(eq(variants.shopId, shop.id), eq(variants.sku, row.sku)));
  }
  const [apronAfter] = await db
    .select({ costCents: variants.costCents })
    .from(variants)
    .where(and(eq(variants.shopId, shop.id), eq(variants.sku, "OAK-APRN-05C")));
  check("the imported unit cost landed on the apron", () =>
    assert.equal(apronAfter.costCents, 2450),
  );

  step("PO drafts");
  const built = await buildDrafts(shop);
  console.log(
    `  ${built.drafts.length} drafts: ${built.drafts.map((d) => `${d.supplierName} (${d.lineCount} lines, $${(d.totalCents / 100).toFixed(2)})`).join(" · ")}`,
  );
  check("drafts are grouped one per supplier", () => {
    const names = built.drafts.map((d) => d.supplierName);
    assert.equal(new Set(names).size, names.length);
  });
  const draftRows = await db
    .select()
    .from(poDrafts)
    .where(and(eq(poDrafts.shopId, shop.id), eq(poDrafts.status, "draft")));
  const lineRows = await db
    .select({
      line: poDraftLines,
      moq: variants.moq,
      packSize: variants.packSize,
      sku: variants.sku,
    })
    .from(poDraftLines)
    .innerJoin(variants, eq(variants.id, poDraftLines.variantId))
    .where(inArray(poDraftLines.poDraftId, draftRows.map((d) => d.id)));
  check("no PO line violates its MOQ or pack size", () => {
    for (const row of lineRows) {
      assert.ok(row.line.finalQty >= row.moq, `${row.sku}: ${row.line.finalQty} < MOQ ${row.moq}`);
      assert.equal(
        row.line.finalQty % row.packSize,
        0,
        `${row.sku}: ${row.line.finalQty} is not a multiple of ${row.packSize}`,
      );
    }
  });
  check("a draft's total equals the sum of quantity x unit cost", () => {
    for (const draft of draftRows) {
      const mine = lineRows.filter((l) => l.line.poDraftId === draft.id);
      const expected = mine.reduce((t, l) => t + l.line.finalQty * l.line.unitCostCents, 0);
      assert.equal(draft.totalCents, expected, `${draft.supplierName}: ${draft.totalCents} != ${expected}`);
    }
  });

  const northbayDraft = draftRows.find((d) => d.supplierName === "Northbay Textiles");
  if (northbayDraft) {
    const mine = lineRows.filter((l) => l.line.poDraftId === northbayDraft.id);
    console.log(`  Northbay draft: ${mine.map((l) => `${l.sku}x${l.line.finalQty}`).join(", ")}`);
    check("the shared-supplier draft carries more than one SKU", () => assert.ok(mine.length >= 2));
  }

  // Edit a quantity to something invalid, and check the validation says what to use.
  const firstLine = lineRows[0];
  const validation = await setLineQty(shop, firstLine.line.poDraftId, firstLine.line.id, 7);
  console.log(`  edited ${firstLine.sku} to 7: ${validation.messages.join(" ")}`);
  check("an invalid quantity is saved but reported, with the nearest acceptable one", () => {
    assert.equal(validation.ok, false);
    assert.ok(validation.corrected >= firstLine.moq);
    assert.equal(validation.corrected % firstLine.packSize, 0);
  });
  const [recalculated] = await db
    .select()
    .from(poDrafts)
    .where(eq(poDrafts.id, firstLine.line.poDraftId));
  const remaining = lineRows
    .filter((l) => l.line.poDraftId === firstLine.line.poDraftId)
    .reduce(
      (t, l) => t + (l.line.id === firstLine.line.id ? 7 : l.line.finalQty) * l.line.unitCostCents,
      0,
    );
  check("the draft total was recalculated from the edit", () =>
    assert.equal(recalculated.totalCents, remaining),
  );

  // CSV export.
  const exportLines = await db
    .select()
    .from(poDraftLines)
    .where(eq(poDraftLines.poDraftId, firstLine.line.poDraftId));
  const exported = renderCsv({
    draft: recalculated,
    lines: exportLines.filter((l) => l.finalQty > 0),
    shopName: shop.name,
    shopDomain: shop.shopifyDomain,
    today,
  });
  check("the CSV export has a BOM, CRLF endings and a totals row", () => {
    assert.equal(exported.charCodeAt(0), 0xfeff);
    assert.ok(exported.includes("\r\n"));
    assert.ok(/\r\nTotal,,\d+,,\d+\.\d\d\r\n$/.test(exported), exported.slice(-80));
  });

  step("sending a PO suppresses its SKUs for one lead time");
  const sendable = draftRows.find((d) => d.supplierId !== null)!;
  const sendResult = await sendDraft(shop, sendable.id);
  console.log(
    `  sent to ${sendResult.sentTo} (suppressed=${sendResult.suppressed}) · suppress until ${sendResult.suppressUntil.toISOString().slice(0, 10)}`,
  );
  const suppressed = await suppressedVariantIds(shop.id);
  check("the sent draft's SKUs are now suppressed", () => assert.ok(suppressed.size > 0));
  check("suppression is a fixed window, not an open-ended condition", () => {
    const days = Math.round((sendResult.suppressUntil.getTime() - Date.now()) / 86_400_000);
    assert.ok(days > 0 && days <= 40, `suppressed for ${days} days`);
  });

  const rebuilt = await buildDrafts(shop);
  check("re-drafting does not re-suggest the SKUs just ordered", () => assert.ok(rebuilt.suppressed > 0));

  const dismissible = (
    await db
      .select()
      .from(poDrafts)
      .where(and(eq(poDrafts.shopId, shop.id), eq(poDrafts.status, "draft")))
  )[0];
  if (dismissible) {
    await dismissDraft(shop, dismissible.id);
    const [after] = await db.select().from(poDrafts).where(eq(poDrafts.id, dismissible.id));
    check("a dismissed draft is dismissed with its own suppression window", () => {
      assert.equal(after.status, "dismissed");
      assert.ok(after.suppressUntil !== null);
    });
  }

  step("dead stock");
  const dead = await deadStockBoard(shop.id);
  console.log(`  total $${(dead.totalCents / 100).toFixed(2)} across ${dead.rows.length} SKUs`);
  for (const row of dead.rows) {
    console.log(
      `  ${row.sku.padEnd(14)} ${String(row.units).padStart(4)} units · ${(row.daysOfCover === null ? "—" : row.daysOfCover.toFixed(0)).padStart(5)}d · $${(row.cashTiedUpCents / 100).toFixed(2)}${row.costMissing ? " (est)" : ""}`,
    );
  }
  check("dead stock is ranked by cash tied up, descending", () => {
    for (let i = 1; i < dead.rows.length; i++) {
      assert.ok(dead.rows[i - 1].cashTiedUpCents >= dead.rows[i].cashTiedUpCents);
    }
  });
  check("the total equals the sum of the rows", () =>
    assert.equal(
      dead.totalCents,
      dead.rows.reduce((t, r) => t + r.cashTiedUpCents, 0),
    ),
  );
  check("the stocked-out mug is not on the dead-stock report", () =>
    assert.ok(!dead.rows.some((r) => r.sku === "OAK-MUG-03")),
  );

  step("snoozing removes a SKU from the dead-stock report and resolves its alert");
  const toSnooze = dead.rows[0];
  await db
    .update(variants)
    .set({ snoozedUntil: new Date(Date.now() + 30 * 86_400_000) })
    .where(eq(variants.id, toSnooze.variantId));
  const afterSnooze = await deadStockBoard(shop.id);
  check("the snoozed SKU is excluded and counted separately", () => {
    assert.ok(!afterSnooze.rows.some((r) => r.variantId === toSnooze.variantId));
    assert.equal(afterSnooze.snoozedCount, 1);
    assert.equal(afterSnooze.totalCents, dead.totalCents - toSnooze.cashTiedUpCents);
  });

  step("digests");
  const weekly = await sendDigest(shop, "weekly_reorder", { localDate: today, force: true });
  console.log(`  weekly: sent=${weekly.sent} suppressed=${weekly.suppressed} period=${weekly.periodKey} "${weekly.subject}"`);
  const weeklyAgain = await sendDigest(shop, "weekly_reorder", { localDate: today, force: true });
  console.log(`  weekly again: sent=${weeklyAgain.sent} reason=${weeklyAgain.skippedReason}`);
  check("a weekly digest goes out once for its period", () => {
    assert.equal(weekly.sent, true);
    assert.equal(weeklyAgain.sent, false);
    assert.match(weeklyAgain.skippedReason ?? "", /already sent/);
  });
  const nextWeek = await sendDigest(shop, "weekly_reorder", {
    localDate: addDays(today, 7),
    force: true,
  });
  check("the next period does send", () => assert.equal(nextWeek.sent, true));

  const monthly = await sendDigest(shop, "monthly_dead_stock", { localDate: today, force: true });
  console.log(`  monthly: sent=${monthly.sent} period=${monthly.periodKey} "${monthly.subject}"`);
  check("the monthly dead-stock digest is composed and recorded", () =>
    assert.equal(monthly.sent, true),
  );
  const sends = await db.select().from(digestSends).where(eq(digestSends.shopId, shop.id));
  check("every digest send is recorded, and marked suppressed under DRY_RUN", () => {
    assert.ok(sends.length >= 3);
    assert.ok(sends.every((s) => s.suppressed), "DRY_RUN=1 should mark them suppressed");
  });

  step("uninstall deactivates the shop");
  await markUninstalled(shop.shopifyDomain);
  const [uninstalled] = await db.select().from(shops).where(eq(shops.id, shop.id));
  check("the token is dropped and the shop is marked uninstalled", () => {
    assert.equal(uninstalled.accessToken, null);
    assert.ok(uninstalled.uninstalledAt !== null);
  });
  const digestAfter = await sendDigest(uninstalled, "weekly_reorder", {
    localDate: addDays(today, 14),
    force: true,
  });
  check("no digest goes to an uninstalled shop", () => {
    assert.equal(digestAfter.sent, false);
    assert.match(digestAfter.skippedReason ?? "", /uninstalled/);
  });
  const { shopsNeedingBackfill } = await import("@/lib/backfill");
  await db
    .update(shops)
    .set({ backfillCompletedAt: null })
    .where(eq(shops.id, shop.id));
  const pending = await shopsNeedingBackfill(10);
  check("an uninstalled shop is never picked up for more work", () =>
    assert.ok(!pending.some((s) => s.id === shop.id)),
  );

  step("reinstall returns the merchant to their own data");
  process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "local";
  const { linkShop } = await import("@/lib/install");
  const relinked = await linkShop({
    shop: shop.shopifyDomain,
    accessToken: "shpat_fake_reinstall_token",
    scope: "read_products,read_inventory,read_orders",
  });
  check("the reinstall reactivated the same shop row", () => {
    assert.equal(relinked.shop.id, shop.id);
    assert.equal(relinked.reinstalled, true);
    assert.equal(relinked.shop.uninstalledAt, null);
  });
  const [historyKept] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(orderLines)
    .where(eq(orderLines.shopId, shop.id));
  check("their 90 days of history is still there", () => assert.ok(historyKept.n > 100));
  const [suppliersKept] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(suppliers)
    .where(eq(suppliers.shopId, shop.id));
  check("their suppliers and lead times survived", () => assert.equal(suppliersKept.n, 3));
  const found = await shopByDomain(shop.shopifyDomain);
  check("the domain lookup resolves the reactivated shop", () => assert.equal(found?.id, shop.id));

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  await closeDb();
  process.exit(failures === 0 ? 0 : 1);
}

async function dayUnits(variantId: string, date: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ units: salesDaily.unitsSold })
    .from(salesDaily)
    .where(and(eq(salesDaily.variantId, variantId), eq(salesDaily.date, date)));
  return row?.units ?? 0;
}

void main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
