/**
 * src/lib/availability-core.ts
 *
 * The availability arithmetic, with no database in it.
 *
 * This file exists on its own so two things are true at once: the overlap
 * predicate and the gauge maths can be unit-tested exhaustively (same-day
 * turnarounds are the interesting case and they are all here), and a client
 * component can import the gauge shape without dragging `postgres` into the
 * browser bundle.
 *
 * The window is **half-open**: an order occupies `[outOn, dueBackOn)`. Two
 * windows overlap when `a.outOn < b.dueBackOn AND a.dueBackOn > b.outOn`.
 *
 * That is the one decision the whole product rests on, so it is worth stating
 * plainly: gear that comes back on the 9th is available again on the 9th. A yard
 * that cannot turn a load around the same day would rather not use software that
 * says it can, so the convention is the other way about — the due-back date is
 * the day the gear is expected at the yard, and it is the first day the gear is
 * free. A Saturday-only party rental is `out_on = Saturday`,
 * `due_back_on = Sunday`.
 */

export interface Window {
  outOn: string;
  dueBackOn: string;
}

/** Half-open overlap. `[a.out, a.due) ∩ [b.out, b.due) ≠ ∅`. */
export function windowsOverlap(a: Window, b: Window): boolean {
  return a.outOn < b.dueBackOn && a.dueBackOn > b.outOn;
}

/** A window is only a rental if it has at least one day in it. */
export function isValidWindow(w: Window): boolean {
  return w.outOn < w.dueBackOn;
}

export interface AvailabilityFacts {
  itemId: string;
  itemName: string;
  ownedCount: number;
  /** Quantity on booked orders overlapping the window. */
  bookedCount: number;
  /** Quantity held out of service for maintenance over the window. */
  heldCount: number;
}

export interface Gauge extends AvailabilityFacts {
  /** owned − booked − held. Can go negative if data was edited out from under a booking. */
  availableCount: number;
  /** What this quote line is asking for, if any. */
  requestedCount: number;
  /** How far past owned the request would push the total. 0 when it fits. */
  overrunCount: number;
  /** Fraction of the track that is already committed, 0…1. */
  bookedFraction: number;
  /** Fraction the request adds on top, 0…1 — the segment that animates. */
  requestedFraction: number;
  /** Fraction that does not fit, 0…1 — drawn in rust. */
  overrunFraction: number;
  overbooked: boolean;
}

/**
 * The chalk gauge, computed. `owned` is the denominator so the fraction reads
 * "32/40" the way the warehouse wall does.
 *
 * Maintenance holds are drawn inside the committed segment: from the quote
 * builder's point of view a tent in for a repair is as unavailable as a tent on
 * a truck, and splitting the bar into three greys would say something the shop
 * does not need to know at that moment.
 */
export function gauge(facts: AvailabilityFacts, requestedCount = 0): Gauge {
  const owned = Math.max(0, Math.trunc(facts.ownedCount));
  const committed = Math.max(0, Math.trunc(facts.bookedCount) + Math.trunc(facts.heldCount));
  const requested = Math.max(0, Math.trunc(requestedCount));
  const availableCount = owned - committed;
  const total = committed + requested;
  const overrunCount = Math.max(0, total - owned);
  const denominator = owned > 0 ? owned : Math.max(1, total);

  const bookedFraction = Math.min(1, committed / denominator);
  const fittingRequest = Math.max(0, Math.min(requested, owned - committed));
  const requestedFraction = Math.min(1 - bookedFraction, fittingRequest / denominator);
  const overrunFraction = Math.min(1, overrunCount / denominator);

  return {
    ...facts,
    ownedCount: owned,
    availableCount,
    requestedCount: requested,
    overrunCount,
    bookedFraction,
    requestedFraction,
    overrunFraction,
    overbooked: overrunCount > 0,
  };
}

/** `"32/40"` — the fraction printed beside the gauge, always in the mono face. */
export function gaugeFraction(g: Gauge): string {
  return `${g.bookedCount + g.heldCount + g.requestedCount}/${g.ownedCount}`;
}

export interface Conflict {
  orderId: string;
  orderNumber: number;
  customerName: string;
  quantity: number;
  outOn: string;
  dueBackOn: string;
}

/**
 * The sentence an overbooked line shows. It always names an order number,
 * because "not enough available" sends someone to a whiteboard and naming the
 * order sends them to a phone.
 */
export function overbookedSentence(g: Gauge, conflict: Conflict | null): string {
  const short = `${g.itemName}: you have ${g.ownedCount}, ${g.bookedCount + g.heldCount} already committed for this window, so ${g.requestedCount} is ${g.overrunCount} over.`;
  if (!conflict) return short;
  return `${short} Order #${conflict.orderNumber} (${conflict.customerName}) holds ${conflict.quantity}.`;
}

/**
 * A day-by-day committed count across a window, for the inventory row's
 * next-30-days mini gauge. Bookings arrive as windows; this flattens them.
 */
export function dailyCommitted(
  bookings: readonly (Window & { quantity: number })[],
  from: string,
  to: string,
  addDays: (date: string, n: number) => string,
): number[] {
  const out: number[] = [];
  let cursor = from;
  for (let i = 0; i < 400 && cursor < to; i++) {
    let total = 0;
    for (const b of bookings) {
      if (b.outOn <= cursor && b.dueBackOn > cursor) total += b.quantity;
    }
    out.push(total);
    cursor = addDays(cursor, 1);
  }
  return out;
}

/** Statuses whose lines consume inventory. */
export const BOOKED_STATUSES = ["accepted", "confirmed", "out"] as const;
