/**
 * Shopify verification, OAuth, and payload mapping.
 *
 * Implemented against the Admin API directly with `node:crypto` and `fetch`
 * rather than `@shopify/shopify-api`, for the reasons `apps/17-trustbadge`
 * documents and which apply identically here:
 *
 *  1. The parts that must be right are three signature checks and a shop-domain
 *     guard. Those are a few dozen lines that can be tested exhaustively against
 *     digests computed locally (see shopify.test.ts) — there are no Shopify
 *     credentials in this environment, so a test that can compute its own
 *     expected digest is the only kind of test worth having.
 *  2. `shopifyApi()` wants real credentials at import time, which would make
 *     `next build` require Shopify keys.
 *  3. It is megabytes of dependency in a serverless function for four HTTP calls.
 *
 * Everything that talks to Shopify over the network lives behind the
 * `ShopifyAdmin` interface in lib/shopify-admin.ts, which has a deterministic
 * fake. This module is the part that can be verified without a network at all.
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { ValidationError } from "@/lib/errors";
import { todayInZone } from "@/lib/dates";

/** Pinned, never "latest": an API version change must be a code change. */
export const SHOPIFY_API_VERSION = "2025-01";

/** Webhooks registered at install. GDPR topics arrive with the listing (Phase 2). */
export const WEBHOOK_TOPICS = [
  "orders/create",
  "orders/updated",
  "inventory_levels/update",
  "products/update",
  "app/uninstalled",
  "app_subscriptions/update",
] as const;

export type WebhookTopic = (typeof WEBHOOK_TOPICS)[number];

/* --------------------------------------------------------------- validation --- */

/**
 * A shop domain must be exactly `something.myshopify.com`.
 *
 * This is a security control, not tidiness: the value is interpolated into the URL
 * the OAuth code is exchanged at, so an unvalidated `shop` parameter is an SSRF
 * that hands our API secret to an attacker's server.
 */
export function isValidShopDomain(shop: unknown): shop is string {
  return (
    typeof shop === "string" &&
    shop.length <= 100 &&
    /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop.toLowerCase())
  );
}

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Verify the HMAC on an OAuth callback or an App-Store redirect.
 *
 * Shopify signs the query string with `hmac` removed and the rest sorted;
 * `signature` (a legacy parameter) is excluded too.
 */
export function verifyOAuthHmac(query: Record<string, string>, secret: string): boolean {
  const provided = query.hmac;
  if (!provided) return false;
  const message = Object.keys(query)
    .filter((key) => key !== "hmac" && key !== "signature")
    .sort()
    .map(
      (key) =>
        `${encodeURIComponent(key).replace(/%20/g, "+")}=${encodeURIComponent(query[key]).replace(/%20/g, "+")}`,
    )
    .join("&");
  const digest = createHmac("sha256", secret).update(message).digest("hex");
  return constantTimeEquals(digest, provided.toLowerCase());
}

/**
 * Verify a webhook body against `X-Shopify-Hmac-Sha256` (base64 over raw bytes).
 *
 * The raw body matters: re-serialising the parsed JSON produces different bytes
 * and every signature fails, which is the classic way this ships broken.
 */
export function verifyWebhookHmac(
  rawBody: string | Buffer,
  header: string | null,
  secret: string,
): boolean {
  if (!header) return false;
  const digest = createHmac("sha256", secret).update(rawBody).digest("base64");
  return constantTimeEquals(digest, header);
}

/* ------------------------------------------------------- session tokens --- */

export interface SessionTokenClaims {
  /** `https://shop.myshopify.com` — the store the request came from. */
  dest: string;
  shopDomain: string;
  sub: string;
}

