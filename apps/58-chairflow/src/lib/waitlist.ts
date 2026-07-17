/**
 * src/lib/waitlist.ts
 *
 * Backfill for freed slots. Matching entries get an SMS offer with a
 * claim token; the FIRST tap claims atomically (single UPDATE ... WHERE
 * status = 'offered' guarded by the token hash) — losers see "just
 * missed it". Offers expire in 60 minutes and cascade to the next match.
 *
 * TODO:
 * - [ ] matchEntries(stylistId, slot): service + day-preference filter,
 *       FIFO by created_at.
 * - [ ] makeOffer(entryId, slot): status "offered", token minted,
 *       offer_expires_at = now + 60min, SMS via lib/messaging.
 * - [ ] claimOffer(token): atomic claim -> book through the normal flow
 *       (deposit rules + policy agreement included).
 * - [ ] expireAndCascade(): worker sweep for lapsed offers.
 */

export interface FreedSlot {
  stylistId: string;
  serviceId: string;
  startsAt: Date;
  endsAt: Date;
}

export async function offerFreedSlot(slot: FreedSlot): Promise<{ offered: boolean }> {
  throw new Error("Not implemented");
}

export async function claimOffer(token: string): Promise<{ appointmentId: string } | { missed: true }> {
  throw new Error("Not implemented");
}
