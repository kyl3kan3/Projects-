/**
 * RevenueCat integration: configure, cached CustomerInfo (zustand +
 * settings mirror for offline launches), isPremium(), purchase + restore.
 * TODO: implement entitlement check on `premium`, offering fetch, the three
 * gate helpers (weekly set count, lift gating, review gating), and PostHog
 * events for paywall funnel steps.
 */

export function isPremium(): boolean {
  throw new Error("Not implemented");
}
