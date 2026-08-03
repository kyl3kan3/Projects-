/**
 * Route protection. It only checks that a session cookie verifies — the pages
 * resolve the user and company themselves, so this is a cheap gate, not the
 * authority.
 *
 * Deliberately outside the matcher, and this is the important part: `/crew/*`
 * (the foreman's link, which carries no cookie by design), `/api/sync` (the same
 * token is the authorisation), `/api/cron/tick` (CRON_SECRET) and
 * `/api/webhooks/stripe` (signature-verified). A middleware that touched any of
 * those would break the product for the person it was built for.
 */

import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

export async function middleware(req: NextRequest) {
  const token = req.cookies.get("safetydeck_session")?.value;
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
    "/talks/:path*",
    "/incidents/:path*",
    "/certs/:path*",
    "/binder/:path*",
    "/settings/:path*",
    "/api/objects/:path*",
    "/api/forms/:path*",
    "/api/binder/:path*",
    "/api/attendance/:path*",
  ],
};
