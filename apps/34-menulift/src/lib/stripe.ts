/**
 * src/lib/stripe.ts — Billing (per-location subscriptions)
 *
 * One subscription per restaurant; quantity = active locations; tier
 * (menu $29 / kitchen $49 / margin $79) picks the price. 14-day trial.
 *
 * TODO:
 * - [ ] client factory with pinned apiVersion (never "latest")
 * - [ ] checkout + customer portal sessions
 * - [ ] syncQuantity(restaurantId): location added/deactivated -> quantity
 * - [ ] entitlements: tier gates photo enhancement + engineering screens
 * - [ ] multi-location discount (20% past first) via tiered pricing
 */
export {};
