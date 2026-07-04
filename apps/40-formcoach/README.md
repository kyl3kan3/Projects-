# FormCoach

**FormCoach is an AI form-check in your pocket: prop your phone against a plate, record a set, and get depth, bar-path, and spine cues on every rep — on-device, in the rack, before your next set.**

---

## The Problem

1. **Most lifters train blind.** Squat depth, bar drift, lower-back rounding on deadlifts — the faults that stall progress and cause injuries are exactly the ones you cannot feel and cannot see mid-set. The standard advice is "film your sets," and millions do: tripods and phones propped against plates are gym furniture now. But the footage mostly goes unwatched, because untrained eyes don't know what to look for.
2. **Feedback that exists is slow, expensive, or hostile.** A good coach runs $150-300/mo. Reddit form-check threads take a day and answer with contradictory opinions. In-gym unsolicited advice is famously unwelcome. The moment that matters — the 90 seconds between sets when you could actually fix the fault — has no product serving it.
3. **Existing apps track everything except the thing that matters.** Strong, Hevy, and the tracker crowd log sets/reps/weight meticulously and say nothing about how the rep looked. Velocity trackers (bar-speed devices) serve powerlifting nerds at $300+ hardware price points.
4. **Injury is the silent churn event of lifting.** A tweaked back doesn't just pause training; it pauses the identity. Lifters pay for insurance against it — that's half of what coaching *is*.

On-device pose estimation crossed the usable threshold: modern phones run 30+ fps skeletal tracking with no upload, no latency, and no privacy conversation. The rack-side form check is now buildable as a $12.99/mo app.

## Target User

- **Primary:** the intermediate lifter, 20-40, running a structured program (5/3/1, GZCLP, PPL) in a commercial or garage gym. Already films sets sometimes. Follows lifting content (r/fitness, r/powerlifting, lifting YouTube/TikTok). Pays for apps without procurement anxiety.
- **Secondary:** returning-from-injury lifters who need confidence more than coaching; late beginners who never learned the lifts properly and are too self-conscious to ask.
- **Not a target (yet):** competitive powerlifters with real coaches (they need meet-day judging nuance), CrossFit-style mixed modal training, or physio/clinical use (regulatory line we do not cross).

## Market & Profitability

- **Health & Fitness is the best-monetizing category in mobile subscriptions, period.** It posts the highest revenue per install of any category — day-365 P90 RPI of $4.19 and the highest payer LTV (median $16.44, upper quartile $31.12) across 115,000+ apps studied (RevenueCat, State of Subscription Apps 2025). Lifters specifically are habitual, identity-driven users: the training log is opened 3-5x/week for years.
- **The willingness-to-pay anchor is coaching, not apps.** $12.99/mo sits against $150-300/mo human coaching and $300+ velocity-tracking hardware — the price is a rounding error against the alternative, which is the same math that makes fitness the category leader.
- **Realistic outcome: $15k-$120k MRR.** Fitness is winner-take-most at the top (RevenueCat's data shows the category's revenue concentrating in top performers), but the form-check niche is unowned: trackers don't analyze, and the AI-form apps that exist are demo-grade. A focused tool with genuinely good cues can own "form check" in ASO and lifting communities.
- **Margins are app-store margins.** Pose estimation runs on-device: zero inference cost per set, no video upload infra. COGS is essentially store commission (15% under $1M/yr) + a thin sync backend. Gross margins ~80% after commission.

## Monetization & Pricing

Powered by RevenueCat (`react-native-purchases`) with a single `premium` entitlement. Freemium — the free tier is a real tool, not a demo, because the paywall moment needs a believer.

| Plan | Price | Notes |
|---|---|---|
| Free | $0 | 3 analyzed sets/week, squat only, current-session cues, log capped at 30 days |
| Monthly | $12.99/mo | The category-standard price point for serious-tool fitness apps |
| Annual | $79.99/yr (7-day trial, hero SKU) | ~49% discount; pushed at the week-4 progress-review moment |

**Premium unlocks:** unlimited analyzed sets, all lifts (deadlift, bench, OHP as shipped), bar-path overlays and rep-by-rep breakdowns, full history + progression analytics, injury-risk flags with trend tracking, and data export.

**Paywall placement:** on the 4th set of the week, on first non-squat lift selection, and at the first weekly review showing a fault trend ("your depth degraded as load increased — see every rep"). Never mid-set; never between recording and seeing *something*.

## MVP Feature List

- [ ] Guided recording: angle/framing coach (side-on for squat/deadlift, incline for bench), auto start/stop on bar movement, phone-propped-against-plate ergonomics
- [ ] On-device pose estimation pipeline (30fps skeletal tracking, no video leaves the phone by default)
- [ ] Rep segmentation and counting from bar/hip trajectory
- [ ] Squat analysis: depth (hip-below-knee with camera-angle tolerance), knee tracking, torso angle, bar path over mid-foot
- [ ] Deadlift analysis: bar drift from mid-foot, hips-rise-early detection, lumbar-flexion proxy flag
- [ ] Bench analysis: touch point consistency, bar path (J-curve), elbow flare proxy
- [ ] Rep-by-rep cue cards in plain lifter language ("reps 4-5 cut ~2 inches high"), ranked by severity, 90-second readable
- [ ] Bar-path overlay rendered on the clip (the shareable artifact)
- [ ] Set log: lift, load, reps, RPE, linked analysis; load-progression charts per lift
- [ ] Injury-risk flags: pattern trends across sessions (progressive lumbar rounding, unilateral shift), framed as "worth attention," never diagnosis
- [ ] Paywall + RevenueCat integration; free tier limits enforced
- [ ] Local-first storage (SQLite); analysis works in airplane mode

