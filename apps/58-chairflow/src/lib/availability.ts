/**
 * src/lib/availability.ts
 *
 * Real availability for the booking page: working hours minus existing
 * appointments minus external calendar busy blocks (Book tier), stepped
 * to the service's duration. Availability honesty is a product law —
 * a slot shown is a slot bookable.
 *
 * TODO:
 * - [ ] openSlots(stylistId, serviceId, dateRange): compute in the
 *       stylist's timezone (date-fns-tz); 15-minute step; respect
 *       min-notice from settings.
 * - [ ] Overlap re-check inside the booking transaction (the slot may
 *       have been claimed between render and submit) — return a
 *       "just missed it" error, never a double booking.
 * - [ ] Busy-block mask from Google Calendar sync when connected.
 */

export interface Slot {
  startsAt: Date;
  endsAt: Date;
}

export async function openSlots(
  stylistId: string,
  serviceId: string,
  from: Date,
  to: Date,
): Promise<Slot[]> {
  throw new Error("Not implemented");
}

export async function assertSlotStillOpen(
  stylistId: string,
  startsAt: Date,
  endsAt: Date,
): Promise<void> {
  throw new Error("Not implemented");
}
