/**
 * src/lib/availability.ts
 *
 * THE product: available(item, window) = owned − booked − maintenance.
 * One SQL query with date-range overlap; computed live on every quote
 * line render and RE-CHECKED inside the acceptance transaction. A
 * failed re-check blocks with the conflicting order's number — never a
 * silent oversell.
 *
 * Overlap predicate: out_on < :to AND due_back_on > :from (half-open;
 * same-day turnarounds are the test suite's centerpiece).
 *
 * TODO:
 * - [ ] availableCount(itemId, from, to): the aggregation over
 *       confirmed/out order_lines + maintenance_holds.
 * - [ ] availabilityForQuote(lines, from, to): batch version for the
 *       builder (one query, grouped).
 * - [ ] assertAvailableTx(tx, orderId): inside the acceptance
 *       transaction; throws ConflictError { conflictingOrderNumber }.
 * - [ ] gauge(item, window): { booked, owned, overrun } for the chalk
 *       gauge component.
 */

export class ConflictError extends Error {
  constructor(
    public itemName: string,
    public conflictingOrderId: string,
  ) {
    super(`Overbooked: ${itemName}`);
  }
}

export async function availableCount(itemId: string, from: string, to: string): Promise<number> {
  throw new Error("Not implemented");
}

export async function assertAvailableTx(orderId: string): Promise<void> {
  throw new Error("Not implemented");
}
