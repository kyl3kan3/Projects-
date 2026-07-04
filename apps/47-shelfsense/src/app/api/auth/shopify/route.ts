/**
 * src/app/api/auth/shopify/route.ts
 *
 * Shopify OAuth entry + callback. Begins the install flow, completes
 * token exchange, registers webhooks, starts the backfill, and redirects
 * into the embedded app.
 *
 * TODO:
 * - [ ] GET without `code`: validate `shop` param shape
 *       (*.myshopify.com), redirect to the authorize URL (lib/shopify
 *       beginOAuth) with a signed state nonce.
 * - [ ] GET with `code` (callback): verify state + HMAC, exchange code,
 *       encrypt + store token, upsert shops row.
 * - [ ] Register webhooks and create the Billing subscription (trial);
 *       redirect to the Billing confirmationUrl, then into the admin.
 * - [ ] Enqueue backfill-orders job on first install.
 * - [ ] Re-install of an uninstalled shop reactivates rather than
 *       duplicating.
 */

export async function GET(_req: Request): Promise<Response> {
  throw new Error("Not implemented");
}
