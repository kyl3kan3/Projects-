/**
 * src/lib/paywall.ts
 *
 * RevenueCat wrapper: offerings, entitlements, gates, and the local
 * entitlement cache (ARCHITECTURE.md flow 8).
 *
 * TODO:
 * - [ ] configure() from EXPO_PUBLIC_REVENUECAT_* env keys.
 * - [ ] getOffering(): annual w/ 7-day trial (hero), monthly, Cycle Pass
 *       (90-day window product).
 * - [ ] Entitlement check: 'plus' OR an unexpired Cycle Pass window
 *       (purchase date + 90 days, validated locally).
 * - [ ] Cache entitlement state in settings; offline/RC outage degrades to
 *       last-known-unlocked for existing purchasers (never lock a paying
 *       user out mid-cycle).
 * - [ ] Gates: fourthMed, secondCycle, summaryPdf, compareView,
 *       storageTracker — each returns allowed/paywall-reason.
 * - [ ] HARD RULE (assert in tests): loss-aware behavior is never gated.
 * - [ ] restore() flow.
 */

export {};
