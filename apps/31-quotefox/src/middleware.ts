/**
 * Route protection: a cheap cookie check, not the authority — the pages resolve
 * the user and organization themselves.
 *
 * The hosted proposal path and the upload-grant endpoint are deliberately public
 * and must never be touched by this: a homeowner has no cookie, and a phone
 * uploading a walkthrough chunk is authorised by the signed grant in its URL.
 */

import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PROTECTED = ["/jobs", "/estimates", "/price-book", "/proposals", "/settings", "/onboarding"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  const token = req.cookies.get("quotefox_session")?.value;
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
    "/jobs/:path*",
    "/estimates/:path*",
    "/price-book/:path*",
    "/proposals/:path*",
    "/settings/:path*",
    "/onboarding",
  ],
};
