/**
 * Route protection — a cheap gate, not the authority. Every page still resolves
 * the user and the location itself.
 *
 * What must never be touched here: `/m/[slug]` (a guest has no cookie and the
 * page must stay CDN-cacheable), `/board/[slug]` (a PIN session, checked by the
 * page), `/api/photos/*`, and the webhook and cron routes.
 */

import { NextResponse, type NextRequest } from "next/server";
import { verifyHs256 } from "@/lib/edge-jwt";

const PROTECTED = ["/menu", "/86", "/photos", "/matrix", "/qr", "/history", "/settings"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!PROTECTED.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  const token = request.cookies.get("menulift_session")?.value;
  const secret = process.env.AUTH_SECRET;
  if (token && secret) {
    const claims = await verifyHs256(token, secret);
    // A board PIN token is deliberately rejected here: it reaches the 86 board
    // and nothing else.
    if (claims?.kind === "user") return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/menu/:path*",
    "/86/:path*",
    "/photos/:path*",
    "/matrix/:path*",
    "/qr/:path*",
    "/history/:path*",
    "/settings/:path*",
  ],
};
