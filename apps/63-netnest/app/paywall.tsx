/**
 * Paywall — the honest wall (DESIGN.md screen 5).
 *
 * What free includes, what Plus adds, the Plaid-cost sentence ("bank
 * connections cost us real money — that's the cap"), monthly/annual
 * toggle ($9.99 / $69), purchase + restore via RevenueCat.
 *
 * TODO: Purchases.getOfferings(); purchase flow with entitlement
 * refresh; restore; legal links. No dark patterns: the close button
 * is always visible.
 */

import { Text, View } from "react-native";

export default function PaywallScreen() {
  return (
    <View>
      <Text>Not implemented: NetNest Plus paywall.</Text>
    </View>
  );
}
