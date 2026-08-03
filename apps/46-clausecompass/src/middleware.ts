/**
 * Route protection.
 *
 * A cheap gate, not the authority: it verifies the session cookie's signature and
 * nothing else. The pages resolve the user themselves, and every data function takes an
 * `accountId` and filters on it, which is where tenancy is actually enforced.
 *
 * `/r/[token]` is deliberately public and must never be added here: a share link is the
 * whole credential for a read-only report, by design.
 */

import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PROTECTED = ["/contracts", "/flags", "/redlines", "/playbook", "/settings"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  const token = req.cookies.get("clausecompass_session")?.value;
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
    "/contracts/:path*",
    "/flags/:path*",
    "/redlines/:path*",
    "/playbook/:path*",
    "/settings/:path*",
  ],
};
