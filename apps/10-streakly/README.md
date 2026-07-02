# Streakly

**Streakly is a habit tracker and focus timer in one loop: start a pomodoro directly from a habit, keep the streak alive, and review your week with a small circle of people who see your progress.**

---

## The Problem

Productivity enthusiasts run two apps that do not talk to each other:

1. **Habit apps do not help you actually do the habit.** Streaks, Habitify, and Habitica are checklists. They record that you did "Deep work" but offer nothing for the 50 minutes it takes to do it. The moment of intention ("I should work now") and the moment of execution (a timer) live in different apps, and the context switch is where habits die.
2. **Timer apps do not track consistency.** Forest and generic pomodoro apps make one session pleasant but have no memory. You can focus brilliantly on Tuesday and vanish for two weeks; the app does not notice or care.
3. **Streak loss feels punitive.** The single biggest churn event in habit apps is a broken streak. Users who lose a 60-day streak do not shrug and restart; a large share rage-quit the app entirely. Almost no mainstream habit app treats streak repair as a first-class, honest mechanic.
4. **Solo accountability fails.** Self-report to yourself is the weakest form of commitment. Public social feeds are too noisy and performative; what works is a small group of 3 to 8 people who actually notice when you disappear.

Streakly's bet: fuse the checklist and the timer into one action, make the streak forgiving enough to survive real life, and add just enough social pressure to make quitting feel like letting someone down.

## Target User

