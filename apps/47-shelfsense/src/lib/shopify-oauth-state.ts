/**
 * The install flow's CSRF state cookie.
 *
 * Its own module because Next refuses any non-route export from a route file, and both
 * halves of the OAuth flow need the name: `/api/shopify/auth` sets it,
 * `/api/shopify/callback` checks it. Without that check an attacker can complete an
 * install against their own shop in someone else's browser and be handed a session on
 * that person's account.
 */

export const SHOPIFY_STATE_COOKIE = "shelfsense_shopify_state";

/** `<nonce>:<shop>` — the shop is bound in, so a nonce cannot be replayed elsewhere. */
export function encodeState(nonce: string, shop: string): string {
  return `${nonce}:${shop}`;
}

export function decodeState(cookie: string | undefined): { nonce: string; shop: string } | null {
  if (!cookie) return null;
  const index = cookie.indexOf(":");
  if (index <= 0) return null;
  return { nonce: cookie.slice(0, index), shop: cookie.slice(index + 1) };
}
