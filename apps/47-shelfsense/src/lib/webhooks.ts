/**
 * Webhook processing: what happens to a `webhook_events` row after the endpoint
 * has acked it.
 *
 * The endpoint's only job is verify → persist → ack in under a second (Shopify
 * penalises slow endpoints in the app's reliability score, and a 5xx costs a
 * nineteen-day retry schedule). Everything else happens here, driven by the cron
 * tick, which means a topic that fails to apply is retried by the next tick with
 * its raw payload intact rather than lost.
 *
 * Idempotency has two layers, on purpose:
 *
 *  1. `webhook_events.shopify_webhook_id` is unique, so the same *delivery* is
 *     stored once however many times Shopify sends it.
 *  2. Applying the event is itself idempotent — orders go through the line ledger
 *     (lib/ingest), inventory is a set-not-add. So even a duplicate that slipped
 *     past layer one changes nothing.
 *
 * That second layer is what makes replay safe, and replay is a feature: a merchant
 * whose forecasts look wrong can have the last N events re-applied.
 */

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  inventoryLevels,
  variants,
  webhookEvents,
  type Shop,
  type WebhookEvent,
} from "@/db/schema";
import { applySubscriptionUpdate } from "@/lib/billing";
import { todayInZone } from "@/lib/dates";
import { applyOrder, markStockoutDay, refreshSkuCount, upsertCatalogue } from "@/lib/ingest";
import { markUninstalled } from "@/lib/install";
import {
  mapOrder,
  priceToCents,
  type ShopifyInventoryLevelPayload,
  type ShopifyOrderPayload,
  type ShopifyProductPayload,
} from "@/lib/shopify";
import { shopByDomain } from "@/lib/shopify-admin";

export interface ProcessResult {
  eventId: string;
  topic: string;
  applied: boolean;
  detail: string;
}

/** Persist a verified delivery. Returns null when it is a duplicate. */
export async function recordEvent(args: {
  shopId: string | null;
  shopDomain: string;
  webhookId: string;
  topic: string;
  payload: unknown;
}): Promise<WebhookEvent | null> {
  const db = getDb();
  const inserted = await db
    .insert(webhookEvents)
    .values({
      shopId: args.shopId,
      shopDomain: args.shopDomain,
      shopifyWebhookId: args.webhookId,
      topic: args.topic,
      payload: args.payload as object,
    })
    .onConflictDoNothing({ target: [webhookEvents.shopifyWebhookId] })
    .returning();
  return inserted[0] ?? null;
}

/** Unprocessed events, oldest first. */
export async function pendingEvents(limit = 100): Promise<WebhookEvent[]> {
  const db = getDb();
  return db
    .select()
    .from(webhookEvents)
    .where(and(isNull(webhookEvents.processedAt), sql`${webhookEvents.attempts} < 6`))
    .orderBy(asc(webhookEvents.receivedAt))
    .limit(limit);
}

/**
 * Apply one event.
 *
 * An event whose shop we do not know is marked processed with a note rather than
 * retried forever — a signed webhook for a store that never completed its install
 * is not going to become applicable.
 */
export async function processEvent(event: WebhookEvent): Promise<ProcessResult> {
  const db = getDb();
  const base = { eventId: event.id, topic: event.topic };

  await db
    .update(webhookEvents)
    .set({ attempts: event.attempts + 1 })
    .where(eq(webhookEvents.id, event.id));

  try {
    const shop = await shopByDomain(event.shopDomain);
    if (!shop) {
      await finish(event.id, "no shop on record for this domain");
      return { ...base, applied: false, detail: "unknown shop" };
    }

    const detail = await applyTopic(shop, event);
    await finish(event.id, null);
    return { ...base, applied: true, detail };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    await db
      .update(webhookEvents)
      .set({ error: message.slice(0, 500) })
      .where(eq(webhookEvents.id, event.id));
    console.error(`[webhook] ${event.topic} ${event.id} failed`, err);
    return { ...base, applied: false, detail: message };
  }
}

async function finish(eventId: string, note: string | null): Promise<void> {
  const db = getDb();
  await db
    .update(webhookEvents)
    .set({ processedAt: new Date(), error: note })
    .where(eq(webhookEvents.id, eventId));
}

async function applyTopic(shop: Shop, event: WebhookEvent): Promise<string> {
  switch (event.topic) {
    case "orders/create":
    case "orders/updated": {
      const mapped = mapOrder(event.payload as ShopifyOrderPayload, shop.timezone);
      if (!mapped) return "order payload had no usable id or date";
      const result = await applyOrder(shop, mapped);
      return `order ${mapped.externalId}: ${result.linesWritten} lines, ${result.linesRemoved} removed, ${result.daysTouched} days rolled up${
        result.skippedUnknownVariants ? `, ${result.skippedUnknownVariants} unknown variants skipped` : ""
      }`;
    }

    case "inventory_levels/update":
      return applyInventoryLevel(shop, event.payload as ShopifyInventoryLevelPayload);

    case "products/update":
      return applyProductUpdate(shop, event.payload as ShopifyProductPayload);

    case "app/uninstalled":
      await markUninstalled(shop.shopifyDomain);
      return "shop deactivated";

    case "app_subscriptions/update": {
      const result = await applySubscriptionUpdate(
        shop,
        event.payload as Parameters<typeof applySubscriptionUpdate>[1],
      );
      return `subscription ${result.status} -> plan ${result.plan}`;
    }

    default:
      // A topic we registered but do not act on yet is acked, not errored: a 4xx
      // would make Shopify retry it for nineteen days.
      return `topic ignored`;
  }
}

