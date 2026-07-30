/**
 * Route protection. Only checks that a session cookie verifies — the pages
 * themselves resolve the user and team, so this is a cheap gate, not the
 * authority.
 *
 * The ping-ingest and status-page paths are deliberately public and must never
 * be touched by this: a heartbeat has no cookie, and a status page is the thing
 * people read when the dashboard is the last of their worries.
 */

import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PROTECTED = ["/dashboard", "/monitors", "/incidents", "/status-pages", "/settings"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  const token = req.cookies.get("pulsewatch_session")?.value;
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
  matcher: ["/dashboard/:path*", "/monitors/:path*", "/incidents/:path*", "/status-pages/:path*", "/settings/:path*"],
};