Post-MVP (explicitly cut from v1): OHP and accessory lifts, velocity/bar-speed metrics, program builder, coach-sharing portal, Android launch, Apple Watch companion.

## Differentiation

1. **In-the-rack latency.** Analysis completes on-device before your rest timer ends. Cloud-video competitors take minutes and a privacy disclosure; we take seconds and nothing leaves the phone. The rest-period moment is the product.
2. **Cues, not scores.** No red-yellow-green "form grade" theater. Each rep gets the specific fault, its size, and the standard fix — the language a good coach uses. Trust in cue quality is the moat, so v1 ships three lifts done excellently instead of twenty done approximately.
3. **The bar-path overlay is the growth loop.** A traced bar path on your own PR clip is inherently shareable to lifting social media — every share is a demo. Watermarked on free, clean on premium.
4. **Honest about camera limits.** Single-camera pose estimation has known failure modes (occlusion, bad angles). FormCoach grades its own confidence, refuses to cue when framing is bad, and tells you how to fix the setup — competitors bluff, and lifters can tell.
5. **Progression context.** Faults are correlated with load ("rounding appears above 85% of your max") because the log and the analysis live in one app. Trackers have the load data but no eyes; we have both.

## Go-to-Market

- **ASO on the unowned intersection:** "form check," "squat form," "deadlift form," "bar path" — high-intent keyword families no major tracker claims. Title/subtitle carry it ("FormCoach: Squat & Deadlift Form Check").
- **The overlay as content engine:** creators get free premium; every "AI checked my squat" video is a native demo. Seed r/formcheck-adjacent creators and lifting TikTok specifically — the before/after fault-fix format is proven viral material.
- **Reddit, done respectfully:** r/fitness, r/powerlifting, r/gzcl form-check culture is the exact behavior we productize. Founder posts on cue methodology and camera-angle honesty, not link drops.
- **Program-community partnerships:** 5/3/1, GZCLP, and PPL communities run on spreadsheets; a "works with your program" logging + analysis story fits without displacing anyone.
- **App Store featuring pitch:** on-device ML + camera + privacy story is exactly what Apple features; build the pitch assets (localized screenshots, one-pager) into Phase 2.

## Competition

| Competitor | Pricing | Weaknesses |
|---|---|---|
| **Strong / Hevy** (trackers) | Free-$10/mo | Own the log, zero form analysis. We integrate the log so switching cost works for us, not them. |
| **Form-check AI apps (e.g. WeLift-class, PoseCoach-class demos)** | Free-$10/mo | Demo-grade cues, cloud latency, no progression context; none owns the ASO position or lifter trust. |
| **Velocity trackers (Vitruve, RepOne, Enode)** | $200-400 hardware | Bar speed, not form; hardware friction; powerlifting-nerd niche. |
| **Online coaching** | $150-300/mo | The real incumbent and the price anchor. Wins on accountability and programming; loses on latency, price, and the between-sets moment. We position as the coach's eyes between check-ins, not a coach replacement. |
| **Filming + Reddit form checks** | Free | Slow (hours-days), inconsistent, public. "Good enough and free" for the patient; our buyer wants the answer before the next set. |

## Key Risks

1. **Cue accuracy is existential.** One confidently wrong "you hit depth" on a clearly high squat, posted to Reddit, poisons the brand. Mitigation: confidence gating (refuse rather than guess), camera-setup coaching, per-lift validation against expert-labeled clips before each lift ships, and cue phrasing calibrated to certainty ("likely ~1 inch high" not "FAIL").
2. **Single-camera physics.** Depth and spine flexion from one lens have irreducible error at bad angles. Mitigation: framing guide with live feedback, angle-aware tolerances, and explicit "can't judge depth from this angle" states. Never pretend precision we don't have.
3. **Injury-liability line.** "Injury-risk flags" drift toward medical claims fast. Mitigation: strict "pattern worth attention" framing, no diagnosis or treatment language, legal review of all risk copy, and flags always paired with "consult a professional" pathways.
4. **Device fragmentation on Android.** On-device pose performance varies wildly. Mitigation: iOS-first launch; Android in Phase 3 with a device-capability gate rather than a degraded experience.
5. **Category giants adding a checkbox feature.** A tracker could bolt on "form feedback." Mitigation: cue depth and trust take years of labeled data and iteration — the same reason trackers haven't done it; speed and single-minded focus are the defense.
6. **Sherlocking via platform APIs.** Apple keeps expanding Vision/Fitness frameworks. Mitigation: the value is lift-specific biomechanics knowledge and progression context, not the skeleton — platform improvements lower our costs more than they commoditize us.

---

## Repository Layout

This folder is a **scaffold**: documentation plus typed stub files. It is not a runnable app; there is no `node_modules` and no business logic. See `ARCHITECTURE.md` for system design, `ROADMAP.md` for phasing, and the stub headers in `app/` and `src/lib/` for per-file TODOs.
