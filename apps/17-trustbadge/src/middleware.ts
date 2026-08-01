/**
 * Route protection. Only checks that a session cookie verifies — the pages
 * themselves resolve the merchant and store, so this is a cheap gate, not the
 * authority.
 *
 * Everything a shopper or a storefront touches is deliberately outside the
 * matcher: `/api/w/*` is fetched by third-party sites with no cookie, `/r/*` is
 * opened from an email, `/api/media/*` is loaded by an `<img>` on someone else's
 * page. A middleware that touched those would break the product.
 */

import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

export async function middleware(req: NextRequest) {
  const token = req.cookies.get("trustbadge_session")?.value;
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
  matcher: ["/home/:path*", "/reviews/:path*", "/widgets/:path*", "/settings/:path*"],
};
