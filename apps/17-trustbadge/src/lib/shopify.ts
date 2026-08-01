/**
 * Shopify integration: OAuth install, webhook verification, order ingestion, and
 * script-tag injection.
 *
 * Implemented against the Admin API directly with `node:crypto` and `fetch`
 * rather than `@shopify/shopify-api`. Three reasons, in order:
 *
 *  1. The parts that must be right are two HMACs and a shop-domain check, and
 *     those are twelve lines that can be unit-tested exhaustively against
 *     Shopify's documented examples — see shopify.test.ts. The SDK's versions
 *     cannot be tested without standing up its global singleton.
 *  2. The SDK requires `shopifyApi()` to be constructed with real credentials at
 *     import time, which breaks the lazy-env rule every other module here follows
 *     and would make `next build` need Shopify keys.
 *  3. It is 4MB of dependency in a serverless function for four HTTP calls.
 *
 * The tradeoff is honest: no App Bridge session-token verification (embedded-app
 * UI is post-MVP) and no GDPR-webhook helpers (required for App Store listing,
 * which is Phase 2).
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { merchants, stores, type LineItem, type Store } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { ValidationError } from "@/lib/errors";

const API_VERSION = "2025-01";

/** Webhooks we register at install. GDPR topics are added with the listing (Phase 2). */
export const WEBHOOK_TOPICS = ["orders/create", "orders/fulfilled", "app/uninstalled"] as const;

/* --------------------------------------------------------------- validation --- */

/**
 * A shop domain must be exactly `something.myshopify.com`.
 *
 * This is a security control, not tidiness: the value is interpolated into the
 * URL the OAuth code is exchanged at, so an unvalidated `shop` parameter is an
 * SSRF that hands our API secret to an attacker's server.
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
 * Shopify signs the query string with the `hmac` parameter removed and the rest
 * sorted; `signature` (a legacy parameter) is excluded too.
 */
export function verifyOAuthHmac(query: Record<string, string>, secret: string): boolean {
  const provided = query.hmac;
  if (!provided) return false;
  const message = Object.keys(query)
    .filter((key) => key !== "hmac" && key !== "signature")
    .sort()
    .map((key) => `${encodeURIComponent(key).replace(/%20/g, "+")}=${encodeURIComponent(query[key]).replace(/%20/g, "+")}`)
    .join("&");
  const digest = createHmac("sha256", secret).update(message).digest("hex");
  return constantTimeEquals(digest, provided.toLowerCase());
}

/**
 * Verify a webhook body against `X-Shopify-Hmac-Sha256` (base64 over raw bytes).
 *
 * The raw body matters: re-serialising the parsed JSON produces different bytes
 * and every signature fails, which is the classic way this gets shipped broken.
 */
export function verifyWebhookHmac(rawBody: string | Buffer, header: string | null, secret: string): boolean {
  if (!header) return false;
  const digest = createHmac("sha256", secret).update(rawBody).digest("base64");
  return constantTimeEquals(digest, header);
}

/* ---------------------------------------------------------------- OAuth URL --- */

