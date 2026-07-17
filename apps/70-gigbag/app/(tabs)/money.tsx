/**
 * Money — payments and splits (DESIGN.md screen 5).
 *
 * Per-gig payment rows (method shown honestly), computed split lines
 * (member, rule, amount in mono), the settle-up aggregate, year
 * totals for tax season.
 *
 * TODO: record-payment sheet; split lines from the server compute;
 * settle-up marks; CSV export trigger (Band).
 */

import { Text, View } from "react-native";

export default function MoneyScreen() {
  return (
    <View>
      <Text>Not implemented: payments, splits, settle-up.</Text>
    </View>
  );
}
