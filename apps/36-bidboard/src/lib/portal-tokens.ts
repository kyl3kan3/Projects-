/**
 * src/lib/portal-tokens.ts
 *
 * Signed-token auth for the no-login sub portal. Every portal URL carries
 * a JWT scoped to one invitation; the DB stores only the token hash.
 * Sub adoption depends on these links being safe AND frictionless.
 *
 * TODO:
 * - [ ] mintPortalToken(invitationId, packageId, expiresAt): jose-signed
 *       JWT (PORTAL_TOKEN_SECRET), expiry = bid due date + 7d grace.
 * - [ ] verifyPortalToken(token): signature + expiry + revocation check
 *       against invitations.token_hash; returns the invitation scope or
 *       a typed rejection (expired | revoked | invalid).
 * - [ ] rotateToken(invitationId): re-mint on due-date extension; old
 *       token hash invalidated.
 * - [ ] Scoping rule (test this hard): a token can read/write ONLY its own
 *       invitation's bid + its package's scope/plans/Q&A. Never another
 *       sub's numbers -- bid-shopping defense is existential.
 * - [ ] Rate limiting hooks: per-token request ceiling for abuse.
 * - [ ] Every verify writes an audit_log access row (caller passes intent).
 */

export interface PortalScope {
  invitationId: string;
  tradePackageId: string;
}

export function mintPortalToken(): Promise<string> {
  throw new Error("Not implemented");
}

export function verifyPortalToken(_token: string): Promise<PortalScope> {
  throw new Error("Not implemented");
}