function base64UrlDecode(part: string): string {
  return Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

/**
 * Verify an App Bridge session token (a JWT the admin iframe mints for us).
 *
 * Hand-verified rather than pulled from a library because the checks that matter
 * are specific and easy to get wrong: HS256 only (a token claiming `alg: none`
 * must be rejected, not trusted), signed with our own API secret, `aud` equal to
 * our API key, `dest` a real myshopify domain, and `exp`/`nbf` honoured with a
 * small clock skew. Returns null rather than throwing so a route can answer 401.
 */
export function verifySessionToken(
  token: string,
  secret: string,
  apiKey: string,
  now: Date = new Date(),
): SessionTokenClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;

  let header: { alg?: string };
  let payload: Record<string, unknown>;
  try {
    header = JSON.parse(base64UrlDecode(headerB64)) as { alg?: string };
    payload = JSON.parse(base64UrlDecode(payloadB64)) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (header.alg !== "HS256") return null;

  const expected = createHmac("sha256", secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64url");
  if (!constantTimeEquals(expected, signatureB64)) return null;

  const seconds = Math.floor(now.getTime() / 1000);
  const skew = 10;
  const exp = typeof payload.exp === "number" ? payload.exp : 0;
  const nbf = typeof payload.nbf === "number" ? payload.nbf : 0;
  if (!exp || exp + skew < seconds) return null;
  if (nbf && nbf - skew > seconds) return null;

  const aud = typeof payload.aud === "string" ? payload.aud : "";
  if (!apiKey || aud !== apiKey) return null;

  const dest = typeof payload.dest === "string" ? payload.dest : "";
  const shopDomain = dest.replace(/^https:\/\//, "").replace(/\/$/, "").toLowerCase();
  if (!isValidShopDomain(shopDomain)) return null;

  return { dest, shopDomain, sub: typeof payload.sub === "string" ? payload.sub : "" };
}

/* ---------------------------------------------------------------- OAuth URL --- */

export function installUrl(shop: string, state: string): string {
  if (!isValidShopDomain(shop)) throw new ValidationError("That is not a Shopify store domain.");
  const params = new URLSearchParams({
    client_id: env.shopifyApiKey,
    scope: env.shopifyScopes,
    redirect_uri: `${env.appUrl}${env.shopifyRedirectPath}`,
    state,
    "grant_options[]": "",
  });
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

export interface TokenExchange {
  accessToken: string;
  scope: string;
}

export async function exchangeCode(shop: string, code: string): Promise<TokenExchange> {
  if (!isValidShopDomain(shop)) throw new ValidationError("That is not a Shopify store domain.");
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_id: env.shopifyApiKey,
      client_secret: env.shopifyApiSecret,
      code,
    }),
  });
  if (!response.ok) {
    throw new Error(`Shopify rejected the authorization code (${response.status})`);
  }
  const body = (await response.json()) as { access_token?: string; scope?: string };
  if (!body.access_token) throw new Error("Shopify returned no access token");
  return { accessToken: body.access_token, scope: body.scope ?? "" };
}

/* ---------------------------------------------------------- payload mapping --- */

/** The subset of Shopify's order payload the forecast needs. */
export interface ShopifyOrderPayload {
  id?: number | string;
  name?: string;
  created_at?: string;
  processed_at?: string;
  cancelled_at?: string | null;
  test?: boolean;
  currency?: string;
  line_items?: {
    id?: number | string;
    product_id?: number | string | null;
    variant_id?: number | string | null;
    sku?: string | null;
    title?: string | null;
    name?: string | null;
    variant_title?: string | null;
    quantity?: number;
    price?: string | number | null;
    /** Present on refunded/removed lines in `orders/updated`. */
    fulfillable_quantity?: number;
  }[];
  refunds?: {
    refund_line_items?: { line_item_id?: number | string | null; quantity?: number }[];
  }[];
}

export interface MappedSaleLine {
  shopifyVariantId: string;
  shopifyProductId: string | null;
  sku: string;
  title: string;
  units: number;
  revenueCents: number;
  unitPriceCents: number;
}

export interface MappedOrder {
  externalId: string;
  orderNumber: string | null;
  /** Calendar day in the shop's timezone — the sales_daily bucket. */
  date: string;
  cancelled: boolean;
  test: boolean;
  lines: MappedSaleLine[];
}

/**
 * "12.50" -> 1250. Shopify sends money as a decimal string; parse once, here.
 *
 * Parsed digit-by-digit rather than as `Math.round(Number(value) * 100)`, because
 * that expression is wrong: `1.005 * 100` is 100.49999999999999 in IEEE-754, so it
 * rounds *down* to 100 cents. One cent per line item is not much until it is a PO
 * total the supplier disputes.
 */
