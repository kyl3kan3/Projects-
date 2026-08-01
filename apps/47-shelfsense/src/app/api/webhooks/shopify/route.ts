/**
 * The single Shopify webhook endpoint.
 *
 * Verify → persist → ack, and nothing else. Business logic runs from the tick (see
 * lib/webhooks.ts) for two reasons: Shopify downgrades an app's reliability score
 * for slow endpoints, and a handler that does its work inline loses that work when
 * it throws, whereas a persisted delivery is retried with its payload intact.
 *
 * HMAC verification is not best-effort. Anything that fails it is rejected before
 * the body is parsed — without it, whoever finds this URL can invent orders and
 * inventory levels in a merchant's account, which means inventing the reorder
 * advice the merchant then acts on with real money.
 */

import type { NextRequest } from "next/server";
import { env, has } from "@/lib/env";
import { verifyWebhookHmac, WEBHOOK_TOPICS } from "@/lib/shopify";
import { shopByDomain } from "@/lib/shopify-admin";
import { recordEvent } from "@/lib/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  // No secret configured means we cannot verify anything, so we refuse rather than
  // accept unauthenticated inventory data.
  if (!has("SHOPIFY_API_SECRET")) {
    console.error("[shopify] webhook received with no SHOPIFY_API_SECRET configured");
    return new Response("not configured", { status: 503 });
  }

  // Raw bytes, before any parsing: re-serialising the JSON changes the bytes and
  // every signature fails.
  const raw = await req.text();
  const signature = req.headers.get("x-shopify-hmac-sha256");
  if (!verifyWebhookHmac(raw, signature, env.shopifyApiSecret)) {
    return new Response("invalid signature", { status: 401 });
  }

  const topic = req.headers.get("x-shopify-topic") ?? "";
  const shopDomain = (req.headers.get("x-shopify-shop-domain") ?? "").toLowerCase();
  const webhookId = req.headers.get("x-shopify-webhook-id") ?? "";

  if (!topic || !shopDomain) {
    return new Response("missing topic or shop header", { status: 400 });
  }
  if (!webhookId) {
    // Without a delivery id there is no idempotency key, and a retry would be
    // indistinguishable from a new event. Shopify always sends one.
    return new Response("missing webhook id", { status: 400 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("unparseable body", { status: 400 });
  }

  const shop = await shopByDomain(shopDomain);

  try {
    const event = await recordEvent({
      shopId: shop?.id ?? null,
      shopDomain,
      webhookId,
      topic,
      payload,
    });

    if (!event) {
      // Duplicate delivery: already stored, so ack and stop. This is the
      // idempotency guarantee, and it is why replaying the same webhook five times
      // cannot double-count a day's sales.
      return Response.json({ ok: true, duplicate: true }, { status: 200 });
    }

    const known = (WEBHOOK_TOPICS as readonly string[]).includes(topic);
    if (!known) {
      console.info(`[shopify] stored unregistered topic ${topic} for ${shopDomain}`);
    }
    return Response.json({ ok: true, queued: true }, { status: 200 });
  } catch (err) {
    // 5xx so Shopify retries: losing an order silently corrupts a velocity figure
    // the merchant will spend money on.
    console.error(`[shopify] could not store ${topic} for ${shopDomain}`, err);
    return new Response("storage error", { status: 500 });
  }
}
