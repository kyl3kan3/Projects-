/**
 * Route protection.
 *
 * A cheap gate, not the authority: it verifies the session cookie's signature and
 * nothing else. The pages themselves resolve the user, and every data function
 * takes a `practiceId` and filters on it, which is where tenancy is actually
 * enforced.
 *
 * `/intake/[token]` is deliberately public and must never be added here: a
 * patient has no account, and their link is their whole credential.
 */

import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PROTECTED = ["/intakes", "/forms", "/patients", "/audit", "/settings"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  const token = req.cookies.get("formforge_session")?.value;
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
    "/intakes/:path*",
    "/forms/:path*",
    "/patients/:path*",
    "/audit/:path*",
    "/settings/:path*",
  ],
};
