/**
 * Route protection. It only checks that the session cookie verifies — the pages
 * resolve the user and account themselves, so this is a cheap gate, not the
 * authority.
 *
 * `/q/[token]` is deliberately absent and must stay absent: the customer signing a
 * contract has no cookie and never will, and their link is the whole credential.
 */

import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PROTECTED = [
  "/dashboard",
  "/orders",
  "/items",
  "/calendar",
  "/runs",
  "/returns",
  "/customers",
  "/settings",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!PROTECTED.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  const token = request.cookies.get("rigrent_session")?.value;
  const secret = process.env.SESSION_SECRET;
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
  matcher: [
    "/dashboard/:path*",
    "/orders/:path*",
    "/items/:path*",
    "/calendar/:path*",
    "/runs/:path*",
    "/returns/:path*",
    "/customers/:path*",
    "/settings/:path*",
  ],
};
