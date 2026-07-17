/**
 * server/src/lib/plaid.ts
 *
 * Plaid client with balances-only scopes (Balance, Investments,
 * Liabilities — NEVER Transactions) and AES-256-GCM token handling.
 *
 * TODO:
 * - [ ] Lazy Plaid client (env PLAID_CLIENT_ID/SECRET/ENV).
 * - [ ] createLinkToken(memberId) with the three products only.
 * - [ ] exchangePublicToken(nestId, memberId, publicToken): encrypt
 *       access token (crypto.ts) before the institutions row.
 * - [ ] syncInstitution(institutionId): balances + holdings values +
 *       liabilities -> append balances rows; flip status on item
 *       errors; DRY_RUN returns fixtures.
 * - [ ] verifyWebhook(jwt): Plaid's JWK verification flow.
 */

export async function createLinkToken(memberId: string): Promise<{ linkToken: string }> {
  throw new Error("Not implemented");
}

export async function exchangePublicToken(
  nestId: string,
  memberId: string,
  publicToken: string,
): Promise<{ institutionId: string }> {
  throw new Error("Not implemented");
}

export async function syncInstitution(institutionId: string): Promise<{ accounts: number }> {
  throw new Error("Not implemented");
}
