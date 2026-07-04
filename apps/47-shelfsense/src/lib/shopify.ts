/**
 * src/lib/shopify.ts
 *
 * Shopify API client factory, OAuth, and webhook helpers. All Shopify
 * access goes through this module so API version pinning, cost-limit
 * throttling, and token decryption live in one place.
 *
 * TODO:
 * - [ ] Configure @shopify/shopify-api with a pinned ApiVersion (never
 *       "latest"), SHOPIFY_API_KEY/SECRET, and SHOPIFY_SCOPES.
 * - [ ] beginOAuth(shopDomain) / completeOAuth(callbackParams): token
 *       exchange, encrypt token via TOKEN_ENCRYPTION_KEY, upsert shops row.
 * - [ ] registerWebhooks(shop): orders/create, orders/updated,
 *       inventory_levels/update, products/update, app/uninstalled.
 * - [ ] verifyWebhookHmac(rawBody, hmacHeader): timing-safe compare.
 * - [ ] graphqlClient(shop): Admin GraphQL client with cost-limit-aware
 *       retry/backoff (respect throttleStatus in extensions).
 * - [ ] verifySessionToken(jwt): App Bridge session-token auth for every
 *       embedded-app API route.
 * - [ ] pageOrders(shop, sinceDate, cursor): backfill pagination helper
 *       returning { orders, nextCursor }.
 */

export interface ShopContext {
  shopId: string;
  shopifyDomain: string;
}

export function verifyWebhookHmac(_rawBody: string, _hmacHeader: string): boolean {
  throw new Error("Not implemented");
}

export function beginOAuth(_shopDomain: string): string {
  throw new Error("Not implemented");
}
