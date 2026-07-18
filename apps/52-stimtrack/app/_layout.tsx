/**
 * app/_layout.tsx
 *
 * Root layout: font loading, theme provider, DB bootstrap, notification
 * wiring, and the root stack (tabs + modal routes).
 *
 * TODO:
 * - [ ] Load Archivo/Inter/JetBrainsMono via expo-font from assets/fonts;
 *       hold splash until loaded (silent system fallback = failed build).
 * - [ ] Open/migrate SQLite via src/lib/db before first render.
 * - [ ] ThemeProvider from src/theme/useTheme (light "Porcelain lab"
 *       primary, dark "graphite lab-at-night"); status bar per mode.
 * - [ ] Register notification categories/actions (Taken / Skipped /
 *       Confirmed — injected) via src/lib/notifications; route action
 *       responses to repositories; deep-link trigger notifications to
 *       /trigger.
 * - [ ] Re-register the reminder queue on every app foreground
 *       (ARCHITECTURE.md flow 2).
 * - [ ] Configure RevenueCat via src/lib/paywall (keys from env).
 * - [ ] Root <Stack>: (tabs), onboarding, paywall, trigger (fullScreenModal),
 *       summary, storage, scan-entry (sheet) — sheets at radius 20.
 */

export {};
