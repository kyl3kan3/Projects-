/**
 * Route protection. Only checks that a session cookie verifies — the pages themselves
 * resolve the merchant and the shop, so this is a cheap gate, not the authority.
 *
 * Deliberately outside the matcher: `/api/webhooks/shopify` (authenticated by HMAC,
 * and Shopify sends no cookie), `/api/shopify/*` (the install flow, which is where a
 * session comes *from*), and `/api/cron/tick` (authenticated by CRON_SECRET). A
 * middleware that touched any of those would break the product.
 */

import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

export async function middleware(req: NextRequest) {
  const token = req.cookies.get("shelfsense_session")?.value;
  const secret = process.env.AUTH_SECRET;

  if (token && secret) {
    try {
      await jwtVerify(token, new TextEncoder().encode(secret));
      return NextResponse.next();
    } catch {
      // Expired or tampered: fall through to the redirect.
    }
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/reorder/:path*",
    "/dead-stock/:path*",
    "/po/:path*",
    "/suppliers/:path*",
    "/settings/:path*",
    "/connect",
    "/api/po/:path*",
  ],
};
