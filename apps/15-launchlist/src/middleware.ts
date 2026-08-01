/**
 * Two jobs.
 *
 * 1. **Host resolution.** A launch page can be reached three ways: the always-
 *    available path form (`/l/{slug}`), the wildcard subdomain
 *    (`{slug}.launchlist.app`), and a founder's own domain
 *    (`waitlist.ledgerly.com`). The subdomain carries the slug in the host, so it
 *    rewrites here. A custom domain needs a database lookup, which the edge
 *    runtime cannot do, so an unrecognised host is rewritten to `/d/{host}` — a
 *    Node-runtime route that resolves the domain and renders the same page.
 *
 * 2. **Route protection.** Only checks that a session cookie verifies; the pages
 *    resolve the user themselves, so this is a cheap gate, not the authority.
 *
 * Public paths — hosted pages, verify, unsubscribe, the signup API — are never
 * gated: a visitor confirming their email has no session and never will.
 */

import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PROTECTED = ["/dashboard", "/lists", "/settings"];

/** Hosts that are the app itself rather than somebody's launch page. */
function isAppHost(host: string): boolean {
  const clean = host.split(":")[0].toLowerCase();
  if (clean === "localhost" || clean === "127.0.0.1" || clean.endsWith(".local")) return true;
  if (clean.endsWith(".vercel.app")) return true;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    try {
      if (new URL(appUrl).hostname.toLowerCase() === clean) return true;
    } catch {
      // A malformed NEXT_PUBLIC_APP_URL should not make every host a page host.
      return true;
    }
  }

  const pagesDomain = process.env.NEXT_PUBLIC_PAGES_DOMAIN;
  if (pagesDomain && (clean === pagesDomain || clean === `www.${pagesDomain}`)) return true;

  return false;
}

/** `ledgerly.launchlist.app` → `ledgerly`. */
function subdomainSlug(host: string): string | null {
  const pagesDomain = process.env.NEXT_PUBLIC_PAGES_DOMAIN;
  if (!pagesDomain) return null;
  const clean = host.split(":")[0].toLowerCase();
  if (!clean.endsWith(`.${pagesDomain}`)) return null;
  const label = clean.slice(0, -(pagesDomain.length + 1));
  if (!label || label === "www" || label.includes(".")) return null;
  return label;
}

/** Only the two paths a launch page occupies are host-resolved. */
function pagePath(pathname: string): string | null {
  if (pathname === "/") return "";
  if (/^\/joined\/[A-Za-z0-9]+$/.test(pathname)) return pathname;
  return null;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = req.headers.get("host") ?? "";
  const suffix = pagePath(pathname);

  if (suffix !== null) {
    const slug = subdomainSlug(host);
    if (slug) {
      const url = req.nextUrl.clone();
      url.pathname = `/l/${slug}${suffix}`;
      return NextResponse.rewrite(url);
    }
    if (!isAppHost(host)) {
      const url = req.nextUrl.clone();
      url.pathname = `/d/${encodeURIComponent(host.split(":")[0].toLowerCase())}${suffix}`;
      return NextResponse.rewrite(url);
    }
  }

  if (!PROTECTED.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return NextResponse.next();
  }

  const token = req.cookies.get("launchlist_session")?.value;
  const secret = process.env.AUTH_SECRET;
  if (token && secret) {
    try {
      await jwtVerify(token, new TextEncoder().encode(secret));
      return NextResponse.next();
    } catch {
      // Expired or tampered — fall through to the redirect.
    }
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/", "/joined/:path*", "/dashboard/:path*", "/lists/:path*", "/settings/:path*"],
};
