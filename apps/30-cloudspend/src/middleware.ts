/**
 * Route protection. This only checks that a session cookie verifies — the pages
 * themselves resolve the user and org, so this is a cheap gate rather than the
 * authority.
 *
 * The webhook and cron paths are deliberately public and must never be matched
 * here: a GitHub deploy webhook has no cookie, Slack's interactivity POST has no
 * cookie, and the trend image is fetched by Slack's image proxy.
 */

import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PROTECTED = [
  "/watch",
  "/anomalies",
  "/deploys",
  "/waste",
  "/budgets",
  "/connect",
  "/settings",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  const token = req.cookies.get("cloudspend_session")?.value;
  const secret = process.env.AUTH_SECRET;
  if (token && secret) {
    try {
      await jwtVerify(token, new TextEncoder().encode(secret));
      return NextResponse.next();
    } catch {
      // Fall through to the redirect: an expired or tampered token.
    }
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/watch/:path*",
    "/anomalies/:path*",
    "/deploys/:path*",
    "/waste/:path*",
    "/budgets/:path*",
    "/connect/:path*",
    "/settings/:path*",
  ],
};
