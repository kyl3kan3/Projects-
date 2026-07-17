/**
 * src/lib/auth.ts
 *
 * Two authentication surfaces (ARCHITECTURE.md "Auth"):
 *  1. Office users: Auth.js (NextAuth v5) real accounts with roles.
 *  2. Drivers: signed, revocable driver tokens (jose) delivered by SMS --
 *     no app install, no password, ever. One standing token per driver.
 *
 * TODO:
 * - [ ] NextAuth v5 config: email magic-link provider (Resend) + optional
 *       Google; Drizzle adapter; session carries { userId, fleetId, role }.
 * - [ ] requireUser(): server-side session guard for dashboard routes.
 * - [ ] mintDriverToken(driverId): HS256 JWT via jose, signed with
 *       env.driverTokenSecret, long-lived; store only the token hash on
 *       the driver row (drivers.driver_token_hash).
 * - [ ] verifyDriverToken(token): verify signature + hash match ->
 *       { driverId, fleetId }; revoked (rotated hash) tokens fail.
 * - [ ] rotateDriverToken(driverId): re-mint on request or offboarding;
 *       audit-log every mint/revoke.
 */

export interface SessionUser {
  userId: string;
  fleetId: string;
  role: "owner" | "dispatcher";
}

export interface DriverTokenClaims {
  driverId: string;
  fleetId: string;
}

/** Server-side guard for dashboard routes; redirects to sign-in when absent. */
export async function requireUser(): Promise<SessionUser> {
  throw new Error("Not implemented");
}

/** Mint a signed standing link token for a driver. */
export async function mintDriverToken(_driverId: string): Promise<string> {
  throw new Error("Not implemented");
}

/** Verify a driver token from /drive/[token]; null when invalid or revoked. */
export async function verifyDriverToken(
  _token: string,
): Promise<DriverTokenClaims | null> {
  throw new Error("Not implemented");
}