/**
 * `inventory_levels/update`: the authoritative, forward-looking source of the
 * stockout flag.
 *
 * The payload identifies the item by `inventory_item_id`, which is why the mirror
 * stores it. Setting `available` here — and recording whether today was a stockout
 * day — is what makes the censoring accurate from install onward, rather than
 * relying on the trailing-run inference the backfill has to use for the past.
 */
async function applyInventoryLevel(
  shop: Shop,
  payload: ShopifyInventoryLevelPayload,
): Promise<string> {
  const db = getDb();
  const itemId = payload.inventory_item_id != null ? String(payload.inventory_item_id) : "";
  const locationId = payload.location_id != null ? String(payload.location_id) : "";
  if (!itemId) return "inventory payload had no inventory_item_id";

  const available = Math.max(0, Math.round(payload.available ?? 0));

  const [level] = await db
    .select({ variantId: inventoryLevels.variantId })
    .from(inventoryLevels)
    .where(
      and(
        eq(inventoryLevels.shopId, shop.id),
        eq(inventoryLevels.shopifyLocationId, itemId),
      ),
    )
    .limit(1);

  if (!level) {
    return `no mirrored variant for inventory item ${itemId} yet`;
  }

  await db
    .update(inventoryLevels)
    .set({ available, syncedAt: new Date() })
    .where(
      and(
        eq(inventoryLevels.variantId, level.variantId),
        eq(inventoryLevels.shopifyLocationId, itemId),
      ),
    );

  await db
    .update(variants)
    .set({ inventoryQuantity: available })
    .where(eq(variants.id, level.variantId));

  const today = todayInZone(shop.timezone);
  await markStockoutDay(shop.id, level.variantId, today, available <= 0);

  return `variant ${level.variantId} available=${available}${locationId ? ` at location ${locationId}` : ""}`;
}

/** `products/update`: refresh the mirror without touching merchant-owned columns. */
async function applyProductUpdate(shop: Shop, payload: ShopifyProductPayload): Promise<string> {
  const productId = payload.id != null ? String(payload.id) : "";
  if (!productId) return "product payload had no id";

  const result = await upsertCatalogue(shop, [
    {
      shopifyProductId: productId,
      title: payload.title ?? "Untitled product",
      status: (payload.status ?? "active").toLowerCase(),
      vendor: payload.vendor ?? null,
      imageUrl: payload.image?.src ?? payload.images?.[0]?.src ?? null,
      variants: (payload.variants ?? [])
        .filter((v) => v.id != null)
        .map((v) => ({
          shopifyVariantId: String(v.id),
          sku: (v.sku ?? "").trim() || `VAR-${v.id}`,
          title: v.title ?? "Default",
          priceCents: priceToCents(v.price),
          // The REST product payload has no unit cost; leaving it null means the
          // upsert keeps whatever cost is already on file.
          costCents: null,
          inventoryQuantity: v.inventory_quantity ?? 0,
          tracked: v.inventory_management === "shopify",
          inventoryItemId: v.inventory_item_id != null ? String(v.inventory_item_id) : null,
        })),
    },
  ]);

  await refreshSkuCount(shop.id);
  return `product ${productId}: ${result.variantsSeen} variants mirrored`;
}

/**
 * Replay: re-apply the last `limit` events for a shop.
 *
 * Safe precisely because applying is idempotent, and useful when a merchant's
 * numbers look wrong after an incident. Clearing `processed_at` hands the work back
 * to the ordinary tick rather than doing it inline in a request.
 */
export async function replayEvents(shopId: string, limit = 200): Promise<number> {
  const db = getDb();
  const recent = await db
    .select({ id: webhookEvents.id })
    .from(webhookEvents)
    .where(eq(webhookEvents.shopId, shopId))
    .orderBy(sql`${webhookEvents.receivedAt} desc`)
    .limit(limit);
  if (!recent.length) return 0;

  await db
    .update(webhookEvents)
    .set({ processedAt: null, attempts: 0, error: null })
    .where(
      inArray(
        webhookEvents.id,
        recent.map((r) => r.id),
      ),
    );
  return recent.length;
}

/** Count of deliveries we could not apply — surfaced on the settings screen. */
export async function failedEventCount(shopId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(webhookEvents)
    .where(
      and(
        eq(webhookEvents.shopId, shopId),
        isNull(webhookEvents.processedAt),
        sql`${webhookEvents.attempts} >= 6`,
      ),
    );
  return row?.n ?? 0;
}
