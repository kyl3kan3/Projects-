/**
 * Route protection for the staff console.
 *
 * Only checks that the session cookie verifies — the pages resolve the user, the
 * school and the role themselves, so this is a cheap gate, not the authority.
 *
 * `/kiosk/[deviceToken]` and `/api/kiosk/*` are deliberately untouched: the door
 * tablet has no cookie and never will, and the device token is the authority
 * there. That is the whole point of a credential-free kiosk.
 */

import { NextResponse, type NextRequest } from "next/server";
// Subpath import: pulling the whole `jose` barrel into Edge middleware drags in
// its JWE decrypt path, which references DecompressionStream and warns at build
// time. HS256 verification needs none of it.
import { jwtVerify } from "jose/jwt/verify";

const PROTECTED = [
  "/roster",
  "/gradings",
  "/retention",
  "/billing",
  "/curriculum",
  "/schedule",
  "/announce",
  "/settings",
  "/setup",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const token = req.cookies.get("matpass_session")?.value;
  const secret = process.env.AUTH_SECRET || "matpass-dev-secret-not-for-production";
  if (token) {
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
    "/roster/:path*",
    "/gradings/:path*",
    "/retention/:path*",
    "/billing/:path*",
    "/curriculum/:path*",
    "/schedule/:path*",
    "/announce/:path*",
    "/settings/:path*",
    "/setup/:path*",
  ],
};
