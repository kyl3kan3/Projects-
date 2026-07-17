/**
 * src/lib/attribution.ts
 *
 * The conservative ledger. A booking counts as recovered production only
 * when a qualifying touch exists within the attribution window. There is
 * no second, friendlier number anywhere in the product.
 *
 * TODO:
 * - [ ] attributeBookings(locationId): nightly — for each unattributed
 *       booking, find the most recent touch to that patient within
 *       attribution_window_days (default 30, practice-configurable).
 *       Found -> insert attributions (booking_id unique guards doubles)
 *       with production_cents from the practice setting at that moment.
 *       Not found -> NO ROW. The conservatism has a test.
 * - [ ] Call outcomes (touches with channel=call) qualify — front-desk
 *       work counts as outreach.
 * - [ ] recoveredSummary(): month/quarter totals + booking counts for the
 *       dashboard counter and the chair-fill signature.
 * - [ ] ledgerRows(): receipt-grade rows (patient, touch channel +
 *       timestamp, booking date, window math, $) with expansion detail.
 * - [ ] holdoutComparison(): return rate of untouched overdue patients over
 *       the same period — the owner report's honesty section.
 */

export async function attributeBookings(_locationId: string): Promise<{
  attributed: number;
  skippedNoTouch: number;
}> {
  // TODO: implement per ARCHITECTURE.md key flow 4
  throw new Error("Not implemented");
}

export async function recoveredSummary(_locationId: string): Promise<{
  monthCents: number;
  quarterCents: number;
  bookings: number;
}> {
  throw new Error("Not implemented");
}
