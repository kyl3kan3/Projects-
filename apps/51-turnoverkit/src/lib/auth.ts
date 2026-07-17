/**
 * src/lib/auth.ts
 *
 * Two authentication surfaces (ARCHITECTURE.md "Auth"):
 *  1. Hosts: Auth.js (NextAuth v5) real accounts with roles.
 *  2. Cleaners: signed, revocable, expiring job tokens (jose) -- no app
 *     install, no password, ever. One token per turnover assignment.
 *
 * TODO:
 * - [ ] NextAuth v5 config: email magic-link provider (Resend) + optional
 *       Google; Drizzle adapter; session carries { userId, hostId, role }.
 * - [ ] requireUser(): server-side session guard for dashboard routes.
 * - [ ] mintJobToken(turnoverId, cleanerId): HS256 JWT via jose, signed
 *       with env.jobTokenSecret, exp = window end + 48h; store only the
 *       token hash on the turnover (turnovers.job_token_hash).
 * - [ ] verifyJobToken(token): verify signature + expiry + hash match ->
 *       { turnoverId, cleanerId }; revoked (rotated hash) tokens fail.
 * - [ ] rotateJobToken(turnoverId): re-mint on reassignment; audit-log
 *       every mint/revoke.
 */

export interface SessionUser {
  userId: string;
  hostId: string;
  role: "owner" | "manager";
}

export interface JobTokenClaims {
  turnoverId: string;
  cleanerId: string;
}

/** Server-side guard for dashboard routes; redirects to sign-in when absent. */
export async function requireUser(): Promise<SessionUser> {
  throw new Error("Not implemented");
}

/** Mint a signed job link token for a cleaner's turnover assignment. */
export async function mintJobToken(
  _turnoverId: string,
  _cleanerId: string,
): Promise<string> {
  throw new Error("Not implemented");
}

/** Verify a job token from /clean/[token]; null when invalid, expired, or revoked. */
export async function verifyJobToken(
  _token: string,
): Promise<JobTokenClaims | null> {
  throw new Error("Not implemented");
}
