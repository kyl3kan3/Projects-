/**
 * Root layout: vault theme, bundled fonts (Fraunces/Inter/Plex Mono via
 * expo-font, loaded before first paint), auth gate (magic-link session
 * from expo-secure-store), RevenueCat configure on boot.
 *
 * TODO:
 * - [ ] Font loading with splash hold; theme provider with DESIGN.md
 *       tokens.
 * - [ ] Purchases.configure({ apiKey: platform key, appUserID: nest
 *       member id }).
 * - [ ] Session check -> /welcome (magic link entry) vs tabs.
 */

import { Stack } from "expo-router";

export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
