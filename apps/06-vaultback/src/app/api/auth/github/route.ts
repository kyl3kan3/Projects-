/**
 * Start the GitHub OAuth web flow.
 *
 * 404s when no GitHub app is configured, so a half-configured deployment cannot
 * send someone to a broken GitHub error page. The `state` value is stored in a
 * short-lived, httpOnly cookie and compared on the way back — without it the
 * callback would accept an authorization code from anywhere.
 */

import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { GITHUB_STATE_COOKIE, authorizeUrl, githubConfigured, newState } from "@/lib/github";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest): Promise<Response> {
  if (!githubConfigured()) {
    return new Response("GitHub sign-in is not configured on this deployment", { status: 404 });
  }

  const state = newState();
  const jar = await cookies();
  jar.set(GITHUB_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return Response.redirect(authorizeUrl(state, `${env.appUrl}/api/auth/github/callback`), 302);
}
