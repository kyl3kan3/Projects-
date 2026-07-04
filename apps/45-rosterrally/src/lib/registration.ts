/**
 * src/lib/registration.ts
 *
 * Season registration: the public flow (household + players + waiver +
 * consent), capacity/waitlists, discounts, and the registrar console's
 * live view. The 5-minute parent flow is a product requirement.
 *
 * TODO:
 * - [ ] register(seasonSlug, input): household match-or-create, players,
 *       waiver e-acknowledgment (timestamped text snapshot), explicit SMS
 *       consent capture, zod validation end to end.
 * - [ ] Pricing: division fee + early-bird window + sibling discount +
 *       scholarship codes (codes skip our application fee).
 * - [ ] Capacity + waitlist: full division -> waitlisted (no charge);
 *       promoteFromWaitlist(divisionId) collects payment on promotion.
 * - [ ] Refunds/credits: self-serve for registrar, audit-logged, Stripe
 *       refund on the connected account.
 * - [ ] getSeasonDashboard(seasonId): live counts, payment states,
 *       waitlists, CSV export.
 */

export function register(
  _seasonSlug: string,
  _input: Record<string, unknown>,
): Promise<void> {
  throw new Error("Not implemented");
}

export function promoteFromWaitlist(_divisionId: string): Promise<void> {
  throw new Error("Not implemented");
}
