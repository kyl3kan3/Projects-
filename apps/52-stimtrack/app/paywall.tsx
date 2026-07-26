/**
 * app/paywall.tsx — Paywall
 *
 * RevenueCat offering per README pricing: Annual w/ 7-day trial (hero),
 * Monthly, Cycle Pass (90-day window). Loss-aware features are NEVER here.
 *
 * TODO:
 * - [ ] Fetch offering via src/lib/paywall; annual card (card, viridian
 *       hairline, "7 DAYS FREE" Label) above monthly + Cycle Pass; single
 *       primary "Start free week"; restore as quiet action.
 * - [ ] Post-retrieval variant: annual presented first with storage-renewal
 *       framing ("your storage renewal is a yearly event now").
 * - [ ] Gate triggers routed here: 4th med, second cycle, summary PDF,
 *       compare view, storage tracker (per README).
 * - [ ] Reliability copy block: "Your protocol lives on this phone… no
 *       server to lose it."
 * - [ ] Entitlement cache in settings; offline/RC-outage degrades to
 *       unlocked for existing purchasers (ARCHITECTURE.md flow 8).
 * - [ ] No timers, no fake strikethroughs, no exclamation marks.
 * - [ ] Hard rule enforced in code review: no loss-aware behavior behind
 *       this screen.
 */

export {};
