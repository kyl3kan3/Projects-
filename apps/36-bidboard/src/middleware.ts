/**
 * Route protection for the GC dashboard only. A cheap gate, not the authority: the
 * pages resolve the user and company themselves.
 *
 * `/bid/…` is deliberately absent. A sub has no session and never will — their
 * access is the signed token in the URL, checked inside `resolvePortal`, which is
 * the only place that decides what a portal may read. Putting the portal behind this
 * matcher would lock every bidder out.
 */

import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PROTECTED = ["/projects", "/subs", "/settings", "/leveling"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const token = req.cookies.get("bidboard_session")?.value;
  const secret = process.env.AUTH_SECRET;
  if (token && secret) {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
      // Portal tokens are signed with a different key entirely, but the scope claim
      // is what makes the separation explicit rather than incidental.
      if (payload.scope === "gc") return NextResponse.next();
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
  matcher: ["/projects/:path*", "/subs/:path*", "/settings/:path*", "/leveling/:path*"],
};
