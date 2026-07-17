/**
 * Home — the Number, the Line, range chips, allocation bars
 * (DESIGN.md screen 1).
 *
 * Renders instantly from the SQLite-cached series, reconciles from the
 * server, draws once (600ms) and never re-animates this session.
 *
 * TODO:
 * - [ ] NetWorthLine (src/lib/line.ts + Skia canvas) with close points
 *       and the 40%-opacity provisional segment.
 * - [ ] The Number in Fraunces 600 40pt, count-up in the draw's final
 *       300ms.
 * - [ ] Range chips (1y/3y/all) re-window without re-draw animation.
 * - [ ] Allocation stacked bars below the fold.
 */

import { Text, View } from "react-native";

export default function HomeScreen() {
  return (
    <View>
      <Text>Not implemented: the Number, the Line, allocation.</Text>
    </View>
  );
}
