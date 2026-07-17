/**
 * src/lib/tuition.ts
 *
 * Tuition autopay on the provider's Connect account: invoices from
 * enrollment cadences, autopay with the family's saved method, the
 * 3-attempt retry ladder, late fees per settings.
 *
 * TODO:
 * - [ ] generatePeriod(providerId, period): idempotent per (family,
 *       period); Stripe invoices with auto_advance.
 * - [ ] retryLadder(invoiceId): attempts over 5 days; past_due after;
 *       plain-language emails at each step.
 * - [ ] applyLateFee(invoiceId): per settings, as an invoice item,
 *       always visible in the parent link.
 */

export async function generatePeriod(
  providerId: string,
  period: { start: string; end: string },
): Promise<{ created: number }> {
  throw new Error("Not implemented");
}

export async function retryLadder(invoiceId: string): Promise<void> {
  throw new Error("Not implemented");
}