The **app-hopping productivity enthusiast**: 20 to 40 years old, has tried at least two habit apps and at least one pomodoro app in the past year, currently uses neither consistently. They follow productivity content (#studytok, r/getdisciplined, Ali Abdaal-adjacent YouTube), they pay for software ($5 to $10/mo is unremarkable to them), and they care what their home screen looks like. They are not looking for a life OS or a gamified RPG; they want one beautiful tool that closes the loop between "I planned it" and "I did it."

Secondary: students during exam seasons (September, January, May spikes) and remote workers structuring unsupervised days.

## Market and Profitability

- **Category economics.** In the Productivity category, roughly **77% of subscriptions are monthly plans** (RevenueCat benchmark). This is unusual: most consumer app categories skew annual. It means (a) the monthly price point carries the business, (b) LTV is driven by month-over-month retention rather than annual prepay, and (c) retention mechanics are not a nice-to-have, they are the revenue model.
- **Realistic outcome.** A well-executed indie habit app in this category plausibly lands at **$5k to $60k MRR**. The floor is a niche audience acquired through organic ASO and content; the ceiling requires an App Store feature, a viral widget moment, or both. This is a great solo/duo business and a bad venture story. Plan costs accordingly.
- **Honesty about the category.** Habit tracking is one of the most crowded consumer categories that exists. There are hundreds of live competitors and the top ones are genuinely good. Nobody wins here on feature count. The winners of the last five years (Streaks, Forest, Opal) differentiated on **design quality and retention mechanics**, not functionality. Streakly's plan assumes the same: the moat is craft (widgets, animation, the feel of completing a habit) plus mechanics that keep people past the first broken streak (repair, circles, weekly review).

## Monetization and Pricing

Powered by RevenueCat (`react-native-purchases`) with a single `premium` entitlement.

| Plan | Price | Notes |
|---|---|---|
| Free | $0 | 3 habits max, basic timer, no widgets, no circles |
| Weekly | $3.99/week | 3-day free trial; the impulse/exam-season plan |
| Monthly | $6.99/month | Expected volume leader (77% of category subs are monthly) |
| Annual | $39.99/year | ~52% discount vs monthly; pushed at weekly review moments |
| Lifetime | $69.99 one-time | For subscription-averse users; capped visibility on paywall |

**Premium unlocks:** unlimited habits, home-screen widgets, accountability circles, full focus statistics and history, streak freeze/repair tokens, and data export (CSV/JSON).

**Paywall placement:** at the 4th habit, on first widget setup, on first circle join, and after the first completed weekly review (the moment of highest perceived value). Weekly plan with trial is prominent but not dark-patterned; aggressive weekly-only paywalls are a known App Store rejection and churn risk (see Risks).

## MVP Feature List

- [ ] Create/edit/archive habits with schedule (daily, specific weekdays, x-per-week)
- [ ] One-tap habit completion with haptic + streak animation
- [ ] Streak engine: current streak, best streak, grace rules for non-daily schedules
- [ ] Streak freeze (bank up to 2) and streak repair (24h window, premium)
- [ ] Focus timer: pomodoro presets (25/5, 50/10) and custom durations
- [ ] Start a focus session directly from a habit; completion auto-logs the habit
- [ ] Focus session history per habit (count, total minutes)
- [ ] Today screen: habits due today, completion state, next suggested focus block
- [ ] Weekly review ritual: guided Sunday flow (wins, misses, one adjustment) with local notification
- [ ] Local notifications: habit reminders and focus session end
- [ ] Paywall + RevenueCat integration, free tier enforced at 3 habits
- [ ] Onboarding: pick 1 to 3 starter habits from curated templates
- [ ] Local-first storage in SQLite; app fully usable offline
- [ ] Settings: day-start hour (for night owls), notification preferences, data export (premium)
- [ ] iOS home-screen widget: single habit ring + streak count (fast follow if not in v1)
- [ ] Accountability circles: create/join via invite link, see members' streaks (Phase 3)

## Differentiation

1. **The unified habit + focus loop.** Tap a habit, land in a timer, finish the timer, the habit is logged and the streak advances. No competitor closes this loop: Streaks has no timer, Forest has no habits, Habitify's timer is a buried afterthought. This is the product's one sentence and every design decision defends it.
2. **Widgets as the acquisition surface.** The widget is not a companion feature; it is the marketing. A genuinely beautiful streak-ring widget on a home screen is a screenshot people share voluntarily. Widget quality gets design budget comparable to the app itself, and every screenshot asset leads with it.
3. **Accountability circles for retention.** Small (3 to 8 person) private groups that see each other's streaks and focus minutes. No feed, no comments in v1, no likes; just presence and gentle nudges ("Sam is 2 hours from losing a 30-day streak"). Circles also power the referral loop: joining requires the app.
4. **Streak repair as an honest mechanic.** Freezes are earned (one per 7 consecutive completed days, bank max 2) and repair is a limited premium action, not a pay-to-cheat slot machine. The goal is to convert the number-one rage-quit moment into a retention (and conversion) moment while keeping streaks meaningful.

## Go-to-Market

- **ASO cross-keyword strategy.** Target the intersection nobody owns: rank for both "habit tracker" and "pomodoro timer" / "focus timer" keyword families. Title/subtitle carry both ("Streakly: Habit & Focus Timer"). The cross-position is defensible because single-purpose competitors cannot claim it honestly.
- **Widget-led social content.** Aesthetic home-screen setups are an evergreen content genre. Ship widget themes designed to look good in screenshots; post setups on Pinterest (home screen aesthetic boards), TikTok/Reels under #studytok #productivity #homescreen, and partner with study-with-me creators for whom a visible streak widget is native content.
- **Reddit, done respectfully.** r/getdisciplined, r/productivity, r/pomodoro: founder posts about the streak-repair philosophy and the "two apps, zero habits" problem, not launch spam. These communities convert when you bring an opinion, not a link.
- **App Store featuring pitch.** Apple features apps that showcase platform tech: WidgetKit, Live Activities (timer on lock screen), interactive widgets. Build the featuring pitch into the roadmap (localized screenshots, a press kit, an editorial one-pager) and submit around seasonal moments.
- **Seasonal spikes.** New Year (resolutions) and September (back-to-school/new-term) are the category's two demand spikes. Plan releases, price tests, and content pushes 4 to 6 weeks ahead of each; the weekly plan exists largely to monetize spike-driven, short-horizon users.
- **Built-in viral loop: circle invites.** Circles require members, members require the app. Invite links are free to send and gift the inviter a streak freeze when a friend joins. This is the only growth mechanic that compounds without ad spend; instrument it from day one.

## Competition

| Competitor | Pricing | Strengths | Weaknesses |
|---|---|---|---|
| Habitica | Free; $4.99/mo Plus | Deep gamification (RPG), strong community/parties, cross-platform | Dated UI, overwhelming for casual users, gamification wears off, no focus timer integration to speak of |
| Streaks (iOS) | $5.99 one-time | Beautiful, Apple Design Award, excellent widgets/watch, one-time price | iOS only, no timer, no social layer, one-time purchase caps how much ongoing development it funds |
| Habitify | Free; ~$5/mo or ~$40/yr premium | Clean cross-platform, good stats, has a basic timer | Timer is bolted on, weak retention mechanics, generic brand, forgettable widgets |
| Forest | ~$3.99 one-time + IAP | Iconic focus metaphor, huge brand, real-tree planting hook | Sessions only, no habit/consistency layer, aging design, weak stats |

The gap: nobody owns "the habit you actually do, timed." Streaks owns design, Forest owns focus, Habitica owns gamification, Habitify owns cross-platform utility. The habit-plus-focus loop with modern widgets and small-group accountability is an open position.

## Key Risks

1. **Extremely crowded category.** Hundreds of habit trackers; ASO is contested and CPCs on obvious keywords are unprofitable for indie economics. Mitigation: cross-keyword positioning, widget-led organic content, and accepting the $5k to $60k MRR band as the honest target rather than spending toward a venture-scale outcome.
2. **Apple sherlocking.** Apple keeps expanding Journal, Reminders (already does basic recurring habits), and Screen Time-adjacent focus features. A first-party "habits" surface would compress the whole category. Mitigation: differentiate on the loop and circles (Apple will not build small-group accountability), and keep the brand strong enough that users choose it over the default.
3. **Retention cliff after streak loss.** The core engagement mechanic is also the top churn trigger. If freeze/repair tuning is wrong (too stingy: rage quits; too generous: streaks feel fake), retention and revenue both suffer. Mitigation: instrument streak-loss cohorts from day one; treat freeze/repair parameters as the most important A/B surface in the app.
4. **Circles need liquidity.** An accountability circle with one person is a broken promise. Early users will not have friends on the app. Mitigation: circles ship in Phase 3 behind invite flows, seed "starter circles" by topic (morning routine, deep work, fitness) with opt-in matching, and never make circles the empty-state default.
5. **Weekly-plan churn and App Store review sensitivity.** $3.99/week monetizes spikes but drives high churn and refund rates, and Apple has rejected or delisted apps with aggressive weekly paywalls (hidden pricing, trial-to-weekly traps). Mitigation: transparent paywall copy, monthly plan visually primary, weekly clearly labeled with trial terms, and conservative review-guideline compliance over squeezing short-term ARPU.

---

## Repository Layout

This folder is a **scaffold**: documentation plus typed stub files. It is not a runnable app; there is no `node_modules` and no business logic. See `ARCHITECTURE.md` for system design, `ROADMAP.md` for phasing, and the stub headers in `app/`, `lib/`, and `src/server/` for per-file TODOs.
