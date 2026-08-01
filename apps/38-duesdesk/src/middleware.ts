/**
 * Route protection. Only checks that the session cookie verifies — the pages
 * resolve the user, the association, and the role themselves, so this is a cheap
 * gate, not the authority.
 *
 * `/pay/[token]` is deliberately untouched: a household has no cookie and never
 * will. That path is the product's whole adoption story and its own token check
 * is the authority there.
 */

import { NextResponse, type NextRequest } from "next/server";
// Subpath import: pulling the whole `jose` barrel into the Edge middleware drags
// in its JWE decrypt path, which references DecompressionStream and warns at
// build time. HS256 verification needs none of it.
import { jwtVerify } from "jose/jwt/verify";

const PROTECTED = ["/dues", "/roster", "/issues", "/announce", "/documents", "/settings"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  const token = req.cookies.get("duesdesk_session")?.value;
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
    "/dues/:path*",
    "/roster/:path*",
    "/issues/:path*",
    "/announce/:path*",
    "/documents/:path*",
    "/settings/:path*",
  ],
};