export function priceToCents(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const text = typeof value === "number" ? value.toString() : value.trim();
  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match || (!match[2] && !match[3])) {
    // Exponential notation and anything else exotic: fall back to the float path
    // rather than silently returning zero for a real price.
    const n = Number(text);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }
  const [, sign, whole, fraction = ""] = match;
  const cents = Number(whole || "0") * 100 + Number((fraction + "00").slice(0, 2));
  // A third decimal rounds the cents up, half away from zero.
  const third = Number(fraction[2] ?? "0");
  const rounded = cents + (third >= 5 ? 1 : 0);
  return sign === "-" ? -rounded : rounded;
}

/**
 * Map a Shopify order onto per-variant daily sales.
 *
 * Three things this has to get right, and each has a test:
 *
 *  - **Refunds reduce units.** `orders/updated` carries a `refunds` array; a
 *    returned unit was not demand, and counting it inflates velocity permanently.
 *  - **The day is the shop's day.** An order at 23:30 in Los Angeles is not
 *    tomorrow's sale. Bucketing by the UTC date shifts a third of a west-coast
 *    store's sales into the wrong day and smears every velocity window.
 *  - **Test orders are excluded.** A merchant's Bogus-Gateway test order would
 *    otherwise become a permanent phantom sale in the history.
 */
export function mapOrder(
  payload: ShopifyOrderPayload,
  timezone: string,
): MappedOrder | null {
  const externalId = payload.id != null ? String(payload.id) : "";
  if (!externalId) return null;

  const createdAt = payload.created_at ?? payload.processed_at;
  const when = createdAt ? new Date(createdAt) : null;
  if (!when || Number.isNaN(when.getTime())) return null;
  const date = todayInZone(timezone, when);

  // Refunded quantity per line item id, summed across refunds.
  const refunded = new Map<string, number>();
  for (const refund of payload.refunds ?? []) {
    for (const line of refund.refund_line_items ?? []) {
      const id = line.line_item_id != null ? String(line.line_item_id) : "";
      if (!id) continue;
      refunded.set(id, (refunded.get(id) ?? 0) + Math.max(0, Math.round(line.quantity ?? 0)));
    }
  }

  const lines: MappedSaleLine[] = [];
  for (const item of payload.line_items ?? []) {
    const variantId = item.variant_id != null ? String(item.variant_id) : "";
    if (!variantId) continue;
    const lineId = item.id != null ? String(item.id) : "";
    const ordered = Math.max(0, Math.round(item.quantity ?? 0));
    const units = Math.max(0, ordered - (refunded.get(lineId) ?? 0));
    if (units === 0) continue;

    const unitPriceCents = priceToCents(item.price);
    const base = (item.title ?? item.name ?? "Item").trim();
    const variantTitle = (item.variant_title ?? "").trim();
    const title =
      variantTitle && variantTitle.toLowerCase() !== "default title"
        ? `${base} · ${variantTitle}`
        : base;

    lines.push({
      shopifyVariantId: variantId,
      shopifyProductId: item.product_id != null ? String(item.product_id) : null,
      sku: (item.sku ?? "").trim() || `VAR-${variantId}`,
      title: title.slice(0, 200),
      units,
      revenueCents: units * unitPriceCents,
      unitPriceCents,
    });
  }

  return {
    externalId,
    orderNumber: payload.name ?? null,
    date,
    cancelled: Boolean(payload.cancelled_at),
    test: payload.test === true,
    lines,
  };
}

/** The inventory_levels/update payload. */
export interface ShopifyInventoryLevelPayload {
  inventory_item_id?: number | string;
  location_id?: number | string;
  available?: number;
  updated_at?: string;
}

/** The products/update payload — enough to refresh the mirrors. */
export interface ShopifyProductPayload {
  id?: number | string;
  title?: string;
  status?: string;
  vendor?: string;
  image?: { src?: string } | null;
  images?: { src?: string }[];
  variants?: {
    id?: number | string;
    sku?: string | null;
    title?: string | null;
    price?: string | number | null;
    inventory_quantity?: number;
    inventory_management?: string | null;
    inventory_item_id?: number | string | null;
  }[];
}
