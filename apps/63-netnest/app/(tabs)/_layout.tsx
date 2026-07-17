/**
 * Tab bar: Home (the Line), Accounts, Close, Nest. Vault-black bar,
 * hairline top border, active dot in vault green (DESIGN.md tab spec).
 *
 * TODO: custom tab bar per DESIGN.md; haptic on switch (expo-haptics,
 * light).
 */

import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="accounts" options={{ title: "Accounts" }} />
      <Tabs.Screen name="close" options={{ title: "Close" }} />
      <Tabs.Screen name="nest" options={{ title: "Nest" }} />
    </Tabs>
  );
}
