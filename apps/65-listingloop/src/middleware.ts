/**
 * Route protection. Only checks that a session cookie verifies — the pages
 * themselves resolve the user and account, so this is a cheap gate, not the
 * authority.
 *
 * The party portal and the Stripe webhook are deliberately public and must never
 * be touched by this: a party has no cookie, and refusing their upload is the
 * failure this product exists to remove.
 */

import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PROTECTED = ["/deals", "/templates", "/commissions", "/settings"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  const token = req.cookies.get("listingloop_session")?.value;
  const secret = process.env.SESSION_SECRET;
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
  matcher: ["/deals/:path*", "/templates/:path*", "/commissions/:path*", "/settings/:path*"],
};
