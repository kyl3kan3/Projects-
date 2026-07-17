/**
 * Close — the monthly ritual (DESIGN.md screen 3).
 *
 * Month header, per-account confirm rows (inline adjust writes a
 * manual balance), the one-line note, the Close button. Closed months
 * render as a quiet ledger list beneath. A closed month is immutable.
 *
 * TODO: confirm-row list; the close mutation (server) + optimistic
 * stamp; ledger history; haptic (success) on close.
 */

import { Text, View } from "react-native";

export default function CloseScreen() {
  return (
    <View>
      <Text>Not implemented: the monthly close ritual.</Text>
    </View>
  );
}
