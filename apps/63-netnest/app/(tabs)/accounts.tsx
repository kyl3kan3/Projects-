/**
 * Accounts — grouped rows with staleness flags (DESIGN.md screen 2).
 *
 * Groups: cash / invested / property / debts. Institution rows show
 * reauth banners calmly (clay, inline). Add flow: Plaid Link (via
 * src/lib/plaid.ts) or the manual-asset sheet.
 *
 * TODO: grouped SectionList; brass staleness chips ("Home estimate is
 * 4 months old"); free-tier link cap surfacing the paywall at the 4th
 * link.
 */

import { Text, View } from "react-native";

export default function AccountsScreen() {
  return (
    <View>
      <Text>Not implemented: grouped accounts, add flows.</Text>
    </View>
  );
}
