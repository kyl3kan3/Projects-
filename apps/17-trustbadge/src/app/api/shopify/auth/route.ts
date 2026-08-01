/**
 * Shopify install: step one.
 *
 * Shopify sends the merchant here with `?shop=...` (and, from the App Store, an
 * HMAC over the query). We validate the shop domain, mint a state nonce into a
 * short-lived cookie, and redirect to Shopify's authorize screen.
 *
 * The state cookie is the CSRF defence for the callback: without it, an attacker
 * can complete an install against their own shop in someone else's browser.
 */

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { env, has } from "@/lib/env";
import { installUrl, isValidShopDomain, verifyOAuthHmac } from "@/lib/shopify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const STATE_COOKIE = "trustbadge_shopify_state";

export async function GET(req: NextRequest): Promise<Response> {
  if (!has("SHOPIFY_API_KEY") || !has("SHOPIFY_API_SECRET")) {
    return Response.redirect(`${env.appUrl}/settings/install?shopify=unconfigured`, 302);
  }

  const url = new URL(req.url);
  const shop = (url.searchParams.get("shop") ?? "").toLowerCase();
  if (!isValidShopDomain(shop)) {
    return Response.redirect(`${env.appUrl}/settings/install?shopify=bad_shop`, 302);
  }

  // An App-Store entry point is signed. A merchant typing their domain into our
  // own install form is not, so an absent hmac is allowed — a present one must be
  // valid.
  if (url.searchParams.has("hmac")) {
    const query: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      query[key] = value;
    });
    if (!verifyOAuthHmac(query, env.shopifyApiSecret)) {
      return Response.redirect(`${env.appUrl}/settings/install?shopify=bad_hmac`, 302);
    }
  }

  const state = randomBytes(16).toString("base64url");
  const jar = await cookies();
  jar.set(STATE_COOKIE, `${state}:${shop}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // `lax` would be dropped on Shopify's cross-site redirect back to us.
    sameSite: "none",
    path: "/",
    maxAge: 600,
  });

  return Response.redirect(installUrl(shop, state), 302);
}
