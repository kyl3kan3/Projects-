/**
 * Route protection for the console.
 *
 * Only checks that the session cookie verifies — the pages resolve the user, the
 * club and the role themselves, so this is a cheap gate, not the authority.
 *
 * `/p/[token]`, `/register/[season]`, `/checkout/[token]` and `/api/ical` are
 * deliberately untouched: a parent has no cookie and never will, and each of those
 * paths does its own token check, which is the authority there.
 */

import { NextResponse, type NextRequest } from "next/server";
// Subpath import: pulling the whole `jose` barrel into Edge middleware drags in
// its JWE decrypt path, which references DecompressionStream and warns at build
// time. HS256 verification needs none of it.
import { jwtVerify } from "jose/jwt/verify";

const PROTECTED = [
  "/season",
  "/registrations",
  "/rosters",
  "/schedule",
  "/comms",
  "/volunteers",
  "/settings",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const token = req.cookies.get("rosterrally_session")?.value;
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
    "/season/:path*",
    "/registrations/:path*",
    "/rosters/:path*",
    "/schedule/:path*",
    "/comms/:path*",
    "/volunteers/:path*",
    "/settings/:path*",
  ],
};
