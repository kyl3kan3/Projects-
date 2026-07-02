# DriftOff

**Sleep sounds, wind-down routines, and smart alarms — a sleep-only app that works offline, needs no account, and charges one simple annual price.**

## The problem

Falling asleep is a mass-market problem: roughly a third of adults report regular trouble sleeping, and "sleep sounds" / "rain sounds" / "sleep timer" are perennially among the highest-volume App Store search terms. The incumbent solutions are either:

- **Bloated wellness super-apps** (Calm, Headspace) where sleep is one tab among meditation courses, kids' content, and celebrity narration — priced accordingly ($70+/yr) and heavy (hundreds of MB, account required, constant upsells).
- **Free sound apps** riddled with ads that interrupt the exact moment you're drifting off.
- **Hardware-ish sleep trackers** (Sleep Cycle, Pillow) that focus on measurement, not on the *getting to sleep* part.

Nobody owns the position of "the simple, respectful app that just puts you to sleep and wakes you up gently." That's DriftOff.

## Target user

- Adults 25–55 who have trouble falling asleep or staying asleep, skew slightly female, skew iOS.
- People who already fall asleep to YouTube rain videos or a free ad-supported noise app and are one bad ad-interruption away from paying for something better.
- Privacy-conscious users burned by wellness apps that demand an account, an email, and a "how are you feeling today?" survey before playing a single sound.
- Frequent travelers who need soundscapes to work in airplane mode.

## Market & profitability

- **Health & fitness is the only app category where annual plans dominate — ~60.6% of subscriptions** (RevenueCat State of Subscription Apps). That means strong up-front cash flow: every conversion is ~$60 collected on day 8, not $13 dripped monthly with churn risk every cycle.
- Sleep is one of the highest-retention sub-niches inside health & fitness because usage is *nightly and habitual* — the app is part of a bedtime ritual, which is the strongest retention pattern in consumer mobile.
- BetterSleep (Ipnos) and Calm have demonstrated 8-figure annual revenue in this exact category; Sleep Cycle is a publicly listed company built on one alarm feature. The category is proven; the open question is only what slice a focused indie app captures.
- **Realistic expectation: $5k–$50k MRR** (in annualized terms, ~$60k–$600k ARR) for a well-executed, ASO-driven sleep app. Reaching the top of that range requires sustained App Store search ranking on 3–5 head terms plus a working paywall — not virality. This is a grind-it-out ASO business, not a lottery ticket.
- Margins are excellent: audio content is produced once and served from CDN/bundle; there is no per-user AI cost, no server-side account infrastructure in the MVP, and Apple/Google take 15% (Small Business Program) up to $1M/yr.

## Monetization & pricing

Monetization via **RevenueCat** (single source of truth for entitlements, trials, and cross-platform receipts).

| Tier | Price | What you get |
|------|-------|--------------|
| Free | $0 | 3 soundscapes, basic alarm, bedtime reminder |
| **Premium Annual (hero SKU)** | **$59.99/yr with 7-day free trial** | Full sound library (50+ sounds), mixer (layer up to 4 sounds), all wind-down programs, sleep-cycle smart alarm, morning sleep report, offline downloads |
| Premium Monthly (fallback) | $12.99/mo | Same as annual; shown as the de-emphasized second option on the paywall |

Paywall strategy: annual-first with trial, monthly displayed as the anchor that makes annual look like a 62% discount. One entitlement (`premium`), no lifetime SKU at launch (test it in Phase 3), no consumables. Paywall shown after first free-sound session and at every premium-feature touch.

## MVP feature list

- [ ] Soundscape player: 3 free + 20 premium sounds, background audio, sleep timer with fade-out
- [ ] Soundscape mixer: layer up to 4 sounds with per-channel volume (premium)
- [ ] Guided wind-down programs: 3 audio programs (breathing, body scan, story) with nightly progression (premium)
- [ ] Smart alarm: wake window (e.g. 6:30–7:00) with motion/audio-based light-sleep detection, gentle ramping alarm sound (premium; basic fixed alarm free)
- [ ] Bedtime reminders: local notification at user-set wind-down time
- [ ] Morning sleep report: time in bed, estimated cycles, alarm-window outcome, 7-day trend (premium)
- [ ] Offline-first: all owned audio downloadable; app fully functional in airplane mode with zero network calls
- [ ] No account: all data in on-device SQLite; RevenueCat anonymous app-user IDs
- [ ] Paywall + RevenueCat integration: trial handling, restore purchases, grace-period support
- [ ] Onboarding: 3-screen sleep-profile quiz that personalizes the default soundscape (and warms up the paywall)

