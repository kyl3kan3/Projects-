/**
 * Route protection. Verifies only that a session cookie is well-signed — the
 * pages themselves resolve the user and organization, so this is a cheap gate,
 * not the authority.
 *
 * The Stripe webhook and the cron route are deliberately outside it: one
 * authenticates by signature, the other by CRON_SECRET, and neither has a cookie.
 */

import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PROTECTED = ["/vault", "/restore", "/drills", "/settings"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  const token = req.cookies.get("vaultback_session")?.value;
  const secret = process.env.AUTH_SECRET;
  if (token && secret) {
    try {
      await jwtVerify(token, new TextEncoder().encode(secret));
      return NextResponse.next();
    } catch {
      // Fall through to the redirect: expired or tampered token.
    }
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/vault/:path*", "/restore/:path*", "/drills/:path*", "/settings/:path*"],
};
