/**
 * A cheap gate, not the authority.
 *
 * It checks only that a session cookie verifies. The pages resolve the owner
 * themselves and every query is scoped by owner id — that is where access control
 * actually lives. The token-authenticated tenant path (/t) is deliberately
 * untouched: a tenant signing a lease at the gate has no cookie and never will.
 */

import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PROTECTED = ["/map", "/units", "/delinquency", "/liens", "/rates", "/reports", "/settings"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  const token = req.cookies.get("unitkeeper_session")?.value;
  const secret = process.env.SESSION_SECRET;
  if (token && secret) {
    try {
      await jwtVerify(token, new TextEncoder().encode(secret));
      return NextResponse.next();
    } catch {
      // Expired or tampered with — fall through to the redirect.
    }
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/map/:path*",
    "/units/:path*",
    "/delinquency/:path*",
    "/liens/:path*",
    "/rates/:path*",
    "/reports/:path*",
    "/settings/:path*",
  ],
};
