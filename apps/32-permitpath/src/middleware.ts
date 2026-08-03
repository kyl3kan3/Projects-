/**
 * Route protection. A cheap gate, not the authority: it only checks that a session
 * cookie verifies, and every page re-resolves the user and org itself.
 *
 * The landing page, auth screens, and the cron and webhook endpoints are public by
 * design — Stripe does not carry a session cookie, and neither does Vercel Cron.
 */

import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PROTECTED = ["/jobs", "/jurisdictions", "/alerts", "/licenses", "/settings", "/admin"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  const token = req.cookies.get("permitpath_session")?.value;
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
    "/jobs/:path*",
    "/jurisdictions/:path*",
    "/alerts/:path*",
    "/licenses/:path*",
    "/settings/:path*",
    "/admin/:path*",
  ],
};
