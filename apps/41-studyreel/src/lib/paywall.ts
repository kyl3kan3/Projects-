/**
 * RevenueCat integration: configure with account-linked app user id,
 * cached CustomerInfo for offline, isPremium(), purchase/restore, and the
 * gate helpers (ingest count, deck cap, exam generation).
 * TODO: implement entitlement check on `premium`, .edu-targeted offering
 * fetch, and PostHog paywall funnel events.
 */

export function isPremium(): boolean {
  throw new Error("Not implemented");
}
