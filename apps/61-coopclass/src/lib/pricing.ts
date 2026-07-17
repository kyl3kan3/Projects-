/**
 * src/lib/pricing.ts
 *
 * The sibling-discount engine. Rules from coops.settings (e.g. 2nd
 * child -10%, 3rd+ -20%, family cap $600/term). Output is explicit
 * invoice_lines — every discount named ("Sibling discount — Mia
 * (2nd child): -$12.00"), the math shown line by line.
 *
 * TODO:
 * - [ ] buildInvoice(familyId, termId): fees + materials per
 *       enrollment, discount lines per rule application, family cap as
 *       a final named line; returns the full line array + totals.
 * - [ ] createCheckout(invoiceId): one Stripe Checkout on the co-op's
 *       Connect account; payment-plan variant creates a subscription
 *       schedule (deposit + N monthly).
 * - [ ] reconcile(paymentEvent): invoice status transitions from
 *       persisted webhook events only.
 */

export interface InvoiceLineDraft {
  enrollmentId: string | null;
  label: string;
  amountCents: number;
  kind: "fee" | "materials" | "discount";
}

export async function buildInvoice(
  familyId: string,
  termId: string,
): Promise<{ lines: InvoiceLineDraft[]; subtotalCents: number; totalCents: number }> {
  throw new Error("Not implemented");
}

export async function createCheckout(invoiceId: string): Promise<{ url: string }> {
  throw new Error("Not implemented");
}
