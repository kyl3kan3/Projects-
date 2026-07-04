/**
 * src/lib/portal.ts
 *
 * Client payment portal: signed no-login links, balance display, and
 * Stripe payments (card + ACH) landing in the firm's own connected
 * account. PaidWell never holds the money.
 *
 * TODO:
 * - [ ] createPortalToken(firmId, clientId, invoiceId?): JWT (jose) signed
 *       with PORTAL_TOKEN_SECRET, 60-day expiry, scope = client or invoice.
 * - [ ] resolveToken(token): validate + load firm branding, balances,
 *       invoice PDFs, payment history.
 * - [ ] createPaymentIntent(invoiceId, amountCents): card/ACH on the firm's
 *       Stripe connected account (destination charges); partial payments
 *       allowed above a configurable floor.
 * - [ ] Promise widget backend: "I'll pay on <date>" -> promises.logPromise.
 * - [ ] Payment webhook handling: update invoice balance, complete the
 *       sequence run, trigger accounting write-back, fire the settle event.
 */

export interface PortalContext {
  firmName: string;
  clientName: string;
  totalBalanceCents: number;
  invoices: Array<{ id: string; number: string; balanceCents: number }>;
}

export function resolveToken(_token: string): Promise<PortalContext> {
  throw new Error("Not implemented");
}
