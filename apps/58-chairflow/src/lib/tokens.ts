/**
 * src/lib/tokens.ts
 *
 * Signed client-facing links (jose HMAC, env.linkTokenSecret). Three
 * kinds: manage-appointment (reschedule/cancel), nudge-booking (one-tap
 * pre-filled), waitlist-claim (first-tap wins). Each token's hash is
 * stored on its row so a single link can be revoked without rotating
 * the secret.
 *
 * TODO:
 * - [ ] mintToken(kind, subjectId, expiresIn): compact JWS with
 *       { kind, sub } claims; return { token, hash }.
 * - [ ] verifyToken(kind, token): subjectId | null; constant-time hash
 *       comparison against the stored row hash.
 * - [ ] Claim tokens are single-use: verifying a waitlist-claim token
 *       atomically flips the entry (see lib/waitlist.ts).
 */

export type TokenKind = "manage" | "nudge_booking" | "waitlist_claim";

export async function mintToken(
  kind: TokenKind,
  subjectId: string,
  expiresInSeconds: number,
): Promise<{ token: string; hash: string }> {
  throw new Error("Not implemented");
}

export async function verifyToken(kind: TokenKind, token: string): Promise<string | null> {
  throw new Error("Not implemented");
}
