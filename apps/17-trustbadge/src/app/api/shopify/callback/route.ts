/**
 * Shopify install: step two.
 *
 * Verify the HMAC, verify the state nonce against the cookie we set, exchange the
 * code for an offline access token, store it encrypted, register the webhooks,
 * inject the script tag, and sign the merchant in.
 *
 * Order matters: the token is stored before webhooks are registered, so a
 * registration failure leaves a usable store the merchant can retry from rather
 * than an install that has to be started over.
 */

import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { setSessionCookie } from "@/lib/auth";
import { getDb } from "@/db";
import { merchants } from "@/db/schema";
import { eq } from "drizzle-orm";
import { env, has } from "@/lib/env";
import {
  exchangeCode,
  injectScriptTag,
  isValidShopDomain,
  linkShop,
  registerWebhooks,
  verifyOAuthHmac,
} from "@/lib/shopify";
import { STATE_COOKIE } from "../auth/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(reason: string): Response {
  return Response.redirect(`${env.appUrl}/settings/install?shopify=${reason}`, 302);
}

export async function GET(req: NextRequest): Promise<Response> {
  if (!has("SHOPIFY_API_KEY") || !has("SHOPIFY_API_SECRET")) return fail("unconfigured");

  const url = new URL(req.url);
  const query: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });

  const shop = (query.shop ?? "").toLowerCase();
  const code = query.code ?? "";
  if (!isValidShopDomain(shop) || !code) return fail("bad_shop");
  if (!verifyOAuthHmac(query, env.shopifyApiSecret)) return fail("bad_hmac");

  // CSRF: the state must match the nonce we issued, for this shop, in this browser.
  const jar = await cookies();
  const cookie = jar.get(STATE_COOKIE)?.value ?? "";
  const [expectedState, expectedShop] = cookie.split(":");
  if (!expectedState || expectedState !== query.state || expectedShop !== shop) {
    return fail("bad_state");
  }
  jar.delete(STATE_COOKIE);

  let token: { accessToken: string; scope: string };
  try {
    token = await exchangeCode(shop, code);
  } catch (err) {
    console.error("[shopify] token exchange failed", err);
    return fail("exchange_failed");
  }

  // The shop's own details, for naming the store and linking an existing account.
  let shopName: string | null = null;
  let shopEmail: string | null = null;
  let shopId: string | null = null;
  try {
    const response = await fetch(`https://${shop}/admin/api/2025-01/shop.json`, {
      headers: { "x-shopify-access-token": token.accessToken },
    });
    if (response.ok) {
      const body = (await response.json()) as {
        shop?: { id?: number; name?: string; email?: string };
      };
      shopName = body.shop?.name ?? null;
      shopEmail = body.shop?.email ?? null;
      shopId = body.shop?.id != null ? String(body.shop.id) : null;
    }
  } catch {
    // Not fatal: the shop domain is a serviceable name.
  }

  const { store, merchantId } = await linkShop({
    shop,
    accessToken: token.accessToken,
    scope: token.scope,
    shopName,
    shopEmail,
    shopId,
  });

  const webhooks = await registerWebhooks(store);
  const failed = webhooks.filter((w) => !w.ok).map((w) => w.topic);
  if (failed.length) console.warn(`[shopify] webhook registration failed for ${failed.join(", ")}`);
  await injectScriptTag(store);

  const db = getDb();
  const [merchant] = await db.select().from(merchants).where(eq(merchants.id, merchantId));
  if (merchant) await setSessionCookie({ merchantId: merchant.id, email: merchant.email });

  return Response.redirect(
    `${env.appUrl}/home?installed=${encodeURIComponent(store.name)}${failed.length ? "&webhooks=partial" : ""}`,
    302,
  );
}
