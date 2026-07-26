// Root layout — expo-router stack. Loads fonts (Source Serif 4, Inter,
// JetBrains Mono via expo-font), initializes the SQLite database, mounts the
// theme provider, and gates EVERYTHING behind the app lock: no navigator with
// data may mount until expo-local-authentication succeeds (see src/lib/applock.ts).
//
// TODO:
// - [ ] Load the three variable fonts with expo-font; hold splash until loaded (silent fallback = failed build)
// - [ ] Run db migrations (src/lib/db.ts) before first render of any data screen
// - [ ] Mount ThemeProvider (src/theme/useTheme.ts) resolving light/dark tokens
// - [ ] App-lock gate: route to /lock on cold start and on return from background (AppState listener)
// - [ ] Configure RevenueCat SDK once (src/lib/paywall.ts) with EXPO_PUBLIC_REVENUECAT_* keys
// - [ ] Register notification handler (generic lock-screen content only — src/lib/notifications.ts)
// - [ ] Stack screens: (tabs), onboarding, paywall, lock, entry, capture, export — modals per DESIGN.md
export {};