Explicitly **not** in MVP: wearable/HealthKit integration, social features, sleep-talk recording, Android (iOS first — see roadmap), web app, AI-generated sounds.

## Differentiation

| Axis | DriftOff | Calm / Headspace | BetterSleep | Sleep Cycle |
|------|----------|------------------|-------------|-------------|
| Focus | Sleep only | Meditation super-app | Sleep + wellness sprawl | Tracking/alarm only |
| Account required | **No** | Yes | Yes | Yes |
| Offline-first | **Yes, everything** | Partial | Partial | No (tracking is core) |
| Pricing | One price, $59.99/yr | $69.99/yr + upsells | ~$60/yr + IAPs | ~$40/yr |
| Sounds + wind-down + smart alarm in one | **Yes** | No smart alarm | Weak alarm | No soundscapes/mixer |

The wedge: **the full bedtime loop (wind down → sleep sounds → smart wake → report) in one deliberately small app**, sold at one price, respecting the user enough to not require an email address. Calm can't credibly become "small and sleep-only"; Sleep Cycle can't credibly become a content app.

## Go-to-market channels

1. **ASO (primary, compounding):** target "sleep sounds", "rain sounds for sleeping", "white noise baby" (secondary), "smart alarm", "wind down". Localize metadata into DE/FR/ES/PT/JA early — sleep queries localize extremely well and competition drops sharply outside English.
2. **Apple Search Ads** on exact-match sleep terms; sleep keywords convert at high trial-start rates and annual pricing supports CPAs up to ~$15–20.
3. **TikTok/Reels/Shorts organic:** "rain on tent at 2am" ambience clips with app watermark — sleep-ambience content is an established high-view format; 3 posts/week, repurposed from the app's own soundscapes.
4. **Reddit** (r/insomnia, r/sleep — via genuinely useful comments, not spam) and one launch on Product Hunt for the initial review base.
5. **App Store featuring pitch:** small, polished, privacy-respecting, offline-capable apps are exactly what App Store editorial features; pitch around World Sleep Day (March) and New Year.

## Competition

| Competitor | Price | Strength | Weakness DriftOff exploits |
|------------|-------|----------|----------------------------|
| Calm | $69.99/yr | Brand, content library, marketing budget | Sleep is a side feature; heavy, account-gated, constant upsell |
| BetterSleep (Ipnos) | ~$59.99/yr | Big sound library, mixer | Cluttered UX, aggressive paywalling of previously-free features, poor reviews trend |
| Sleep Cycle | ~$39.99/yr | Best-known smart alarm, data science | No real soundscape/wind-down content; account + cloud required |
| Headspace | $69.99/yr | Brand, sleepcasts | Meditation-first; sleep content buried |
| Free noise apps (White Noise Lite, etc.) | Free/ads | Free | Ads at the worst possible moment; no alarm/report loop |

## Key risks

1. **Platform dependence / ASO volatility.** An App Store ranking change can halve installs overnight. Mitigation: diversify to Android in Phase 3, build the ASA + organic-social mix so no single channel is >50% of installs.
2. **Smart-alarm accuracy skepticism.** Accelerometer/mic-based cycle detection is approximate; overclaiming invites 1-star reviews. Mitigation: honest copy ("wakes you in a light-sleep window"), ship the alarm as "gentle wake window" rather than medical-grade tracking.
3. **Content cost creep.** Licensed audio can get expensive. Mitigation: commission original recordings (one-time buyouts, ~$100–300/track) and generate ambience layers in-house; never rev-share on core library.
4. **Category giants outspend on ads.** Mitigation: don't fight Calm on broad terms; own long-tail sleep-sound queries and non-English locales where CPAs are a fraction of US English.
5. **iOS background-audio and alarm API constraints.** Reliable alarms while the app is backgrounded/killed require careful use of critical alerts / audio sessions and have real platform limits. Mitigation: prototype the alarm path in week 1 of Phase 1 (it's the riskiest technical assumption); fall back to "alarm works with app open on nightstand + charger" positioning, which is how Sleep Cycle historically operated.
6. **Trial abuse / refund churn on annual.** Mitigation: RevenueCat trial-conversion analytics from day one; 7-day trial length is the category norm and converts best per RevenueCat benchmarks.

## Success criteria (12 months)

- 4.6+ App Store rating with 1,000+ ratings
- Top-10 App Store search rank on at least 3 target keywords in 2+ locales
- Trial-start → paid conversion ≥ 35% (health & fitness annual benchmark range)
- ≥ $8k MRR-equivalent (annualized/12) by month 12, with ASA spend ≤ 30% of revenue
