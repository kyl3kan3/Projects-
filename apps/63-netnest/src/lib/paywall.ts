/**
 * src/lib/paywall.ts — RevenueCat entitlements (react-native-purchases).
 *
 * TODO:
 * - [ ] configure(appUserID) on boot; getOfferings(); purchase(pkg);
 *       restore().
 * - [ ] isPlus(): entitlement check with a short cache; the SERVER
 *       enforces caps — this is UX-gating only.
 * - [ ] Entitlement listener refreshing zustand state.
 */

export async function isPlus(): Promise<boolean> {
  throw new Error("Not implemented");
}
