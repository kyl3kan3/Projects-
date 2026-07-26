// Paywall — RevenueCat offering: $14.99/mo + 7-day trial (hero) above $99/yr
// (duration-honesty fallback). Presented at gate touchpoints: 11th log entry,
// 6th vault document, Export tap, 2nd scenario, rebuild open. No timers, no
// fake urgency, no crossed-out prices (DESIGN.md).
//
// TODO:
// - [ ] Fetch current offering via src/lib/paywall.ts; render monthly card with oxblood hairline per DESIGN.md
// - [ ] Purchase / restore flows with loading + error states
// - [ ] Privacy copy block: "Everything stays on this phone… no account, no cloud."
// - [ ] Entitlement cache write-through so an outage never locks a payer out
// - [ ] Free-tier limits copy exactly per README pricing table
export {};
