/**
 * Route protection for the agency dashboard only.
 *
 * This is a cheap gate, not the authority: it proves a session cookie verifies, and
 * the pages resolve the user and workspace themselves.
 *
 * The client-portal paths (`/p/…`, `/portal/…`) are deliberately absent. A client
 * has no agency session and never will; their access is a per-portal cookie checked
 * inside `resolveViewer`, which is the only place that decides what a portal may
 * read. Putting portals behind this matcher would lock every client out.
 */

import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PROTECTED = ["/dashboard", "/attention", "/compose", "/portals", "/settings"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  const token = req.cookies.get("clientdock_session")?.value;
  const secret = process.env.AUTH_SECRET;
  if (token && secret) {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
      // A portal cookie is signed with the same key; the scope claim is what stops
      // a client session from reaching the agency dashboard.
      if (payload.scope === "agency") return NextResponse.next();
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
    "/dashboard/:path*",
    "/attention/:path*",
    "/compose/:path*",
    "/portals/:path*",
    "/settings/:path*",
  ],
};
