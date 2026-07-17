/**
 * Gig sheet (DESIGN.md screen 2) — the one screen.
 *
 * Title in Fraunces, times in big mono rows, fee + deposit state,
 * lineup chips, setlist + plot attachments, the 56px status-advance
 * action with the marquee strip light-up. Confirmed requires
 * signed + deposited (or the logged skip tap).
 *
 * TODO: cached read; advance flow (contract send -> booker link
 * states); conflict banner when a hold collides.
 */

import { Text, View } from "react-native";

export default function GigSheetScreen() {
  return (
    <View>
      <Text>Not implemented: the gig sheet.</Text>
    </View>
  );
}
