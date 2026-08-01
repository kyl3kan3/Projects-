/**
 * Ingestion: catalogue mirrors, the order-line ledger, and the `sales_daily`
 * rollup that velocity reads.
 *
 * The invariant everything here protects: **`sales_daily` is derived, never
 * accumulated.** Every write goes into `order_lines` first and the affected
 * (variant, day) pairs are then recomputed from that ledger. That is what makes
 * replaying a webhook five times a no-op, makes `orders/updated` able to *reduce*
 * a day's units after a refund, and makes a cancellation subtract cleanly.
 *
 * The one column the rollup must never touch is `stockout`. That flag records
 * whether the variant had anything to sell that day, it comes from inventory, and
 * losing it converts a censored day into an observed zero — the exact mistake this
 * whole app exists to avoid.
 */

import { and, eq, gte, inArray, lte, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  inventoryLevels,
  orderLines,
  products,
  salesDaily,
  shops,
  variants,
  type Shop,
  type Variant,
} from "@/db/schema";
import { addDays } from "@/lib/dates";
import type { AdminProduct } from "@/lib/shopify-admin";
import type { MappedOrder } from "@/lib/shopify";

/**
 * A parameterised `in (...)` list of uuids for a raw `sql` fragment.
 *
 * Not `= any(${ids}::uuid[])`: a JS array handed to a Drizzle `sql` template is sent
 * as a record, and Postgres refuses to cast a record to `uuid[]` — the query throws at
 * runtime while type-checking perfectly. And not string interpolation either, which
 * would be an injection one refactor away. `sql.join` emits one bind parameter per id.
 */
function uuidList(ids: string[]) {
  return sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
}

/* ------------------------------------------------------- catalogue mirror --- */

export interface UpsertCatalogueResult {
  productsSeen: number;
  variantsSeen: number;
  /** shopifyVariantId -> our variant row id. */
  variantIds: Map<string, string>;
}

/**
 * Mirror a page of Admin-API products into `products` + `variants`.
 *
 * Merchant-owned columns (`supplier_id`, `moq`, `pack_size`) are set on insert and
 * left alone on update: a nightly product sync must not wipe the lead-time and MOQ
 * work the merchant did by hand. Cost is the exception — Shopify's `unitCost` is
 * authoritative when present, and ignored when it is not, so a merchant-entered
 * cost survives a shop that does not fill it in.
 */
export async function upsertCatalogue(
  shop: Shop,
  page: AdminProduct[],
): Promise<UpsertCatalogueResult> {
  const db = getDb();
  const variantIds = new Map<string, string>();
  let variantsSeen = 0;

  for (const product of page) {
    const [productRow] = await db
      .insert(products)
      .values({
        shopId: shop.id,
        shopifyProductId: product.shopifyProductId,
        title: product.title,
        status: product.status,
        vendor: product.vendor,
        imageUrl: product.imageUrl,
      })
      .onConflictDoUpdate({
        target: [products.shopId, products.shopifyProductId],
        set: {
          title: product.title,
          status: product.status,
          vendor: product.vendor,
          imageUrl: product.imageUrl,
        },
      })
      .returning();

    for (const variant of product.variants) {
      const [variantRow] = await db
        .insert(variants)
        .values({
          shopId: shop.id,
          productId: productRow.id,
          shopifyVariantId: variant.shopifyVariantId,
          sku: variant.sku,
          title: variant.title,
          priceCents: variant.priceCents,
          costCents: variant.costCents,
          inventoryQuantity: variant.inventoryQuantity,
          tracked: variant.tracked,
        })
        .onConflictDoUpdate({
          target: [variants.shopId, variants.shopifyVariantId],
          set: {
            productId: productRow.id,
            sku: variant.sku,
            title: variant.title,
            priceCents: variant.priceCents,
            inventoryQuantity: variant.inventoryQuantity,
            tracked: variant.tracked,
            // Only overwrite cost when Shopify actually has one. The cast is not
            // decoration: an untyped null parameter inside coalesce makes
            // Postgres refuse the statement outright.
            costCents: sql`coalesce(${variant.costCents ?? null}::int, ${variants.costCents})`,
          },
        })
        .returning();
      variantIds.set(variant.shopifyVariantId, variantRow.id);
      variantsSeen += 1;

      if (variant.inventoryItemId) {
        await db
          .insert(inventoryLevels)
          .values({
            shopId: shop.id,
            variantId: variantRow.id,
            shopifyLocationId: variant.inventoryItemId,
            available: variant.inventoryQuantity,
          })
          .onConflictDoUpdate({
            target: [inventoryLevels.variantId, inventoryLevels.shopifyLocationId],
            set: { available: variant.inventoryQuantity, syncedAt: new Date() },
          });
      }
    }
  }

  return { productsSeen: page.length, variantsSeen, variantIds };
}

/** Refresh the shop's tracked-SKU count, which is what billing meters. */
export async function refreshSkuCount(shopId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(variants)
    .where(and(eq(variants.shopId, shopId), eq(variants.tracked, true)));
  const skuCount = row?.n ?? 0;
  await db.update(shops).set({ skuCount, updatedAt: new Date() }).where(eq(shops.id, shopId));
  return skuCount;
}

