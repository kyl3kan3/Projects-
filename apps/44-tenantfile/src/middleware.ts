/**
 * A cheap gate, not the authority.
 *
 * It checks only that a session cookie verifies; the pages themselves resolve the
 * landlord and every query is scoped by landlord id. The token-authenticated
 * public paths — /apply, /t, /screen, /sign — are deliberately untouched: a tenant
 * reporting a burst pipe has no cookie, and an applicant never gets one.
 */

import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PROTECTED = ["/units", "/rent", "/requests", "/file", "/applications", "/tenancies", "/settings"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  const token = req.cookies.get("tenantfile_session")?.value;
  const secret = process.env.AUTH_SECRET;
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
    "/units/:path*",
    "/rent/:path*",
    "/requests/:path*",
    "/file/:path*",
    "/applications/:path*",
    "/tenancies/:path*",
    "/settings/:path*",
  ],
};
