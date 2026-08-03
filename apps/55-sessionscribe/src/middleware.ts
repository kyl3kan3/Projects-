/**
 * Route protection.
 *
 * A cheap gate, not the authority: it verifies the session cookie's signature and
 * nothing else. The pages resolve the user themselves, and every data function
 * takes a `practiceId` and filters on it — that is where tenancy is actually
 * enforced.
 */

import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PROTECTED = ["/today", "/capture", "/notes", "/clients", "/trust", "/settings"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const token = req.cookies.get("sessionscribe_session")?.value;
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
    "/today/:path*",
    "/capture/:path*",
    "/notes/:path*",
    "/clients/:path*",
    "/trust/:path*",
    "/settings/:path*",
  ],
};
