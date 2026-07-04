# FormCoach Roadmap

## Phase 0 — Setup (Week 0, ~4-6 days)

Repo, native pipeline proof, and accounts so Phase 1 is pure product work.

**Acceptance criteria:**

- [ ] Expo + TypeScript repo scaffolded with expo-router; CI runs lint + typecheck + jest on every push
- [ ] EAS development build profile working on a physical iPhone (vision-camera + fast-tflite + Skia all require it — Expo Go is out from day one)
- [ ] Pose model spike proven: 30fps landmark stream from vision-camera frame processor on an iPhone 12-class device, with measured fps + thermal notes committed
- [ ] Skia hello-world overlay drawing on live camera frames
- [ ] expo-sqlite schema migration harness in place; jest running pure-TS engine tests
- [ ] RevenueCat project configured: `premium` entitlement, monthly + annual (7-day trial) products in App Store Connect sandbox
- [ ] Sentry + PostHog wired; `.env.example` complete
- [ ] 30-clip labeled validation set assembled (squat, mixed angles/lighting, expert-labeled depth + faults) — the accuracy benchmark exists before the engine does

## Phase 1 — MVP (Weeks 1-10)

Goal: a lifter records a squat set and gets trustworthy cues before their next set; deadlift and bench follow the same rail.

- **Weeks 1-2: Recording loop.** Framing coach with live grade, auto start/stop on bar displacement, clip storage + retention pruning, lift/load entry.
- **Weeks 3-4: Squat engine.** Rep segmentation from landmark trajectories; depth/knee/torso/bar-path heuristics with camera-angle tolerance; confidence gating (refuse on bad framing); validation against the labeled set.
- **Week 5: Review screen.** Rep cards, the bar-path trace signature, scrubbing, verdict summary; cue phrasing pass (severity-calibrated language).
- **Week 6: Log + progression.** Sessions, set rows, per-lift charts, fault-load correlation.
- **Weeks 7-8: Deadlift + bench engines.** Same pipeline, lift-specific geometry (bar drift, hips-rise-early; touch consistency, J-curve); each validated on its own labeled set before enabling.
- **Week 9: Monetization.** RevenueCat paywall at the three gates; free-tier counters; restore; overlay export with free watermark.
- **Week 10: Risk flags + hardening.** Trend windows, flag banners with reviewed copy; thermal/battery pass (a 90-minute session must not cook the phone); offline QA.

**Acceptance criteria:**

- [ ] Rack-to-cues latency under 10 seconds for a 5-rep set on an iPhone 12
- [ ] Squat depth verdict matches expert labels on ≥90% of the validation set at `good` framing; **zero confident-wrong verdicts on `rejected` framing (the app must refuse instead)**
- [ ] Rep counting exact on ≥95% of validation clips
- [ ] Deadlift and bench engines pass their own labeled-set benchmarks before appearing in the lift chips
- [ ] Full loop works in airplane mode; app relaunch mid-workout loses nothing
- [ ] Free tier enforced: 4th weekly analysis triggers the paywall; clips older than 30 days pruned with prior notice
- [ ] Sandbox purchase, restore, and entitlement-expiry paths all verified
- [ ] Risk-flag copy legally reviewed; flags fire only from multi-session evidence in test fixtures
- [ ] 60fps overlay rendering on device; recording session battery drain measured and documented
- [ ] 10 beta lifters (TestFlight) through 2+ weeks each; ≥70% record in week 2 again; cue-trust survey ≥4/5

## Phase 2 — Launch (Weeks 11-16)

Goal: App Store launch, first 500 subscribers, the overlay flywheel running.

- App Store listing: ASO on "form check" / "squat form" / "bar path" keyword families; screenshots led by the trace overlay
- Landing page per MARKETING_PLAYBOOK.md (device: the traced bar path on a real PR clip)
- Creator seeding: 20 lifting creators with free premium + export presets sized for TikTok/Reels/Shorts
- Onboarding polish: first-run demo analysis on a bundled sample clip (value before camera permission)
- Weekly review moment (trend summary + annual upsell placement)
- Apple featuring pitch assets (on-device ML + privacy story, localized screenshots, one-pager)
- Reddit methodology posts (r/fitness, r/powerlifting): how we judge depth, why we refuse bad angles

**Acceptance criteria:**

- [ ] Live on the App Store with ≥4.5 rating over ≥50 reviews
- [ ] 500 paying subscribers; trial-to-paid conversion ≥ 35%
- [ ] Ranking top-10 for "form check" and top-25 for "squat form" in US App Store search
- [ ] ≥100 organic overlay shares/week measured via export events
- [ ] ≥5 creator videos live with trackable installs; CPI from creator content under $2 blended
- [ ] Crash-free sessions ≥ 99.5%; analysis-failure rate (excluding refusals) < 2%
- [ ] Refusal UX validated: ≥60% of `rejected` framings are re-recorded successfully within the session (users fix setup instead of quitting)

## Phase 3 — Growth (Months 5-12)

Goal: $15k+ MRR, retention proof, and the moats that compound (data, coach loop, Android).

- OHP + accessory lift packs (each with its own labeled validation set)
- Coach-share portal: send a set link with cues to a human coach; coach annotations come back in-app (the "coach's eyes between check-ins" positioning made literal)
- Fault-history intelligence: personalized warm-up cues from your own recurring faults ("you cut depth above 85% — first heavy single, sit back")
- Opt-in anonymized clip contribution -> labeled-data flywheel for engine accuracy (explicit consent, revocable, never default-on)
- Android launch behind a device-capability gate (measured fps floor, not a degraded tier)
- Apple Watch companion: rest timer + set logging on wrist
- Seasonal pushes for New Year and September; annual-plan price test at the week-4 review moment

**Acceptance criteria:**

- [ ] $15k MRR; monthly logo churn < 6% (fitness-category-honest target)
- [ ] Month-3 subscriber retention ≥ 55%; week-4 free-user retention ≥ 25%
- [ ] Engine accuracy improved measurably on the (now larger) validation sets and published as a changelog ("depth verdict 94% -> 97%") — honesty over vanity
- [ ] Coach portal used by ≥50 coach-lifter pairs; ≥30% of invited coaches return for a second athlete
- [ ] Android launch covering devices for ≥60% of Android installs-by-interest without dropping below the fps floor
- [ ] Clip-contribution opt-in ≥ 15% of premium users with zero consent complaints
- [ ] Annual mix ≥ 45% of new subscriptions
