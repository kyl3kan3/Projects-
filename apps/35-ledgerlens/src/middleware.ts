/**
 * Route protection. Only checks that a session cookie verifies — the pages themselves
 * resolve the user and organisation, so this is a cheap gate, not the authority.
 *
 * The accountant share pages and the file/webhook routes are deliberately public and
 * must never be matched here: a share link has no cookie by design, and an inbound
 * email webhook authenticates with a signature.
 */

import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PROTECTED = ["/inbox", "/review", "/capture", "/close", "/settings"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  const token = req.cookies.get("ledgerlens_session")?.value;
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
  matcher: ["/inbox/:path*", "/review/:path*", "/capture/:path*", "/close/:path*", "/settings/:path*"],
};
