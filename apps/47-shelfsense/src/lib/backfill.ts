/**
 * The 90-day backfill: catalogue mirror, then order history, then the first
 * forecast.
 *
 * Written as a *resumable, bounded* pass rather than a long-running job, because
 * the deployment target has no always-on process (root DEPLOYING.md): every call
 * does as much as its time budget allows, checkpoints the cursor on the shop row,
 * and returns. The cron tick calls it again, and again, until it reports done. The
 * same function is what the local tick runner loops over.
 *
 * The checkpoint is on the shop row rather than in a job payload for one reason:
 * it survives everything. A crashed function, a redeploy, a merchant closing the
 * tab mid-install — the next tick resumes from the last page that actually landed,
 * and because ingestion is idempotent, re-doing the last page costs nothing.
 */

import { and, eq, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { shops, variants, type Shop } from "@/db/schema";
import { addDays, todayInZone } from "@/lib/dates";
import {
  fillMissingDays,
  inferTrailingStockout,
  refreshSkuCount,
  upsertCatalogue,
  applyOrder,
} from "@/lib/ingest";
import { mapOrder } from "@/lib/shopify";
import { adminFor, type ShopifyAdmin } from "@/lib/shopify-admin";
import { DEMO_WINDOW_DAYS } from "@/lib/demo-data";

/** Marks the catalogue phase in the single cursor column. */
const CATALOGUE_PREFIX = "products:";

export interface BackfillProgress {
  shopId: string;
  phase: "catalogue" | "orders" | "done";
  ordersImported: number;
  ordersEstimated: number | null;
  variantsSeen: number;
  done: boolean;
  /** True when the budget ran out mid-pass and another tick is needed. */
  deferred: boolean;
}

export interface BackfillOptions {
  /** Stop starting new pages after this instant. */
  deadline?: number;
  /** Overrides "today" — the tests pin it so fixtures do not drift. */
  today?: string;
  /** Hard cap on pages per call, independent of the clock. */
  maxPages?: number;
}

/**
 * Run one bounded slice of a shop's backfill.
 *
 * Phase order matters: the catalogue has to land before orders, because an order
 * line for a variant we have never seen is skipped (see `applyOrder`) rather than
 * inventing a SKU out of a line item.
 */
export async function runBackfill(
  shop: Shop,
  options: BackfillOptions = {},
): Promise<BackfillProgress> {
  const db = getDb();
  const deadline = options.deadline ?? Date.now() + 60_000;
  const maxPages = options.maxPages ?? 500;
  const today = options.today ?? todayInZone(shop.timezone);
  const since = addDays(today, -DEMO_WINDOW_DAYS);
  const admin = adminFor(shop, today);

  let cursor = shop.backfillCursor;
  let ordersImported = shop.backfillOrdersImported;
  let ordersEstimated = shop.backfillOrdersEstimated;
  let variantsSeen = 0;
  let pages = 0;

  if (!shop.backfillStartedAt) {
    await db
      .update(shops)
      .set({ backfillStartedAt: new Date(), updatedAt: new Date() })
      .where(eq(shops.id, shop.id));
  }

  /* --- phase 1: catalogue --- */
  let phase: BackfillProgress["phase"] =
    cursor === null || cursor.startsWith(CATALOGUE_PREFIX) ? "catalogue" : "orders";

  if (phase === "catalogue") {
    let productCursor = cursor?.slice(CATALOGUE_PREFIX.length) || null;
    if (productCursor === "") productCursor = null;
    for (;;) {
      const page = await admin.listProducts(productCursor);
      const result = await upsertCatalogue(shop, page.products);
      variantsSeen += result.variantsSeen;
      pages += 1;
      productCursor = page.nextCursor;
      await db
        .update(shops)
        .set({
          backfillCursor: productCursor ? `${CATALOGUE_PREFIX}${productCursor}` : "",
          updatedAt: new Date(),
        })
        .where(eq(shops.id, shop.id));
      if (!productCursor) {
        cursor = "";
        phase = "orders";
        break;
      }
      if (Date.now() > deadline || pages >= maxPages) {
        return {
          shopId: shop.id,
          phase: "catalogue",
          ordersImported,
          ordersEstimated,
          variantsSeen,
          done: false,
          deferred: true,
        };
      }
    }
    await refreshSkuCount(shop.id);
  }

  /* --- phase 2: orders --- */
  const variantIds = await loadVariantIdMap(shop.id);
  let orderCursor = cursor === "" ? null : cursor;

  for (;;) {
    const page = await admin.listOrders(since, orderCursor);
    if (page.estimatedTotal !== null) ordersEstimated = page.estimatedTotal;

    for (const payload of page.orders) {
      const mapped = mapOrder(payload, shop.timezone);
      if (!mapped) continue;
      await applyOrder(shop, mapped, variantIds);
      ordersImported += 1;
    }
    pages += 1;
    orderCursor = page.nextCursor;

    await db
      .update(shops)
      .set({
        backfillCursor: orderCursor,
        backfillOrdersImported: ordersImported,
        backfillOrdersEstimated: ordersEstimated,
        updatedAt: new Date(),
      })
      .where(eq(shops.id, shop.id));

    if (!orderCursor) break;
    if (Date.now() > deadline || pages >= maxPages) {
      return {
        shopId: shop.id,
        phase: "orders",
        ordersImported,
        ordersEstimated,
        variantsSeen,
        done: false,
        deferred: true,
      };
    }
  }

  /* --- phase 3: fill the calendar and infer stockout runs --- */
  const rows = await db
    .select({
      id: variants.id,
      inventoryQuantity: variants.inventoryQuantity,
    })
    .from(variants)
    .where(eq(variants.shopId, shop.id));

  for (const variant of rows) {
    // Every day in the window needs a row, or velocity's denominator only counts
    // the days that happened to have sales.
    await fillMissingDays(shop.id, variant.id, since, addDays(today, -1));
    await inferTrailingStockout(shop.id, variant, addDays(today, -1), DEMO_WINDOW_DAYS);
  }

  await db
    .update(shops)
    .set({
      backfillCursor: null,
      backfillCompletedAt: new Date(),
      backfillOrdersImported: ordersImported,
      backfillOrdersEstimated: ordersEstimated,
      updatedAt: new Date(),
    })
    .where(eq(shops.id, shop.id));

  return {
    shopId: shop.id,
    phase: "done",
    ordersImported,
    ordersEstimated,
    variantsSeen,
    done: true,
    deferred: false,
  };
}

async function loadVariantIdMap(shopId: string): Promise<Map<string, string>> {
  const db = getDb();
  const rows = await db
    .select({ id: variants.id, shopifyVariantId: variants.shopifyVariantId })
    .from(variants)
    .where(eq(variants.shopId, shopId));
  return new Map(rows.map((r) => [r.shopifyVariantId, r.id]));
}

/**
 * Shops with an unfinished backfill, oldest first.
 *
 * "Unfinished" is `backfill_completed_at is null`, and an active shop only. A
 * shop that uninstalled mid-backfill must not keep being called — its token is
 * gone and every attempt is a guaranteed failure.
 */
export async function shopsNeedingBackfill(limit = 5): Promise<Shop[]> {
  const db = getDb();
  return db
    .select()
    .from(shops)
    .where(
      and(
        isNull(shops.backfillCompletedAt),
        isNull(shops.uninstalledAt),
        // A shop with no token and no demo flag cannot be backfilled at all.
        or(eq(shops.isDemo, true), sql`${shops.accessToken} is not null`),
      ),
    )
    .orderBy(sql`${shops.createdAt} asc`)
    .limit(limit);
}

/** Re-run a completed backfill: used by the manual "Re-sync" control. */
export async function resetBackfill(shopId: string): Promise<void> {
  const db = getDb();
  await db
    .update(shops)
    .set({
      backfillCursor: null,
      backfillCompletedAt: null,
      backfillStartedAt: null,
      backfillOrdersImported: 0,
      updatedAt: new Date(),
    })
    .where(eq(shops.id, shopId));
}

/** Human progress line for the onboarding screen. Real counts, never a fake bar. */
export function progressLine(shop: Shop): string {
  const imported = shop.backfillOrdersImported;
  const total = shop.backfillOrdersEstimated;
  if (shop.backfillCompletedAt) {
    return `Imported ${imported.toLocaleString("en-US")} orders`;
  }
  if (!shop.backfillStartedAt) return "Waiting to start the 90-day import";
  if (total && total > 0) {
    return `Imported ${imported.toLocaleString("en-US")} of ~${total.toLocaleString("en-US")} orders`;
  }
  return `Imported ${imported.toLocaleString("en-US")} orders so far`;
}
