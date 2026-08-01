/**
 * GitHub OAuth — the sign-in path most of the target audience already has.
 *
 * Implemented directly against GitHub's web flow rather than through an auth
 * framework, because the session is already a signed cookie (src/lib/auth.ts)
 * and adding a second notion of "signed in" to a product that holds production
 * database credentials is not a trade worth making.
 *
 * The whole feature is gated on GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET being
 * present: with no app configured, the button does not render and the routes
 * return 404 rather than a broken redirect.
 */

import { randomBytes } from "node:crypto";
import { has } from "@/lib/env";

export const GITHUB_STATE_COOKIE = "vaultback_oauth_state";

export function githubConfigured(): boolean {
  return has("GITHUB_CLIENT_ID") && has("GITHUB_CLIENT_SECRET");
}

export function newState(): string {
  return randomBytes(16).toString("hex");
}

export function authorizeUrl(state: string, redirectUri: string): string {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", redirectUri);
  // read:user + user:email is the least we can ask for and still know who this is.
  url.searchParams.set("scope", "read:user user:email");
  url.searchParams.set("state", state);
  return url.toString();
}

export interface GithubProfile {
  githubId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export class GithubAuthError extends Error {}

async function exchangeCode(code: string, redirectUri: string): Promise<string> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) throw new GithubAuthError(`GitHub token exchange failed (${res.status})`);
  const body = (await res.json()) as { access_token?: string; error_description?: string };
  if (!body.access_token) {
    throw new GithubAuthError(body.error_description || "GitHub did not return an access token");
  }
  return body.access_token;
}

/** Fetch the profile, including a verified email even when it is private. */
export async function fetchGithubProfile(
  code: string,
  redirectUri: string,
): Promise<GithubProfile> {
  const token = await exchangeCode(code, redirectUri);
  const headers = {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "user-agent": "vaultback",
  };

  const userRes = await fetch("https://api.github.com/user", { headers });
  if (!userRes.ok) throw new GithubAuthError(`GitHub profile request failed (${userRes.status})`);
  const profile = (await userRes.json()) as {
    id: number;
    login: string;
    name: string | null;
    email: string | null;
    avatar_url: string | null;
  };

  let email = profile.email;
  if (!email) {
    const emailRes = await fetch("https://api.github.com/user/emails", { headers });
    if (emailRes.ok) {
      const emails = (await emailRes.json()) as {
        email: string;
        primary: boolean;
        verified: boolean;
      }[];
      email =
        emails.find((e) => e.primary && e.verified)?.email ??
        emails.find((e) => e.verified)?.email ??
        null;
    }
  }
  if (!email) {
    throw new GithubAuthError(
      "GitHub gave us no verified email address. Add one to your GitHub account, or sign up with email and password.",
    );
  }

  return {
    githubId: String(profile.id),
    email,
    name: profile.name ?? profile.login,
    avatarUrl: profile.avatar_url,
  };
}
