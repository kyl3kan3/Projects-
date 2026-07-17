/**
 * Root layout: green-room theme, bundled fonts (Fraunces/Inter/Plex
 * Mono via expo-font), magic-link session gate, RevenueCat configure.
 *
 * TODO: font loading with splash hold; theme provider from DESIGN.md
 * tokens; Purchases.configure; session -> /welcome vs tabs.
 */

import { Stack } from "expo-router";

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
