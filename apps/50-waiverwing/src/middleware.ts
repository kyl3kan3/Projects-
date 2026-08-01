/**
 * Route protection. Only checks that a session cookie verifies — the pages
 * resolve the user and account themselves, so this is a cheap gate, not the
 * authority.
 *
 * /sign and /kiosk are deliberately public and must never be touched by this: a
 * customer signing a waiver has no account, and a counter tablet holds a
 * location-scoped kiosk cookie that this would not recognise. Locking either one
 * behind a staff session would break the product at the counter.
 */

import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PROTECTED = ["/checkin", "/participants", "/waivers", "/incidents", "/settings"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const token = req.cookies.get("waiverwing_session")?.value;
  const secret = process.env.AUTH_SECRET;
  if (token && secret) {
    try {
      await jwtVerify(token, new TextEncoder().encode(secret));
      return NextResponse.next();
    } catch {
      // Fall through: expired or tampered token.
    }
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/checkin/:path*",
    "/participants/:path*",
    "/waivers/:path*",
    "/incidents/:path*",
    "/settings/:path*",
  ],
};
