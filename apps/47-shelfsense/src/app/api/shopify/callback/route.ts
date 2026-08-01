/**
 * Shopify install, step two.
 *
 * Verify the HMAC, verify the state nonce against the cookie we set, exchange the
 * code for an offline access token, store it encrypted, link the shop, register the
 * webhooks, and sign the merchant in.
 *
 * Order matters: the token is stored before webhooks are registered, so a
 * registration failure leaves a usable shop the merchant can retry from rather than
 * an install that has to be started over. The backfill is left to the tick — a
 * 90-day import does not belong inside an OAuth redirect.
 */

import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { env, shopifyConfigured } from "@/lib/env";
import { linkShop, signInMerchant } from "@/lib/install";
import { exchangeCode, isValidShopDomain, verifyOAuthHmac } from "@/lib/shopify";
import { adminFor, WEBHOOK_ADDRESS } from "@/lib/shopify-admin";
import { decodeState, SHOPIFY_STATE_COOKIE } from "@/lib/shopify-oauth-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fail(reason: string): Response {
  return Response.redirect(`${env.appUrl}/connect?shopify=${reason}`, 302);
}

export async function GET(req: NextRequest): Promise<Response> {
  if (!shopifyConfigured()) return fail("unconfigured");

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
  const expected = decodeState(jar.get(SHOPIFY_STATE_COOKIE)?.value);
  if (!expected || expected.nonce !== query.state || expected.shop !== shop) {
    return fail("bad_state");
  }
  jar.delete(SHOPIFY_STATE_COOKIE);

  let token: { accessToken: string; scope: string };
  try {
    token = await exchangeCode(shop, code);
  } catch (err) {
    console.error("[shopify] token exchange failed", err);
    return fail("exchange_failed");
  }

  // If someone is already signed in, the shop attaches to their account rather
  // than creating a second one nobody can find.
  const session = await getSession();

  const linked = await linkShop({
    shop,
    accessToken: token.accessToken,
    scope: token.scope,
    merchantId: session?.merchantId ?? null,
  });

  // The shop's own details, for naming and the digest recipient. Best effort: the
  // domain is a serviceable name and this must not fail an install.
  try {
    const admin = adminFor(linked.shop);
    const info = await admin.fetchShopInfo();
    const { getDb } = await import("@/db");
    const { shops } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    await getDb()
      .update(shops)
      .set({
        name: info.name,
        email: info.email,
        timezone: info.timezone,
        currency: info.currency,
        updatedAt: new Date(),
      })
      .where(eq(shops.id, linked.shop.id));
  } catch (err) {
    console.warn("[shopify] could not read shop details", err);
  }

  let webhookNote = "";
  try {
    const admin = adminFor(linked.shop);
    const results = await admin.registerWebhooks(WEBHOOK_ADDRESS());
    const failed = results.filter((r) => !r.ok).map((r) => r.topic);
    if (failed.length) {
      console.warn(`[shopify] webhook registration failed for ${failed.join(", ")}`);
      webhookNote = "&webhooks=partial";
    }
  } catch (err) {
    console.warn("[shopify] webhook registration threw", err);
    webhookNote = "&webhooks=partial";
  }

  await signInMerchant(linked.merchantId);

  return Response.redirect(
    `${env.appUrl}/reorder?installed=${encodeURIComponent(shop)}${webhookNote}`,
    302,
  );
}
