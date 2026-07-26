# KinDesk — Roadmap

## Phase 0 — Setup (week 0)

- Expo project per `app.json`; EAS project; App Store Connect record with subscription group (monthly + annual family SKUs).
- RevenueCat project: products, `family` entitlement, offering (monthly + 14-day trial hero, annual fallback).
- Relay spike: Cloudflare Worker push/pull of opaque blobs keyed by family id (D1 index + R2 storage); `wrangler deploy` per .env.example.
- Self-host fonts (Hanken Grotesk, Inter, JetBrains Mono) in `assets/fonts`; author seed checklists (new-diagnosis, hospital-discharge, assisted-living move, getting-organized).

**Acceptance criteria**
- [ ] `npx expo start` runs the scaffold with all three fonts loading (verified vs system fallback)
- [ ] Relay round-trips an encrypted blob between two devices in a spike branch
- [ ] Sandbox purchase of the monthly SKU succeeds

## Phase 1 — MVP (weeks 1–8)

- **Week 1 (de-risk first): sync spike** — two devices, one share code, E2E key derivation (expo-crypto), push/pull of task records with last-write-wins; kill/downgrade decision if unreliable (fallback: single-device MVP + share-by-export, sync in v1.1).
- Week 2: SQLite schema + repositories; design tokens, global styles, icon set, core components (task row, expense row, digest card shell) straight from DESIGN.md — before any screen.
- Week 3: Tasks — board, needs-an-owner strip, add/edit with owner + recur, done flow; local reminders for owned tasks.
- Week 4: Money — expenses with receipt capture, balances math, settle-up; free-tier gate (no splitting).
- Week 5: Vault — camera/file capture, tags, search, 10-doc gate; contacts + visit/decision log.
- Week 6: Family — share-code invites, member management, sync engine productionized (tasks/expenses/docs metadata + encrypted blobs).
- Week 7: The digest — builder, signature assembly animation, image/PDF share; Today screen; onboarding + paywall + gates.
- Week 8: Dark mode pass, accessibility (Dynamic Type, VoiceOver on rows and balances), reduced-motion, backup export/delete-all, polish; TestFlight to ~25 coordinating caregivers (recruit from r/AgingParents / caregiver groups).

**Acceptance criteria**
- [ ] Every item in README's MVP feature list works end to end
- [ ] Two-device family stays consistent through a week of mixed edits (field test, 3 families)
- [ ] Relay stores ciphertext only — verified by inspecting stored objects
- [ ] Balances match hand-computed ledgers across 20 seeded expense scenarios
- [ ] Digest renders correctly from seeded data and shares as image + PDF
- [ ] Trial start, conversion, cancellation, restore verified in sandbox; typecheck, lint, production build green

## Phase 2 — Launch (weeks 9–12)

- App Store listing: screenshots led by the digest and the balances screen; keyword set per README GTM.
- Content site: first 15 SEO articles on the empty SERP (sibling expense splitting, POA checklist, discharge checklist), each funneling to the app.
- Submit, fix rejections, public iOS release; genuine participation in caregiver communities; digest footer link live.
- CloudKit shared-zone evaluation (iOS-serverless sync variant) — adopt if it removes the relay without breaking Android plans.

**Acceptance criteria**
- [ ] Live on the App Store; content site indexed
- [ ] 800 families created and 40+ ratings (≥4.6) within 30 days
- [ ] Trial-start ≥ 10% of coordinator installs; trial→paid ≥ 30%
- [ ] ≥ 35% of paying families have ≥2 members (the invite loop working)
- [ ] Crash-free sessions ≥ 99.5%

## Phase 3 — Growth (months 4–12)

- Android release (same codebase + Play Billing via RevenueCat) — sibling coverage is the point.
- Unequal-split ratios and export-to-CSV for family accounting; care-manager referral program.
- The arc: estate-mode checklist pack and vault handoff (bridges toward the AfterWords research thesis).
- Localize EN-AU/UK; widget (today's owned tasks); digest email-free scheduling.

**Acceptance criteria**
- [ ] Android at parity ≤ 4 weeks port effort actual
- [ ] ≥ 50% of active families multi-member; month-12 run rate ≥ $8k MRR-equivalent
- [ ] 6-month family retention ≥ 50%; digest shared by ≥ 40% of active families weekly
