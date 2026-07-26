# SplitKit — Roadmap

## Phase 0 — Setup (week 0)

- Expo project (TypeScript, expo-router) per `app.json`; EAS project; Apple Developer account; App Store Connect record with subscription group (event-monthly + annual SKUs).
- RevenueCat project: products, `full` entitlement, default offering (monthly+7-day-trial hero, annual fallback), sandbox testers.
- Curate the bundled content: the ~60-task financial-discovery checklist (sections, task copy, state branches), the 50-state + DC facts table (property regime, disclosure-form names, waiting periods — every fact cited to an official source), the post-decree rebuild plan, and the 20 education cards with citations. Run all copy through the non-advice checklist (BUILD.md ground rules).
- Self-host fonts (Source Serif 4, Inter, JetBrains Mono) in `assets/fonts`.

**Acceptance criteria**
- [ ] `npx expo start` runs the scaffold on a device with all three fonts loading (verified visually vs system fallback)
- [ ] Sandbox purchase of the monthly SKU succeeds in a spike branch
- [ ] Checklist, state facts, rebuild plan, and education content committed as typed data with citation fields populated
- [ ] Every bundled string passes the non-advice copy review (no advice, no property characterization, no "admissible")

## Phase 1 — MVP (weeks 1–8)

- **Week 1 (de-risk first):** integrity spike — hash-chain module (seal, verify, tamper-detection test that alters a DB row directly), SHA-256 of a camera-captured photo via expo-crypto, and the app-lock gate (biometric + PIN fallback, auto-lock on background). *Go/no-go on hashing performance for multi-MB photos and lock reliability; fall back to hashing on a background interaction (with UI state) if capture-time hashing janks.*
- Week 2: SQLite schema + repositories; design tokens, global styles, icon set, core components (rows, cards, buttons, ruled forms) straight from DESIGN.md — before any screen.
- Week 3: Checklist screen — sectioned state-aware tasks, progress, status writes; onboarding (state → stage → children → lock setup) wired to it.
- Week 4: Inventory — asset CRUD, titling/marital flags, signed totals strip; vault — capture/import, hash-at-capture, asset linking, document cards.
- Week 5: Log — entry form, sealing transaction, hash chain, entry cards with seal lines, the record-seal signature animation; chain verification surface.
- Week 6: Court-ready PDF export (HTML → expo-print, method footer, digest verification before render) + settlement scenario worksheets (house / pension / cashflow pure functions, live outputs, attorney/CDFA footer).
- Week 7: Paywall (RevenueCat offerings, gates per README), rebuild plan (stage-activated), reminders (generic lock-screen copy), settings, encrypted backup export.
- Week 8: Dark mode pass, accessibility (Dynamic Type, VoiceOver labels on seal lines and checkboxes), `prefers-reduced-motion`, empty/error states, polish, TestFlight to ~25 women in or through a gray divorce (recruit via divorce-coach newsletters and r/DivorceOver40 with mod permission).

**Acceptance criteria**
- [ ] Every item in README's MVP feature list works end to end
- [ ] Full app functions in airplane mode (except purchase); zero third-party analytics network calls verified with a proxy
- [ ] Tamper test passes: 50 sealed entries verify; altering any row directly in SQLite is detected and reported; the PDF digest matches independent recomputation
- [ ] App lock holds: backgrounding locks; no data screen reachable pre-auth; lock-screen notifications reveal nothing (verified on device)
- [ ] A family-law attorney reviewer confirms the export PDF is legible, well-organized, and free of admissibility overclaims; scenario footers verbatim on every output
- [ ] Trial start, conversion, cancellation, restore verified in sandbox; typecheck, lint, production build green

## Phase 2 — Launch (weeks 9–12)

- Backup restore-from-file (decrypt + reconcile) — the encrypted export shipped in Phase 1 becomes a full round trip.
- App Store listing: screenshots led by the record seal and the checklist; privacy nutrition label "Data Not Collected"; keyword set per README GTM.
- Companion content site: first 20 SEO articles on the question layer ("divorce financial checklist," "how to document conversations for divorce," "gray divorce pension split"), each funneling to the app; the attorney/CDFA intake one-pager published as a PDF.
- Submit, fix rejections, public iOS release; begin genuine participation in divorce-community threads; outreach to 20 divorce coaches and CDFAs with the one-pager.
- Apple Search Ads exact-match on category + competitor terms (divorce checklist, divorce app, ourfamilywizard), $20/day cap.

**Acceptance criteria**
- [ ] Live on the App Store; content site indexed with 20 articles
- [ ] Backup → wipe → restore round trip verified on device
- [ ] 1,000 downloads and 40+ ratings (≥4.6 avg) within 30 days
- [ ] Trial-start ≥ 8% of installs; trial→paid ≥ 30%; kill/iterate paywall if below
- [ ] ≥ 30% of week-1 users seal a log entry or complete a checklist section (validates the wedge)
- [ ] Crash-free sessions ≥ 99.5%

## Phase 3 — Growth (months 4–12)

- Content velocity: 8 articles/month on the pre-decree question layer; education library to 50 cards; state-facts refresh cycle (quarterly citation re-check).
- Android release (same codebase + Google Play subs via RevenueCat).
- Vault upgrades: PDF import annotations, on-device OCR for statement dates/amounts (no network), duplicate detection.
- Discreet-mode research: app name/icon alternates and disguised entry, designed with domestic-violence-advocacy review (shared engine with the abuse-documentation niche).
- Attorney/CDFA channel productization: export cover page with firm-name field, referral one-pager v2, CLE-adjacent webinar with a CDFA partner.
- Experiments: lifetime SKU for late-stage users, post-decree rebuild as a cheaper standalone tier, win-back offer at decree date, localization research (UK/CA family-law differences are substantial — treat as new content, not translation).

**Acceptance criteria**
- [ ] Organic search delivers ≥ 40% of installs (the question-layer thesis validated)
- [ ] Android at parity ≤ 4 weeks port effort actual
- [ ] Month-12 run rate ≥ $10k MRR; median paid tenure ≥ 9 months (the event-duration pricing thesis holding)
- [ ] ≥ 10 attorneys/CDFAs distributing the one-pager (channel validated)
