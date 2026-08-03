/**
 * Route protection. A cheap gate, not the authority: it only checks that the
 * session cookie verifies, and each page still resolves the user and firm
 * through `requireFirm()`.
 *
 * The ICS feed and the Stripe webhook are deliberately excluded. A calendar
 * client has no cookie, and Stripe has no session — putting either behind this
 * would look like a working deploy right up to the first missed deadline.
 */

import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PROTECTED = [
  "/radar",
  "/pursuits",
  "/deadlines",
  "/library",
  "/profiles",
  "/settings",
  "/reports",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  const token = req.cookies.get("rfpradar_session")?.value;
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
    "/radar/:path*",
    "/pursuits/:path*",
    "/deadlines/:path*",
    "/library/:path*",
    "/profiles/:path*",
    "/settings/:path*",
    "/reports/:path*",
  ],
};
