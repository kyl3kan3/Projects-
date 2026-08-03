/**
 * Route protection.
 *
 * A cheap gate, not the authority: it verifies the session cookie's signature and nothing
 * else. The pages resolve the user themselves, and every data function filters on an
 * `organizationId` — which is where tenancy is actually enforced.
 *
 * `/report/print/[id]` is deliberately absent: the PDF renderer reaches it with a signed
 * token and no cookie, and the route checks that token itself.
 */

import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PROTECTED = [
  "/footprint",
  "/documents",
  "/review",
  "/spend",
  "/report",
  "/answers",
  "/audit",
  "/settings",
  "/onboarding",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/report/print/")) return NextResponse.next();
  if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const token = req.cookies.get("greentally_session")?.value;
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
    "/footprint/:path*",
    "/documents/:path*",
    "/review/:path*",
    "/spend/:path*",
    "/report/:path*",
    "/answers/:path*",
    "/audit/:path*",
    "/settings/:path*",
    "/onboarding/:path*",
  ],
};
