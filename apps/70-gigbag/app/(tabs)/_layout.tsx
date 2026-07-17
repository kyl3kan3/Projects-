/**
 * Tab bar: Gigs (pipeline), Setlists, Money, Band. Greenroom bar,
 * hairline top, active dot in reverb (DESIGN.md).
 *
 * TODO: custom tab bar; haptics on switch.
 */

import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: "Gigs" }} />
      <Tabs.Screen name="setlists" options={{ title: "Setlists" }} />
      <Tabs.Screen name="money" options={{ title: "Money" }} />
      <Tabs.Screen name="band" options={{ title: "Band" }} />
    </Tabs>
  );
}
