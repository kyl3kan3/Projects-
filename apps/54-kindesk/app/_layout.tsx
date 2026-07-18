// Root layout: loads self-hosted fonts (Hanken Grotesk, Inter, JetBrains Mono),
// opens/migrates SQLite, configures RevenueCat, kicks a sync pull, registers
// notification handling, and routes to onboarding until a family exists.
// TODO: useFonts (block render until loaded — no system fallback); openDb();
// Purchases.configure + launch entitlement refresh; sync.pullOnForeground();
// Stack with (tabs) / onboarding / paywall / digest routes.
export {};
