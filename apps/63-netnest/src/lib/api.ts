/**
 * src/lib/api.ts — typed client for the NetNest server.
 *
 * TODO:
 * - [ ] fetch wrapper with the session token (expo-secure-store),
 *       EXPO_PUBLIC_API_URL base, zod-validated responses.
 * - [ ] Endpoints: requestMagicLink, exchangeMagicToken, getNest,
 *       getSeries, listAccounts, createLinkToken, exchangePublicToken,
 *       addManualAccount, updateBalance, closeMonth, inviteMember,
 *       exportCsv, deleteMyData.
 * - [ ] Offline: reads fall back to the SQLite cache (cache.ts).
 */

export interface SeriesPoint {
  month: string;
  netWorthCents: number;
  provisional: boolean;
}

export async function getSeries(): Promise<SeriesPoint[]> {
  throw new Error("Not implemented");
}
