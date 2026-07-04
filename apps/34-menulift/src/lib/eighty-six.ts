/**
 * src/lib/eighty-six.ts
 *
 * One-tap 86ing: the service-truth path that bypasses draft/publish by
 * design. A flip writes an event row and immediately revalidates every live
 * guest menu containing the item -- target: live within 10 seconds.
 *
 * TODO:
 * - [ ] eightySix(itemId, actor, note?): set is_eighty_sixed, insert
 *       eighty_six_events row, revalidate affected /m/[slug] paths.
 * - [ ] restore(itemId, actor): stamp restored_at, revalidate again.
 * - [ ] Revalidation rate limit: coalesce to max 1 call per location per 2s
 *       (trailing) so a frantic night of taps never stampedes ISR.
 * - [ ] tonightCount(locationId): the "3 items 86'd tonight" mono counter,
 *       reset at the location's local service rollover (4am default).
 * - [ ] Nightly auto-restore scan (worker repeatable, per-location timezone)
 *       for events with restore_mode = nightly_auto.
 * - [ ] Staff access: PIN-scoped board session (no full login at the expo
 *       station), actor recorded as the PIN member.
 */

export type RestoreMode = "manual" | "nightly_auto";

export interface EightySixResult {
  itemId: string;
  eightySixedAt: Date;
  revalidatedPaths: string[];
}

export function eightySix(
  _itemId: string,
  _actorId: string,
  _note?: string,
): Promise<EightySixResult> {
  throw new Error("Not implemented");
}

export function restore(_itemId: string, _actorId: string): Promise<void> {
  throw new Error("Not implemented");
}

export function tonightCount(_locationId: string): Promise<number> {
  throw new Error("Not implemented");
}
