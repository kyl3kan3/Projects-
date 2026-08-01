/**
 * Route protection. A cheap gate, not the authority: it only checks that a
 * session cookie verifies, and every page resolves the real user and org itself.
 *
 * The punch endpoints are deliberately NOT listed here. They authenticate on
 * their own and must stay reachable from a service worker retry, which does not
 * follow redirects to a login page.
 */

import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const CREW = ["/clock", "/hours", "/profile"];
const OFFICE = ["/jobs", "/crew", "/review", "/export", "/sites", "/settings"];

function matches(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isCrew = matches(pathname, CREW);
  const isOffice = matches(pathname, OFFICE);
  if (!isCrew && !isOffice) return NextResponse.next();

  const token = req.cookies.get("crewclock_session")?.value;
  const secret = process.env.AUTH_SECRET;
  if (token && secret) {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
      const role = payload.role as string;
      // A crew session may not read the office screens. The office may open the
      // crew screens — on a small crew the owner is on the tools too.
      if (isOffice && role === "crew") {
        const url = req.nextUrl.clone();
        url.pathname = "/clock";
        url.search = "";
        return NextResponse.redirect(url);
      }
      return NextResponse.next();
    } catch {
      // Fall through: expired or tampered token.
    }
  }

  const url = req.nextUrl.clone();
  // Send crew to the door they know — a code and a PIN, not an email login.
  url.pathname = isCrew ? "/join" : "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/clock/:path*",
    "/hours/:path*",
    "/profile/:path*",
    "/jobs/:path*",
    "/crew/:path*",
    "/review/:path*",
    "/export/:path*",
    "/sites/:path*",
    "/settings/:path*",
  ],
};
