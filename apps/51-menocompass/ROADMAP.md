# MenoCompass — Roadmap

## Phase 0 — Setup (week 0)

- Expo project (TypeScript, expo-router) per `app.json`; EAS project; Apple Developer account; App Store Connect record with subscription group (annual + monthly SKUs).
- RevenueCat project: products, `plus` entitlement, default offering (annual+7-day-trial hero, monthly fallback), sandbox testers.
- Curate the bundled content: the 34-symptom library (names, domains, ordering) and the 20 education cards with citations (NAMS/NICE-grade sources).
- Self-host fonts (Source Serif 4, Inter, JetBrains Mono) in `assets/fonts`.

**Acceptance criteria**
- [ ] `npx expo start` runs the scaffold on a device with all three fonts loading (verified visually vs system fallback)
- [ ] Sandbox purchase of the annual SKU succeeds in a spike branch
- [ ] Symptom library and education content committed as typed JSON

## Phase 1 — MVP (weeks 1–8)

- **Week 1 (de-risk first):** notification spike — schedule twice-weekly patch reminders with Taken/Skipped actions writing to SQLite from the notification, app killed. *Go/no-go on notification-action logging; fall back to open-on-tap logging if actions prove unreliable.*
- Week 2: SQLite schema + repositories + zustand stores; design tokens, global styles, icon set, core components (tiles, rows, buttons) straight from DESIGN.md — before any screen.
- Week 3: Today screen — check-in grid, severity cycling, yesterday-prefill, notes; cycle logging with irregularity-native states.
- Week 4: Meds — medication/regimen CRUD across all delivery methods, dose-change timeline events, reminder scheduling, adherence logging; labs log.
- Week 5: Trends — heat strip, per-symptom charts with dose-change markers, cycle-gap chart.
- Week 6: Insights engine (deterministic windows, template copy review against wellness-line rules) + doctor report builder (HTML → expo-print PDF) + the signature render.
- Week 7: Onboarding + paywall (RevenueCat offerings, gates per README), settings, export/backup/delete, Apple Health read-only import.
- Week 8: Dark mode pass, 3 a.m. flow, accessibility (Dynamic Type, VoiceOver labels on severity dots), `prefers-reduced-motion`, polish, TestFlight to ~30 women in the target demographic (recruit from menopause communities).

**Acceptance criteria**
- [ ] Every item in README's MVP feature list works end to end
- [ ] Full app functions in airplane mode (except purchase); zero third-party analytics network calls verified with a proxy
- [ ] Daily check-in completable in <30s (timed with testers); notification-action logging works with app killed on 3 physical devices
- [ ] Doctor report renders a correct one-pager from 90 days of seeded data; a clinician reviewer confirms it's legible/useful
- [ ] Insight copy passes the wellness-line checklist (no advice, no causal claims) on every template
- [ ] Trial start, conversion, cancellation, restore verified in sandbox; typecheck, lint, production build green

## Phase 2 — Launch (weeks 9–12)

- App Store listing: screenshots led by the doctor report and the heat strip; privacy nutrition label "Data Not Collected"; keyword set per README GTM.
- Companion content site: first 20 SEO articles targeting long-tail perimenopause/HRT problem searches, each funneling to the app.
- Submit, fix rejections, public iOS release; begin genuine participation in r/Menopause tracking threads; clinician one-pager PDF published.
- Apple Search Ads exact-match on category + competitor terms, $20/day cap.

**Acceptance criteria**
- [ ] Live on the App Store; content site indexed with 20 articles
- [ ] 1,000 downloads and 50+ ratings (≥4.6 avg) within 30 days
- [ ] Trial-start ≥ 8% of installs; trial→paid ≥ 35% (annual-with-trial benchmark); kill/iterate paywall if below
- [ ] ≥ 25% of week-1 users generate or preview a report (validates the hero feature)
- [ ] Crash-free sessions ≥ 99.5%

## Phase 3 — Growth (months 4–12)

- Content velocity: 8 articles/month against the 300K-search long tail; education library to 60 cards.
- Android release (same codebase + Google Play subs via RevenueCat).
- Wearable-enriched trends (HealthKit sleep already imported; add HRV/temperature where available via HealthKit).
- Localize (UK/AU first — same language, strong HRT awareness markets; then DE/FR).
- Clinician channel: shareable report deep-link ("ask your patient to bring this"), menopause-specialist directory partnership outreach.
- Experiments: lifetime SKU, win-back offers, widget (today's meds), report cadence email-free reminders (local notifications only — no email, no accounts).

**Acceptance criteria**
- [ ] Organic search delivers ≥ 40% of installs (the asymmetry thesis validated)
- [ ] Android at parity ≤ 4 weeks port effort actual
- [ ] Month-12 run rate ≥ $20k MRR-equivalent; annual share of new subs ≥ 60%
- [ ] 6-month subscriber retention ≥ 55% (the treatment-journey loop holding)
