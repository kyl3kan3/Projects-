/**
 * src/lib/deposits.ts
 *
 * Authorization-hold deposits on the operator's own Stripe Connect
 * account: manual-capture PaymentIntents held at acceptance, captured
 * ONLY against documented damage claims (partial capture, photo
 * evidence attached in metadata), released automatically on clean
 * return. Holds expire ~7 days — reauthorize() handles long rentals.
 *
 * TODO:
 * - [ ] createHold(orderId): PI (capture_method: "manual") on the
 *       Connect account, metadata { orderId, docHash }.
 * - [ ] captureClaim(claimId): partial capture of exactly the claim
 *       amount; remainder auto-releases; charges metadata carries photo
 *       keys + claim description.
 * - [ ] releaseHold(orderId): cancel the authorization; audit + receipt.
 * - [ ] reauthorize(orderId): cancel + new PI when due_back is beyond
 *       the hold's expiry; notify the customer per Stripe rules.
 */

export async function createHold(orderId: string): Promise<{ clientSecret: string }> {
  throw new Error("Not implemented");
}

export async function captureClaim(claimId: string): Promise<{ capturedCents: number }> {
  throw new Error("Not implemented");
}

export async function releaseHold(orderId: string): Promise<void> {
  throw new Error("Not implemented");
}
