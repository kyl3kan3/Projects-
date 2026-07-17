/**
 * src/lib/paywall.ts — RevenueCat entitlements (react-native-
 * purchases). UX gating only — the SERVER enforces from its RC
 * mirror.
 *
 * TODO: configure on boot; isBand() with short cache; entitlement
 * listener refreshing zustand.
 */

export async function isBand(): Promise<boolean> {
  throw new Error("Not implemented");
}
