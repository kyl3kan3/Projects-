/**
 * src/lib/volunteers.ts
 *
 * Volunteer slot signups: per-game/per-event roles with capacity, no-login
 * claim links, and reminders. The snack bar staffs itself.
 *
 * TODO:
 * - [ ] createSlots(gameId | eventRef, roles: [{role, capacity}]).
 * - [ ] claim(slotId, linkToken): resolve household from the signed link,
 *       enforce capacity atomically (no double-claim races), confirm via
 *       the household's preferred channel.
 * - [ ] release(claimId): frees the spot, optional re-announce when a slot
 *       reopens inside 48h of the event.
 * - [ ] Reminders: T-24h to claimants; no-show marking feeds the Phase 3
 *       fairness rotation (schema ready, feature deferred).
 * - [ ] Unclaimed-slot nudges target only households with zero claims this
 *       season.
 */

export function claim(_slotId: string, _linkToken: string): Promise<void> {
  throw new Error("Not implemented");
}
