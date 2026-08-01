/**
 * Dashboard sessions.
 *
 * A signed JWT in an httpOnly cookie, per the portfolio convention (`jose`). There
 * are no passwords here and no users table: identity comes from GitHub, and what a
 * session is allowed to see is the set of installations GitHub says that person can
 * administer, captured at sign-in from `GET /user/installations`.
 *
 * Two sign-in paths:
 *
 *  - **GitHub OAuth** (production). Needs GITHUB_CLIENT_ID/SECRET from the App's
 *    settings page. UNVERIFIED in this environment: there is no GitHub App
 *    registration here, so the code exchange has never been executed.
 *  - **Dev login** (local only). Refused unless MERGEMATE_DEV_LOGIN=1 *and*
 *    NODE_ENV is not production. It exists so the dashboard can be driven end to
 *    end without a GitHub App, and it is the only reason `allInstallations` exists.
 */

import { SignJWT, jwtVerify } from "jose";
import { env } from "../lib/env";

export const SESSION_COOKIE = "mergemate_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

export interface Session {
  login: string;
  /** GitHub installation ids this person may administer. */
  installationIds: number[];
  /** Dev-login only: see every installation in the database. */
  allInstallations: boolean;
}

function secret(): Uint8Array {
  return new TextEncoder().encode(env.sessionSecret);
}

export async function signSession(session: Session): Promise<string> {
  return new SignJWT({
    login: session.login,
    installationIds: session.installationIds,
    all: session.allInstallations,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    const login = typeof payload.login === "string" ? payload.login : null;
    if (!login) return null;
    const ids = Array.isArray(payload.installationIds)
      ? payload.installationIds.filter((n): n is number => typeof n === "number")
      : [];
    return { login, installationIds: ids, allInstallations: payload.all === true };
  } catch {
    return null;
  }
}

export function canSeeInstallation(session: Session, githubInstallationId: number): boolean {
  return session.allInstallations || session.installationIds.includes(githubInstallationId);
}

export function cookieHeader(token: string, secure: boolean): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const pair of header.split(";")) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

/* ------------------------------------------------------------- oauth flow --- */

export function oauthConfigured(): boolean {
  return env.githubClientId !== "" && env.githubClientSecret !== "";
}

export function authorizeUrl(state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: env.githubClientId,
    redirect_uri: redirectUri,
    state,
    scope: "read:user",
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export interface OAuthIdentity {
  login: string;
  installationIds: number[];
}

/**
 * Exchange an OAuth code for the signing-in user's identity and installations.
 *
 * UNVERIFIED here — no GitHub App credentials exist in this environment.
 */
export async function exchangeOAuthCode(code: string, redirectUri: string): Promise<OAuthIdentity> {
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_id: env.githubClientId,
      client_secret: env.githubClientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenRes.ok) throw new Error(`GitHub token exchange failed: HTTP ${tokenRes.status}`);
  const tokenBody = (await tokenRes.json()) as { access_token?: string; error_description?: string };
  const token = tokenBody.access_token;
  if (!token) throw new Error(tokenBody.error_description ?? "GitHub returned no access token");

  const headers = {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "user-agent": "mergemate",
  };
  const userRes = await fetch("https://api.github.com/user", { headers });
  if (!userRes.ok) throw new Error(`GitHub user lookup failed: HTTP ${userRes.status}`);
  const user = (await userRes.json()) as { login?: string };

  const installsRes = await fetch("https://api.github.com/user/installations", { headers });
  const installs = installsRes.ok
    ? ((await installsRes.json()) as { installations?: { id: number }[] })
    : { installations: [] };

  return {
    login: user.login ?? "unknown",
    installationIds: (installs.installations ?? []).map((i) => i.id),
  };
}
