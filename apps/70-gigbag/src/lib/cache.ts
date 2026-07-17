/**
 * src/lib/cache.ts — expo-sqlite cache: gigs, songs, setlists render
 * instantly in signal-dead green rooms; server reconciles.
 *
 * TODO: openDatabaseSync, migrations, upsert/read per entity,
 * clearAll on sign-out.
 */

export function readCachedGigs(): Array<{ id: string; title: string; date: string }> {
  throw new Error("Not implemented");
}

export function clearAll(): void {
  throw new Error("Not implemented");
}
