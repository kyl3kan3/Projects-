/**
 * Route protection. Verifies only that a session cookie is valid — the pages
 * resolve the user themselves, so this is a cheap gate, not the authority.
 *
 * `/d/{token}` is deliberately absent: a client has no cookie, and the document
 * link is the whole point of the product. Its access rules live in
 * src/lib/esign.ts and are enforced on every request to that route.
 */

import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PROTECTED = ["/chain", "/documents", "/income", "/settings"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  const token = req.cookies.get("papertrail_session")?.value;
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
  matcher: ["/chain/:path*", "/documents/:path*", "/income/:path*", "/settings/:path*"],
};
