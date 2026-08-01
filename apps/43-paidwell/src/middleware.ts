/**
 * Route protection — a cheap gate, not the authority. The pages resolve the user
 * and firm themselves.
 *
 * `/portal/*` is deliberately public and must never be touched here: a client's
 * accounts-payable clerk has no cookie, and the whole point of the signed link is
 * that they never need one.
 */

import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PROTECTED = [
  "/aging",
  "/invoices",
  "/sequences",
  "/approvals",
  "/promises",
  "/forecast",
  "/clients",
  "/connect",
  "/settings",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  const token = req.cookies.get("paidwell_session")?.value;
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
    "/aging/:path*",
    "/invoices/:path*",
    "/sequences/:path*",
    "/approvals/:path*",
    "/promises/:path*",
    "/forecast/:path*",
    "/clients/:path*",
    "/connect/:path*",
    "/settings/:path*",
  ],
};
