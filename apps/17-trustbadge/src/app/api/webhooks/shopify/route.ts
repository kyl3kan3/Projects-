/**
 * Shopify webhooks: `orders/create`, `orders/fulfilled`, `app/uninstalled`.
 *
 * HMAC verification is not optional and is not best-effort: anything that fails
 * it is rejected with 401 before the body is parsed. Without it, whoever finds
 * this URL can invent orders in a merchant's account — which means inventing
 * "verified purchase" reviews, which is the one thing this product sells.
 *
 * A 200 means "we have it". Anything we could not process returns 5xx so Shopify
 * retries, except a payload we understand and have decided to ignore, which is a
 * 200 so it stops being retried for nineteen days.
 */

import type { NextRequest } from "next/server";
import { env, has } from "@/lib/env";
import { cancelOrder, ingestOrder } from "@/lib/orders";
import {
  mapOrder,
  markUninstalled,
  storeForShop,
  verifyWebhookHmac,
  type ShopifyOrderPayload,
} from "@/lib/shopify";
import { tierForStore } from "@/lib/tier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  // No secret configured means we cannot verify anything, so we refuse rather
  // than accept unauthenticated order data.
  if (!has("SHOPIFY_API_SECRET")) {
    console.error("[shopify] webhook received with no SHOPIFY_API_SECRET configured");
    return new Response("not configured", { status: 503 });
  }

  const raw = await req.text();
  const signature = req.headers.get("x-shopify-hmac-sha256");
  if (!verifyWebhookHmac(raw, signature, env.shopifyApiSecret)) {
    return new Response("invalid signature", { status: 401 });
  }

  const topic = req.headers.get("x-shopify-topic") ?? "";
  const shop = req.headers.get("x-shopify-shop-domain") ?? "";

  const store = await storeForShop(shop);
  if (!store) {
    // Signed by us, for a shop we have no record of: nothing to do, and retrying
    // will not change that.
    console.warn(`[shopify] ${topic} for unknown shop ${shop}`);
    return new Response(null, { status: 200 });
  }

  if (topic === "app/uninstalled") {
    await markUninstalled(shop);
    return new Response(null, { status: 200 });
  }

  if (topic !== "orders/create" && topic !== "orders/fulfilled") {
    return new Response(null, { status: 200 });
  }

  let payload: ShopifyOrderPayload;
  try {
    payload = JSON.parse(raw) as ShopifyOrderPayload;
  } catch {
    return new Response("unparseable body", { status: 400 });
  }

  const mapped = mapOrder(payload, topic);
  if (!mapped) return new Response(null, { status: 200 });

  try {
    if (mapped.status === "cancelled") {
      await cancelOrder(store.id, mapped.externalId);
      return new Response(null, { status: 200 });
    }

    const tier = await tierForStore(store);
    const result = await ingestOrder({
      store,
      tier,
      merchantId: store.merchantId,
      input: mapped,
    });
    console.info(
      `[shopify] ${topic} ${mapped.externalId}: ${result.created ? "created" : "updated"}, request ${result.reason}`,
    );
    return new Response(null, { status: 200 });
  } catch (err) {
    // 5xx so Shopify retries: losing a fulfilment silently loses a review.
    console.error(`[shopify] ${topic} failed`, err);
    return new Response("handler error", { status: 500 });
  }
}
