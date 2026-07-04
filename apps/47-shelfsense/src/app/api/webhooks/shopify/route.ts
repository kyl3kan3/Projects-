/**
 * src/app/api/webhooks/shopify/route.ts
 *
 * Single webhook endpoint for all Shopify topics. Verify, persist,
 * enqueue, ack -- no business logic inline (Shopify retries slow
 * endpoints and drops the app's webhook reliability score).
 *
 * TODO:
 * - [ ] Read the raw body BEFORE parsing (HMAC is over raw bytes);
 *       verify with lib/shopify verifyWebhookHmac; 401 on mismatch.
 * - [ ] Insert into webhook_events keyed by X-Shopify-Webhook-Id
 *       (unique). Duplicate => ack 200 and stop (idempotency).
 * - [ ] Enqueue process-webhook job with { eventId, topic, shopDomain };
 *       return 200 in <1s.
 * - [ ] Handle topics: orders/create, orders/updated,
 *       inventory_levels/update, products/update, app/uninstalled,
 *       app_subscriptions/update.
 * - [ ] Unknown topic: log, ack 200 (never 4xx a topic we registered).
 */

export async function POST(_req: Request): Promise<Response> {
  throw new Error("Not implemented");
}