/* ------------------------------------------------------- the order ledger --- */

export interface ApplyOrderResult {
  linesWritten: number;
  linesRemoved: number;
  daysTouched: number;
  skippedUnknownVariants: number;
}

/**
 * Record an order's current state and roll up the days it touches.
 *
 * A cancelled order writes zero lines, which — because the rollup recomputes from
 * the ledger — subtracts its units back out rather than leaving them counted
 * forever.
 */
export async function applyOrder(
  shop: Shop,
  order: MappedOrder,
  variantIds?: Map<string, string>,
): Promise<ApplyOrderResult> {
  const db = getDb();

  // A test order is not demand and must never enter the history.
  const effectiveLines = order.test || order.cancelled ? [] : order.lines;

  const resolved = new Map<string, string>();
  let skippedUnknownVariants = 0;
  for (const line of effectiveLines) {
    const known = variantIds?.get(line.shopifyVariantId);
    if (known) {
      resolved.set(line.shopifyVariantId, known);
      continue;
    }
    const [row] = await db
      .select({ id: variants.id })
      .from(variants)
      .where(
        and(
          eq(variants.shopId, shop.id),
          eq(variants.shopifyVariantId, line.shopifyVariantId),
        ),
      )
      .limit(1);
    if (row) {
      resolved.set(line.shopifyVariantId, row.id);
      variantIds?.set(line.shopifyVariantId, row.id);
    } else {
      // An order for a variant we have not mirrored yet: skipped rather than
      // invented. The next catalogue sync picks it up, and a replay of this
      // webhook then lands it — which is why replay has to be safe.
      skippedUnknownVariants += 1;
    }
  }

  const touched = new Set<string>();
  let linesWritten = 0;

  // One multi-row upsert rather than a statement per line. A 90-day backfill of a
  // busy store is tens of thousands of lines, and a round trip each is the
  // difference between a backfill that finishes inside a function's budget and one
  // that never does.
  const values = effectiveLines
    .map((line) => {
      const variantId = resolved.get(line.shopifyVariantId);
      return variantId
        ? {
            shopId: shop.id,
            variantId,
            externalOrderId: order.externalId,
            date: order.date,
            units: line.units,
            revenueCents: line.revenueCents,
          }
        : null;
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  if (values.length) {
    await db
      .insert(orderLines)
      .values(values)
      .onConflictDoUpdate({
        target: [orderLines.shopId, orderLines.externalOrderId, orderLines.variantId],
        set: {
          date: sql`excluded.date`,
          units: sql`excluded.units`,
          revenueCents: sql`excluded.revenue_cents`,
          updatedAt: new Date(),
        },
      });
    linesWritten = values.length;
    for (const value of values) touched.add(`${value.variantId}|${value.date}`);
  }

  // Lines that used to be on this order and are not any more (refunded to zero,
  // removed, or the whole order cancelled) have to go, and their days recomputed.
  const keptVariantIds = [...resolved.values()];
  const stale = await db
    .select({ variantId: orderLines.variantId, date: orderLines.date })
    .from(orderLines)
    .where(
      and(
        eq(orderLines.shopId, shop.id),
        eq(orderLines.externalOrderId, order.externalId),
        // notInArray, not a hand-built SQL list: the ids are ours, but a raw
        // fragment here is one refactor away from being an injection.
        keptVariantIds.length ? notInArray(orderLines.variantId, keptVariantIds) : undefined,
      ),
    );

  let linesRemoved = 0;
  if (stale.length) {
    await db
      .delete(orderLines)
      .where(
        and(
          eq(orderLines.shopId, shop.id),
          eq(orderLines.externalOrderId, order.externalId),
          inArray(
            orderLines.variantId,
            stale.map((s) => s.variantId),
          ),
        ),
      );
    linesRemoved = stale.length;
    for (const row of stale) touched.add(`${row.variantId}|${row.date}`);
  }

  // Grouped by day, because all the lines of one order share a date: the common
  // case is a single rollup statement for the whole order.
  const byDate = new Map<string, string[]>();
  for (const key of touched) {
    const [variantId, date] = key.split("|");
    const list = byDate.get(date) ?? [];
    list.push(variantId);
    byDate.set(date, list);
  }
  for (const [date, variantIdsForDay] of byDate) {
    await rollupDay(shop.id, variantIdsForDay, date);
  }
  await refreshFirstSale([...resolved.values(), ...stale.map((s) => s.variantId)]);

  return { linesWritten, linesRemoved, daysTouched: touched.size, skippedUnknownVariants };
}

/**
 * Recompute `sales_daily` for a set of variants on one day, from the ledger.
 *
 * `stockout` is deliberately absent from the update set: the rollup owns units and
 * revenue, inventory owns the censoring flag, and neither may clobber the other.
 * Losing that flag turns a censored day into an observed zero — the exact mistake
 * this whole app exists to avoid.
 *
 * A variant whose lines all disappeared has no ledger rows left and so no row in
 * the aggregate below, which is why the day is zeroed first and then re-summed.
 */
export async function rollupDay(
  shopId: string,
  variantIds: string[],
  date: string,
): Promise<void> {
  if (!variantIds.length) return;
  const db = getDb();
  const unique = [...new Set(variantIds)];

  await db
    .update(salesDaily)
    .set({ unitsSold: 0, revenueCents: 0 })
    .where(and(inArray(salesDaily.variantId, unique), eq(salesDaily.date, date)));

  await db.execute(sql`
    insert into ${salesDaily} (shop_id, variant_id, date, units_sold, revenue_cents, stockout)
    select ${shopId}::uuid, ol.variant_id, ol.date,
           coalesce(sum(ol.units), 0)::int, coalesce(sum(ol.revenue_cents), 0)::int, false
    from ${orderLines} ol
    where ol.variant_id in (${uuidList(unique)}) and ol.date = ${date}::date
    group by ol.variant_id, ol.date
    on conflict (variant_id, date) do update
      set units_sold = excluded.units_sold, revenue_cents = excluded.revenue_cents
  `);
}

/** Keep `variants.first_sale_on` at the earliest day each variant sold anything. */
export async function refreshFirstSale(variantIds: string[]): Promise<void> {
  if (!variantIds.length) return;
  const db = getDb();
  const unique = [...new Set(variantIds)];
  await db.execute(sql`
    update ${variants} v
    set first_sale_on = (
      select min(ol.date) from ${orderLines} ol
      where ol.variant_id = v.id and ol.units > 0
    )
    where v.id in (${uuidList(unique)})
  `);
}

/* ---------------------------------------------------------------- stockout --- */

/**
 * Mark the days a variant had nothing to sell.
 *
 * Shopify's Admin API exposes *current* inventory, not inventory history, so for
 * days already in the past the flag has to be inferred, and the inference is
 * deliberately narrow: if the variant is empty **now**, then the unbroken run of
 * zero-sales days immediately before now is when it was empty. A shelf does not
 * refill itself, so a run of zero-sales days ending at an empty shelf is a
 * stockout; anything earlier than that run is not claimed either way.
 *
 * Going forward the flag does not need inferring at all — `inventory_levels/update`
 * and the nightly run record it directly (see `markStockoutDay`).
 *
 * The assumption is stated in the UI next to any velocity it affects, because a
 * merchant is entitled to know which of these numbers is measured and which is
 * reconstructed.
 */
export async function inferTrailingStockout(
  shopId: string,
  variant: Pick<Variant, "id" | "inventoryQuantity">,
  asOf: string,
  windowDays = 90,
): Promise<number> {
  const db = getDb();
  if (variant.inventoryQuantity > 0) return 0;

  const from = addDays(asOf, -windowDays);
  const rows = await db
    .select({ date: salesDaily.date, unitsSold: salesDaily.unitsSold })
    .from(salesDaily)
    .where(
      and(
        eq(salesDaily.variantId, variant.id),
        gte(salesDaily.date, from),
        lte(salesDaily.date, asOf),
      ),
    )
    .orderBy(sql`${salesDaily.date} desc`);

  const run: string[] = [];
  for (const row of rows) {
    if (row.unitsSold > 0) break;
    run.push(row.date);
  }
  if (!run.length) return 0;

  await db
    .update(salesDaily)
    .set({ stockout: true })
    .where(and(eq(salesDaily.variantId, variant.id), inArray(salesDaily.date, run)));
  return run.length;
}

/**
 * Record that a variant had (or did not have) stock on a given day.
 *
 * Called from the inventory webhook and from the nightly run for the day it runs
 * on. Creates the day row if it does not exist, because a stockout day usually has
 * no sales and therefore no row from the rollup.
 */
export async function markStockoutDay(
  shopId: string,
  variantId: string,
  date: string,
  stockout: boolean,
): Promise<void> {
  const db = getDb();
  await db
    .insert(salesDaily)
    .values({ shopId, variantId, date, unitsSold: 0, revenueCents: 0, stockout })
    .onConflictDoUpdate({
      target: [salesDaily.variantId, salesDaily.date],
      set: { stockout },
    });
}

/**
 * Ensure every day in the window has a row for a variant.
 *
 * Velocity's denominator counts observed days, and a day with no row is a day the
 * maths cannot see. Without this a variant that sold on 12 of 90 days would be
 * measured over 12 days, and its velocity would be its *sales-day* average — a
 * number four times too high.
 */
export async function fillMissingDays(
  shopId: string,
  variantId: string,
  from: string,
  to: string,
): Promise<number> {
  const db = getDb();
  const result = await db.execute(sql`
    insert into ${salesDaily} (shop_id, variant_id, date, units_sold, revenue_cents, stockout)
    select ${shopId}::uuid, ${variantId}::uuid, d::date, 0, 0, false
    from generate_series(${from}::date, ${to}::date, interval '1 day') as d
    on conflict (variant_id, date) do nothing
  `);
  return (result as unknown as { count?: number }).count ?? 0;
}
