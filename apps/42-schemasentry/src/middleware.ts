/**
 * Route protection. This only checks that a session cookie verifies — the pages
 * resolve the user and organization themselves, so it is a cheap gate rather than
 * the authority.
 *
 * `/api/v1/*` is deliberately absent: a CI job has no cookie, and its access rule
 * is the hashed bearer token checked inside the handler. Bouncing CI to a login
 * page would be both wrong and confusing.
 */

import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PROTECTED = ["/apis", "/settings"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!PROTECTED.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  const token = request.cookies.get("schemasentry_session")?.value;
  const secret = process.env.JWT_SECRET;
  if (token && secret) {
    try {
      await jwtVerify(token, new TextEncoder().encode(secret));
      return NextResponse.next();
    } catch {
      // Fall through: expired or tampered token.
    }
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/apis/:path*", "/settings/:path*"],
};
