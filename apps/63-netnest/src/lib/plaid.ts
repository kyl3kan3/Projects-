/**
 * src/lib/plaid.ts — Plaid Link flow (react-native-plaid-link-sdk).
 *
 * TODO:
 * - [ ] linkAccount(): api.createLinkToken -> open Link -> on success
 *       api.exchangePublicToken -> refresh accounts + series.
 * - [ ] Reauth flow: update-mode link token for items flagged
 *       reauth_needed.
 * - [ ] Free-tier gate: the 4th link routes to /paywall BEFORE Link
 *       opens (no wasted Plaid sessions).
 */

export async function linkAccount(): Promise<{ linked: boolean }> {
  throw new Error("Not implemented");
}