export function installUrl(shop: string, state: string): string {
  if (!isValidShopDomain(shop)) throw new ValidationError("That is not a Shopify store domain");
  const params = new URLSearchParams({
    client_id: env.shopifyApiKey,
    scope: env.shopifyScopes,
    redirect_uri: `${env.appUrl}/api/shopify/callback`,
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
  if (!isValidShopDomain(shop)) throw new ValidationError("That is not a Shopify store domain");
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

/* ------------------------------------------------------------- Admin client --- */

async function admin(
  store: Store,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = decryptSecret(store.accessToken);
  if (!store.shopifyDomain || !token) {
    throw new Error("This store has no usable Shopify credentials");
  }
  return fetch(`https://${store.shopifyDomain}/admin/api/${API_VERSION}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-shopify-access-token": token,
      ...(init.headers ?? {}),
    },
  });
}

export async function registerWebhooks(store: Store): Promise<{ topic: string; ok: boolean }[]> {
  const results: { topic: string; ok: boolean }[] = [];
  for (const topic of WEBHOOK_TOPICS) {
    try {
      const response = await admin(store, "/webhooks.json", {
        method: "POST",
        body: JSON.stringify({
          webhook: {
            topic,
            address: `${env.appUrl}/api/webhooks/shopify`,
            format: "json",
          },
        }),
      });
      // 422 here is almost always "already exists", which is a success for us.
      results.push({ topic, ok: response.ok || response.status === 422 });
    } catch {
      results.push({ topic, ok: false });
    }
  }
  return results;
}

/**
 * Inject the widget's script tag into the storefront.
 *
 * On Online Store 2.0 themes a theme-app-extension block is the better home, and
 * the install screen says so — but a script tag works on every theme including
 * vintage ones, and "it appeared by itself" is the install experience worth having.
 */
export async function injectScriptTag(store: Store): Promise<boolean> {
  try {
    const response = await admin(store, "/script_tags.json", {
      method: "POST",
      body: JSON.stringify({
        script_tag: {
          event: "onload",
          src: `${env.widgetCdnUrl}/w.js?store=${encodeURIComponent(store.publicKey)}`,
          display_scope: "online_store",
        },
      }),
    });
    return response.ok || response.status === 422;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------ store linking --- */

/**
 * Create or re-link the store for a shop that just authorised us.
 *
 * Re-install is the common case (a merchant uninstalls, changes their mind a week
 * later), and it must return them to their existing reviews rather than a blank
 * account — so the shop domain is the identity, and a reinstall clears
 * `uninstalledAt` and stores the fresh token.
 */
export async function linkShop(args: {
  shop: string;
  accessToken: string;
  scope: string;
  shopName?: string | null;
  shopEmail?: string | null;
  shopId?: string | null;
}): Promise<{ store: Store; merchantId: string; created: boolean }> {
  const db = getDb();
  const shop = args.shop.toLowerCase();

  const [existing] = await db.select().from(stores).where(eq(stores.shopifyDomain, shop));
  if (existing) {
    const [updated] = await db
      .update(stores)
      .set({
        accessToken: encryptSecret(args.accessToken),
        shopifyScopes: args.scope,
        shopifyShopId: args.shopId ?? existing.shopifyShopId,
        platform: "shopify",
        uninstalledAt: null,
      })
      .where(eq(stores.id, existing.id))
      .returning();
    return { store: updated, merchantId: updated.merchantId, created: false };
  }

  // A brand-new shop needs a merchant. Link by email when we already know it, so
  // installing from the App Store lands in an existing account rather than
  // creating a second one nobody can find.
  const email = (args.shopEmail ?? "").trim().toLowerCase();
  let merchantId: string | null = null;
  if (email) {
    const [merchant] = await db.select().from(merchants).where(eq(merchants.email, email));
    merchantId = merchant?.id ?? null;
  }

  if (!merchantId) {
    // No account yet: create one with an unusable password hash. The merchant sets
    // a password from the dashboard if they ever want to sign in without Shopify.
    const [merchant] = await db
      .insert(merchants)
      .values({
        email: email || `${shop}@shops.trustbadge.invalid`,
        name: args.shopName ?? shop,
        // Deliberately not a valid scrypt "salt:hash" pair, so verifyPassword
        // can never match it.
        passwordHash: "shopify-install-no-password",
      })
      .returning();
    merchantId = merchant.id;
  }

  const { createDefaultStore } = await import("@/lib/stores");
  const store = await createDefaultStore(merchantId, {
    name: args.shopName ?? shop.replace(".myshopify.com", ""),
    domain: shop,
    platform: "shopify",
    shopifyDomain: shop,
  });

  const [withToken] = await db
    .update(stores)
    .set({
      accessToken: encryptSecret(args.accessToken),
      shopifyScopes: args.scope,
      shopifyShopId: args.shopId ?? null,
    })
    .where(eq(stores.id, store.id))
    .returning();

  return { store: withToken, merchantId, created: true };
}

export async function markUninstalled(shop: string): Promise<void> {
  const db = getDb();
  await db
    .update(stores)
    // The token is dead the moment they uninstall; keep the reviews, drop the key.
    .set({ uninstalledAt: new Date(), accessToken: null })
    .where(eq(stores.shopifyDomain, shop.toLowerCase()));
}

export async function storeForShop(shop: string): Promise<Store | null> {
  if (!isValidShopDomain(shop)) return null;
  const db = getDb();
  const [store] = await db.select().from(stores).where(eq(stores.shopifyDomain, shop.toLowerCase()));
  return store ?? null;
}

/* --------------------------------------------------------- payload mapping --- */

/** The subset of Shopify's order payload we use. */
export interface ShopifyOrderPayload {
  id?: number | string;
  name?: string;
  email?: string;
  contact_email?: string;
  phone?: string | null;
  cancelled_at?: string | null;
  fulfillment_status?: string | null;
  created_at?: string;
  customer?: { first_name?: string | null; last_name?: string | null; phone?: string | null };
  line_items?: {
    product_id?: number | string | null;
    variant_id?: number | string | null;
    title?: string;
    name?: string;
    quantity?: number;
  }[];
  fulfillments?: { created_at?: string; status?: string }[];
}

export interface MappedOrder {
  externalId: string;
  orderNumber: string | null;
  customerEmail: string;
  customerName: string | null;
  customerPhone: string | null;
  lineItems: LineItem[];
  status: "pending" | "fulfilled" | "cancelled";
  fulfilledAt: Date | null;
}

/**
 * Map a Shopify order webhook onto our order shape.
 *
 * Written as a pure function and tested against a real payload, because the
 * fields that matter are exactly the ones Shopify names inconsistently: the email
 * lives in `email` or `contact_email`, fulfilment is a status string on the order
 * *and* a timestamp inside `fulfillments[]`, and `orders/fulfilled` does not
 * always carry a fulfilment array at all.
 */
export function mapOrder(payload: ShopifyOrderPayload, topic: string): MappedOrder | null {
  const externalId = payload.id != null ? String(payload.id) : "";
  if (!externalId) return null;

  const email = (payload.email || payload.contact_email || "").trim().toLowerCase();
  const first = payload.customer?.first_name?.trim() ?? "";
  const last = payload.customer?.last_name?.trim() ?? "";
  const name = [first, last].filter(Boolean).join(" ") || null;

  const lineItems: LineItem[] = (payload.line_items ?? []).map((item) => ({
    externalId: String(item.product_id ?? item.variant_id ?? ""),
    title: (item.title ?? item.name ?? "Item").slice(0, 200),
    quantity: Math.max(1, Math.round(item.quantity ?? 1)),
  }));

  const cancelled = Boolean(payload.cancelled_at);
  const fulfilmentTime = payload.fulfillments?.find((f) => f.created_at)?.created_at;
  const fulfilledByStatus = payload.fulfillment_status === "fulfilled";
  // `orders/fulfilled` is authoritative about the fact even when the payload
  // carries no timestamp we can read; fall back to the delivery time (now).
  const fulfilled = topic === "orders/fulfilled" || fulfilledByStatus;

  const fulfilledAt = fulfilled
    ? new Date(fulfilmentTime ?? payload.created_at ?? Date.now())
    : null;

  return {
    externalId,
    orderNumber: payload.name ?? null,
    customerEmail: email,
    customerName: name,
    customerPhone: payload.phone ?? payload.customer?.phone ?? null,
    lineItems,
    status: cancelled ? "cancelled" : fulfilled ? "fulfilled" : "pending",
    fulfilledAt: cancelled ? null : fulfilledAt,
  };
}
