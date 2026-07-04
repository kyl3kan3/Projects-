// Root layout: loads self-hosted fonts (Source Serif 4, Inter, JetBrains Mono),
// opens/migrates the SQLite database, initializes RevenueCat, registers the
// notification response handler, and provides theme (light/dark tokens).
// TODO:
// - expo-font loadAsync for all three faces; block render until loaded (no system fallback)
// - db.open() + migrations before first screen
// - Purchases.configure with EXPO_PUBLIC_REVENUECAT_* keys; hydrate entitlement cache
// - Notifications.setNotificationCategoryAsync with Taken/Skipped actions; response listener -> doseLog repository
// - Stack with (tabs), onboarding, paywall routes; route to onboarding when settings.onboarded is unset
export {};
