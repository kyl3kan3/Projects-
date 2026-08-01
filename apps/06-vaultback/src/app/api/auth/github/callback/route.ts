/**
 * GitHub OAuth callback: verify state, exchange the code, sign the user in.
 *
 * Failures land on /login with a readable message rather than a stack trace —
 * "GitHub gave us no verified email address" is actionable, a 500 is not.
 */

import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { setSessionCookie, upsertGithubUser } from "@/lib/auth";
import { GITHUB_STATE_COOKIE, fetchGithubProfile, githubConfigured } from "@/lib/github";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function back(message: string): Response {
  const url = new URL(`${env.appUrl}/login`);
  url.searchParams.set("error", message);
  return Response.redirect(url.toString(), 302);
}

export async function GET(req: NextRequest): Promise<Response> {
  if (!githubConfigured()) {
    return new Response("GitHub sign-in is not configured on this deployment", { status: 404 });
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const jar = await cookies();
  const expected = jar.get(GITHUB_STATE_COOKIE)?.value;
  jar.delete(GITHUB_STATE_COOKIE);

  if (!code) return back("GitHub did not return an authorization code");
  if (!state || !expected || state !== expected) {
    return back("That sign-in link expired. Try again.");
  }

  try {
    const profile = await fetchGithubProfile(code, `${env.appUrl}/api/auth/github/callback`);
    const { user, created } = await upsertGithubUser(profile);
    await setSessionCookie({ userId: user.id, email: user.email });
    return Response.redirect(`${env.appUrl}${created ? "/vault/new?first=1" : "/vault"}`, 302);
  } catch (err) {
    console.error("[github] sign-in failed", err);
    return back(err instanceof Error ? err.message : "GitHub sign-in failed");
  }
}
