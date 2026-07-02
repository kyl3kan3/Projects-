/**
 * Root layout (expo-router).
 *
 * Purpose: app-wide providers and one-time boot work — configure the RevenueCat
 * SDK with an anonymous app-user ID, open/migrate the SQLite database, register
 * the notification handler, init Sentry, and mount the dark-only theme. Declares
 * the root Stack with the tab group and the `paywall` modal route.
 *
 * TODO:
 * - [ ] Purchases.configure({ apiKey: EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY }) before first render
 * - [ ] Run SQLite migrations from src/lib/db.ts inside a splash-gated boot effect
 * - [ ] Register foreground notification handler (bedtime reminder taps deep-link to /winddown)
 * - [ ] Sentry.init with EXPO_PUBLIC_SENTRY_DSN; wrap root in Sentry error boundary
 * - [ ] Subscribe to Purchases customer-info listener; push entitlement into the zustand store
 * - [ ] <Stack> with (tabs) group and paywall as presentation: "modal"
 */

export default function RootLayout() {
  // TODO: implement per header block
  return null;
}
