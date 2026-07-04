/**
 * src/lib/tokens.ts
 *
 * Signed proposal-link tokens. Homeowners never log in: the /p/[token] URL
 * in the proposal email is the credential. JWTs (jose) signed with
 * PROPOSAL_TOKEN_SECRET, scoped to a single proposal.
 *
 * TODO:
 * - [ ] mintProposalToken(proposalId): HS256 JWT, 30-day expiry, jti stored
 *       on the proposals row so a token can be revoked (withdraw).
 * - [ ] verifyProposalToken(token): signature + expiry + jti-matches-row +
 *       proposal not withdrawn; typed result, never throws to the page.
 * - [ ] Rotate-on-resend: re-sending a proposal mints a new jti and
 *       invalidates the old link.
 * - [ ] Constant-time comparisons; no token contents beyond ids (no PII in
 *       the JWT payload).
 */

export interface ProposalTokenPayload {
  proposalId: string;
  jti: string;
}

export type TokenVerification =
  | { ok: true; payload: ProposalTokenPayload }
  | { ok: false; reason: "expired" | "invalid" | "revoked" };

export function mintProposalToken(_proposalId: string): Promise<string> {
  throw new Error("Not implemented");
}

export function verifyProposalToken(_token: string): Promise<TokenVerification> {
  throw new Error("Not implemented");
}
