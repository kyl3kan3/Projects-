/**
 * Route protection. This only checks that a session cookie verifies — the pages
 * resolve the user and organization themselves, so it is a cheap gate, not the
 * authority.
 *
 * `/api/calendar/*` is deliberately absent: a calendar poller has no cookie, and
 * a subscription that stops working every time a session expires is worse than no
 * subscription. Its access rule is the signed token, checked in the route itself.
 */

import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PROTECTED = [
  "/pipeline",
  "/discovery",
  "/calendar",
  "/library",
  "/settings",
  "/onboarding",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  const token = req.cookies.get("grantgrid_session")?.value;
  const secret = process.env.AUTH_SECRET;
  if (token && secret) {
    try {
      await jwtVerify(token, new TextEncoder().encode(secret));
      return NextResponse.next();
    } catch {
      // Fall through: expired or tampered token.
    }
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/pipeline/:path*",
    "/discovery/:path*",
    "/calendar/:path*",
    "/library/:path*",
    "/settings/:path*",
    "/onboarding/:path*",
  ],
};
