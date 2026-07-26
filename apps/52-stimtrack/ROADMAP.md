# StimTrack — Roadmap

## Phase 0 — Setup (week 0)

- Expo project (TypeScript, expo-router) per `app.json`; EAS project; Apple Developer account; App Store Connect record with subscription group (annual + monthly) and the Cycle Pass non-consumable.
- RevenueCat project: products, `plus` entitlement, offerings (annual+7-day-trial hero, monthly and Cycle Pass fallbacks), sandbox testers.
- Curate the bundled content: the fertility-med library (names, kinds, routes, common schedules — no doses suggested) and the 25 reference cards with citations (ASRM/HFEA-grade sources), plus the seeded demo cycle (a believable day-9 stim cycle for screenshots and dev).
- Self-host fonts (Archivo, Inter, JetBrains Mono) in `assets/fonts` per its README.

**Acceptance criteria**
- [ ] `npx expo start` runs the scaffold on a device with all three fonts loading (verified visually vs system fallback)
- [ ] Sandbox purchase of the annual SKU and the Cycle Pass succeeds in a spike branch
- [ ] Med library and reference content committed as typed TS data with citations

## Phase 1 — MVP (weeks 1–8)

- **Week 1 (de-risk first): the trigger-ladder spike.** Pre-register the full escalation ladder (T−24h → T−4h → T−1h → T−15m → T−0 → repeating nag) as local notifications with a "Confirmed — injected" action writing to SQLite, app killed, on ≥2 physical iOS devices; validate the 64-pending budget with a realistic 4-med protocol scheduled alongside; verify quiet-hours/Focus behavior (time-sensitive interruption level). *Go/no-go: if the ladder cannot be made reliable with the app killed, redesign the reminder architecture before any screen is built.*
- Week 2: SQLite schema + repositories + the reminder engine (budgeted scheduling, re-registration on open/log) + the loss-state engine (transactional silence); design tokens, global styles, icon set, core components (day rows, med rows, buttons, sheets) straight from DESIGN.md — before any screen.
- Week 3: Protocol calendar — day-indexed timeline, cycle-day math, add/edit events, phase headers, mid-cycle editing as a first-class flow; cycle state machine.
- Week 4: Meds — prescription CRUD from the bundled library, per-med schedules, dose-change events, reminder wiring with Taken/Skip notification actions; overdue states.
- Week 5: The trigger-shot engine — exact-time entry, the full-screen countdown per DESIGN.md (ring, T−1h signal switch, hold-to-confirm, reduced-motion variant), ladder integration with the Week-1 spike learnings; Today screen assembling calendar + meds + countdown band.
- Week 6: Labs — scan entry sheet (E2/LH/P4, per-ovary follicles, lining), charts with dose-change markers; storage-fee tracker with renewal reminders; appointment prep notes.
- Week 7: Cycle summary PDF (HTML → expo-print, typeset per DESIGN.md); loss-aware end flow wired through every surface (silence transaction, archive register, neutral copy); onboarding + paywall (RevenueCat offerings, gates per README); settings, export/backup/delete.
- Week 8: Dark mode pass (graphite lab-at-night), the 5 a.m. injection flow, accessibility (Dynamic Type, VoiceOver labels on countdown and follicle chips), `prefers-reduced-motion`, polish, TestFlight to ~30 users recruited from IVF/egg-freezing communities — explicitly including testers with lived pregnancy-loss experience to review the loss flows.

**Acceptance criteria**
- [ ] Every item in README's MVP feature list works end to end
- [ ] Full app functions in airplane mode (except purchase); zero third-party analytics network calls verified with a proxy
- [ ] Trigger ladder verified on 3 physical devices with the app killed: every rung fires, the nag repeats until confirmed, confirmation silences it, quiet hours never suppress it
- [ ] Loss-state test: ending a cycle cancels 100% of its pending notifications (checked against the OS pending list); no later notification references an ended cycle; loss copy approved by testers with lived experience
- [ ] Scan entry completable in <60 seconds (timed with testers); cycle summary renders a correct one-pager from the seeded cycle and a real tester cycle
- [ ] Wellness-line checklist passes on all copy: no protocol generation, no dosing advice, no predictions; reference cards cite sources
- [ ] Trial start, conversion, cancellation, restore, and Cycle Pass purchase verified in sandbox; typecheck, lint, production build green

## Phase 2 — Launch (weeks 9–12)

- Backup restore-from-file + AES passphrase encryption of the export (v1 ships plaintext JSON export only).
- App Store listing: screenshots led by the trigger countdown and the cycle summary; privacy nutrition label "Data Not Collected"; keyword set per README GTM.
- Landing page per MARKETING_PLAYBOOK.md: the countdown ticking in the hero, the device ("the $20,000 reminder"), the loss-aware objection-killer section, one CTA phrase.
- Content site: first 15 SEO articles on the questions every cycle asks (trigger timing, monitoring numbers, storage fees, benefit usage), each funneling to the app.
- Submit, fix rejections, public iOS release; begin genuine participation in r/IVF and r/eggfreezing tracking threads; fertility-pharmacy/injection-nurse one-pager published.
- Apple Search Ads exact-match on category + competitor terms (ivf tracker, embie, egg freezing app), $20/day cap.

**Acceptance criteria**
- [ ] Live on the App Store; content site indexed with 15 articles
- [ ] 1,000 downloads and 50+ ratings (≥4.6 avg) within 30 days — reliability sentiment monitored daily; any data-loss report is a P0
- [ ] Trial-start ≥ 8% of installs; trial→paid ≥ 30%; Cycle Pass ≥ 15% of first-week revenue (validates event pricing)
- [ ] ≥ 40% of active-cycle users set a trigger time (validates the hero feature); ≥ 90% of set triggers reach confirmed state
- [ ] Crash-free sessions ≥ 99.8% (the reliability bar is higher here than portfolio default)

## Phase 3 — Growth (months 4–12)

- Android release (same codebase + Google Play subs via RevenueCat) — Embie's worst reviews are on Android; arrive reliable.
- Cycle comparison v2: aligned-by-cycle-day overlay charts across cycles (the second-opinion power feature).
- Storage lifecycle depth: multi-facility dashboards, fee-history, thaw-decision worksheets (educational framing, cited, never advisory).
- FET and IUI protocol templates as first-class cycle kinds (structure, not medical content — still fully user-entered).
- Localize (UK/AU first — same language, strong self-pay IVF markets; then DE).
- Partner view exploration: read-only shared calendar/countdown — only with E2E encryption and explicit demand; the no-server promise is not negotiable (ARCHITECTURE.md non-goals govern).
- Experiments: lifetime SKU, storage-only cheap tier for post-retrieval years, widget (today's meds + countdown), win-back timed to storage renewals.

**Acceptance criteria**
- [ ] Organic (search + community) delivers ≥ 40% of installs
- [ ] Android at parity ≤ 4 weeks port effort actual; Android rating ≥ 4.5 (the reliability wedge proven on the incumbent's weakest ground)
- [ ] ≥ 30% of users who log a retrieval add a storage item; storage-reminder users show ≥ 60% 12-month retention (the long-arc thesis validated)
- [ ] Month-12 run rate ≥ $10k MRR-equivalent; annual share of new subs ≥ 50%
