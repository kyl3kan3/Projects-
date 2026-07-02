# DriftOff — Roadmap

## Phase 0 — Setup (week 0)

- Create Expo project (TypeScript template, expo-router), EAS project, Apple Developer account, App Store Connect app record with subscriptions group (annual + monthly SKUs).
- RevenueCat project: products, `premium` entitlement, default offering (annual hero + monthly), sandbox tester accounts.
- Cloudflare R2 bucket + CDN domain for the audio library; commission the first 10 audio tracks.
- Sentry project wired into EAS builds.

**Acceptance criteria**
- [ ] `npx expo start` runs the blank scaffold on a device
- [ ] EAS development build installs on a physical iPhone
- [ ] Sandbox purchase of the annual SKU succeeds end-to-end in a spike branch
- [ ] First 5 mastered tracks uploaded to R2 and playable via CDN URL

## Phase 1 — MVP (weeks 1–8)

- **Week 1 (de-risk first):** smart-alarm spike — background audio session keep-alive, accelerometer sampling overnight, ramping alarm from a scheduled wake window. *Go/no-go on "phone can be locked" vs. "app stays open on charger" positioning.*
- Weeks 2–3: sound player + mixer (4 channels, per-channel volume, sleep timer with fade), bundled starter sounds, SQLite layer.
- Week 4: download manager + CDN manifest; offline verification pass.
- Week 5: wind-down programs (3 programs), bedtime reminders.
- Week 6: smart alarm productionized + morning sleep report (session capture, cycle estimate, 7-day trend).
- Week 7: onboarding quiz, paywall (RevenueCat offerings, trial copy, restore), free/premium gating.
- Week 8: polish, haptics, dark-only theme, TestFlight beta to ~30 testers.

**Acceptance criteria**
- [ ] Full nightly loop works with device in airplane mode (except purchase)
- [ ] Mixer plays 4 simultaneous loops for 8h in background without audio dropout (tested overnight ×3 devices)
- [ ] Alarm fired within the wake window on ≥ 9 of 10 overnight test runs
- [ ] Trial start, conversion, cancellation, and restore all verified in sandbox
- [ ] Cold start < 2s; binary ≤ 50 MB; zero network calls when offline with owned content

## Phase 2 — Launch (weeks 9–12)

- App Store listing: screenshots, preview video, keyword-optimized metadata (EN + DE + ES at launch).
- Submit for review; fix rejections; public release.
- Product Hunt launch + Reddit presence; begin 3×/week ambience-clip posting on TikTok/Shorts.
- Apple Search Ads: exact-match campaigns on 10 seed keywords, $20/day cap.
- In-app review prompt after 3rd completed sleep session with rating ≥ 4.

**Acceptance criteria**
- [ ] Live on the App Store in 3+ storefront languages
- [ ] 1,000 downloads and 50+ ratings (≥ 4.5 avg) within 30 days of launch
- [ ] Trial-start rate ≥ 8% of installs; trial→paid ≥ 25% (kill/iterate paywall if below)
- [ ] ASA CPA ≤ $20 per trial start on at least 3 keywords
- [ ] Crash-free sessions ≥ 99.5%

## Phase 3 — Growth (months 4–12)

- Expand library to 50+ sounds and 8 wind-down programs (content velocity = retention).
- Localize fully (FR, PT-BR, JA); localized ASA campaigns.
- Android release via the same Expo codebase + RevenueCat (Google Play subs).
- Experiments: lifetime SKU test, win-back offers for lapsed trials, widget + Live Activity for sleep timer, HealthKit *export* (write-only, preserves no-account stance).
- App Store featuring pitch for World Sleep Day.

**Acceptance criteria**
- [ ] Top-10 search rank on 3 target keywords in ≥ 2 locales
- [ ] Android at feature parity with shared codebase (≤ 3 weeks port effort actual)
- [ ] Month-12 revenue run rate ≥ $8k MRR-equivalent with blended UA payback < 3 months
- [ ] Annual-plan share of new subs ≥ 55% (validating the category thesis)
- [ ] D30 retention of paying users ≥ 60%
