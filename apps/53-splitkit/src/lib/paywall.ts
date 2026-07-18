// Paywall/entitlements — react-native-purchases (RevenueCat). Offering:
// $14.99/mo + 7-day trial (hero), $99/yr (fallback). Entitlement "full"
// cached in settings so connectivity lapses or a RevenueCat outage never lock
// a paying user out. The only network dependency besides store billing.
//
// TODO:
// - [ ] configure() at root with EXPO_PUBLIC_REVENUECAT_* keys
// - [ ] getOffering / purchase / restore wrappers with typed results
// - [ ] Entitlement cache write-through (settingsRepo) + isEntitled() reading cache-first
// - [ ] Gate helpers for the free-tier limits (11th entry, 6th document, export, 2nd scenario, rebuild)
// - [ ] Sandbox test plan hooks (trial start / convert / cancel / restore)
export {};
