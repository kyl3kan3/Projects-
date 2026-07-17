/**
 * src/lib/cache.ts — expo-sqlite cache so the Line renders instantly.
 *
 * Tables: series_points, accounts_snapshot, meta (last sync). Server
 * is the source of truth; the cache reconciles after every fetch.
 *
 * TODO: openDatabaseSync, migrations, upsertSeries/readSeries,
 * upsertAccounts/readAccounts, clearAll (sign-out + delete-my-data).
 */

export function readCachedSeries(): Array<{ month: string; netWorthCents: number }> {
  throw new Error("Not implemented");
}

export function clearAll(): void {
  throw new Error("Not implemented");
}
