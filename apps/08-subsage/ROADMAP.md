# SubSage Roadmap

Guiding sequence: revenue-capable manual tracker first, email scanning second. Gmail restricted-scope verification is the longest external dependency, so its paperwork starts in Phase 0 even though the feature ships mid-Phase 1.

---

## Phase 0 -- Setup (Week 0, ~3-5 days)

Goal: all accounts, credentials, and project plumbing exist so Phase 1 is pure feature work.

- Create Expo project (this scaffold), TypeScript strict, expo-router, EAS project linked (`eas init`), development builds profile in `eas.json`
- Apple Developer + Google Play Console accounts active; bundle id `com.subsage.app` registered on both stores
- RevenueCat project created: entitlement `premium`; products `subsage_weekly_499` (w/ 3-day introductory trial) and `subsage_annual_3499`; default offering with `$rc_weekly` + `$rc_annual` packages; iOS + Android API keys in `.env`
- App Store Connect / Play Console in-app products created and linked to RevenueCat
- Google Cloud project: Gmail API enabled, OAuth consent screen drafted (external), `gmail.readonly` scope declared, OAuth client IDs created; **start restricted-scope verification questionnaire and CASA vendor selection now** (longest lead time in the plan)
- Companion API deployed to Fly/Railway as hello-world with health check; Sentry + PostHog projects created

**Acceptance criteria:**
- [ ] `npx expo start` runs the scaffold on a device via development build
- [ ] EAS build succeeds for iOS simulator and Android profile
- [ ] RevenueCat dashboard shows both products attached to the `premium` entitlement and a default offering
- [ ] Sandbox purchase of the weekly product succeeds in a bare test screen
- [ ] Google OAuth consent screen is in "verification in progress" (or at minimum fully drafted with test users added)
- [ ] `GET /health` on the deployed companion API returns 200

## Phase 1 -- MVP (Weeks 1-7)

Goal: shippable product where a user can track subscriptions, get reminders, hit the paywall, pay, and (behind a feature flag until verification lands) scan Gmail.

### Weeks 1-2: Manual tracking core
- SQLite schema + migrations (`lib/db.ts`); subscription CRUD; list screen with monthly-equivalent totals and next-renewal sort; subscription detail; categories; settings screen

### Week 3: Reminders + notifications
- Local notification scheduling/reconciliation (`lib/notifications.ts`); renewal + trial-ending reminders; notification tap deep-links to detail; reminder settings

### Week 4: Paywall + free tier
- RevenueCat wrapper (`lib/purchases.ts`); paywall screen with weekly-primary/annual-fallback layout; free-tier gates (5 subscriptions, manual only); restore purchases; onboarding flow ending in soft paywall

### Weeks 5-6: Gmail scan (behind feature flag)
- Companion API: PKCE token exchange, `/parse/receipts` with rules for top ~50 merchants (Netflix, Spotify, YouTube Premium, iCloud, Amazon Prime, Disney+, Hulu, HBO Max, Adobe, Dropbox, etc.)
- Connect-Gmail flow; scan + confirm-found-subscriptions UX; dedupe; re-scan
- Price-hike detection over imported receipts + hike notification + price history on detail screen

### Week 7: Insights, polish, hardening
- Insights tab (monthly/annual totals, category breakdown, hike cost); cancel-assist guides v1 (bundled JSON, top 50 services); empty states; error states; CSV export; delete-all-data; Sentry wired; analytics events

**Acceptance criteria:**
- [ ] A new user can add a subscription and receives a scheduled reminder that fires at the configured lead time (verified on physical iOS + Android devices)
- [ ] Adding a 6th subscription as a free user always presents the paywall; sandbox purchase of weekly-with-trial unlocks it within one app session
- [ ] Restore purchases recovers entitlement on a fresh install
- [ ] With a seeded test Gmail account containing 12 months of receipt fixtures, scan proposes at least 90% of the seeded subscriptions with correct amounts, and inserts zero unconfirmed rows
- [ ] A seeded price increase (two Netflix receipts, $15.49 then $17.99) produces exactly one price_changes row and one hike notification
- [ ] All user data provably on device: companion API logs show no persisted message bodies; server has no user database
- [ ] Cold start under 2s on a mid-range Android device; no crash-loop reports in Sentry across the internal test group

## Phase 2 -- Launch (Weeks 8-11)

Goal: live on both stores with Gmail scanning publicly enabled.

- TestFlight + Play internal testing with 20-50 external testers; fix top issues
- App Store assets: screenshots leading with privacy angle, preview video of scan-and-reveal moment, ASO title/subtitle/keywords per README GTM
- Privacy nutrition labels (iOS) + Data safety form (Play) reflecting on-device architecture; privacy policy + terms pages live
- Complete Google restricted-scope verification + CASA assessment; flip Gmail feature flag to public when approved
- Store submissions, review-rejection response loop, phased rollout (Play staged rollout, iOS phased release)
- Launch-week monitoring: Sentry triage rota, RevenueCat conversion dashboard, review responses

**Acceptance criteria:**
- [ ] Approved and live on the App Store and Google Play in launch countries (US, CA, UK, AU)
- [ ] Google OAuth verification granted; production users can connect Gmail without the "unverified app" warning
- [ ] Trial-start-to-paid conversion and D1/D7 retention dashboards live in RevenueCat + PostHog
- [ ] Crash-free sessions above 99.5% in week one of full rollout
- [ ] At least one complete end-to-end paid transaction on each platform in production

## Phase 3 -- Growth (Months 3-6)

Goal: widen the funnel and raise LTV without compromising the privacy architecture.

- **Android parity + polish:** close any iOS-first gaps (widget support, notification channels, Material-correct UI), Play-specific ASO pass
- **Widgets:** iOS home/lock-screen widget and Android widget showing next renewal + monthly total (high-retention surface)
- **Family plan:** shared subscription list via end-to-end encrypted sync or local export/import (must not break "no server-side user data" -- design decision gate before build), family pricing tier in RevenueCat
- Paywall experiments via RevenueCat (price points, trial length, annual-first vs weekly-first) -- one experiment live at all times
- Cancel-guide feed v2: remote-updatable versioned feed, coverage to 150+ services, "how to cancel X" SEO pages generated from the same dataset
- Additional ingestion: Outlook/IMAP evaluation as Gmail-independence hedge
- Localization: ES, DE, FR, PT if store analytics justify

**Acceptance criteria:**
- [ ] Android conversion and retention within 20% of iOS metrics
- [ ] Widget shipped on both platforms; widget users show measurably higher D30 retention than non-widget users
- [ ] Family plan decision documented (ship/kill with rationale); if shipped, zero plaintext user data stored server-side (verified by design review)
- [ ] At least 3 paywall experiments completed with statistically meaningful results; winning variant deployed
- [ ] Cancel-guide coverage at 150+ services with a remote feed the app consumes and caches offline
