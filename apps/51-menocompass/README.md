# MenoCompass

**MenoCompass is a local-first perimenopause companion that tracks all 34+ symptoms AND the HRT that treats them — every dose, patch change, and lab — then turns your data into a doctor-ready report no one can dismiss.**

---

## The Problem

Over 1 billion women worldwide are in perimenopause or menopause, and the software built for them is a decade behind the period trackers built for their daughters. Four specific failures:

1. **Symptom chaos with no instrument.** Perimenopause spans 30+ symptoms — hot flashes, night sweats, brain fog, rage, joint pain, hormonal insomnia — arriving irregularly over 4–10 years. Women track them in Notes apps and spreadsheets because mainstream cycle trackers assume a regular 28-day cycle and fall apart the moment cycles turn irregular (the top functional complaint in Flo and Clue 1-star reviews).
2. **Nobody tracks the treatment.** Women on HRT juggle patches changed twice weekly, daily gels, sprays, tablets, and cyclical progesterone — plus dose changes and lab draws. Almost no app logs actual HRT medication across delivery methods; the handful that try are week-old indie experiments. A missed patch change means days of returned symptoms, and "did my dose change help?" is answered by vibes.
3. **Medical dismissal by default.** 1 in 5 women waits over a year for a perimenopause diagnosis; only 34% of women 35–54 hear about perimenopause in a medical setting. Walking into a 12-minute GP appointment with "I feel off" loses. Walking in with a one-page report — symptom frequency, severity trends, cycle irregularity, current regimen, response since the last dose change — wins.
4. **The incumbents are content libraries, not tools.** Balance (the category's best-known app) ships broken report generation, duplicate manual entry with no Apple Health import, and no wearables. Caria paywalls most features and has no calendar view of symptom patterns. Stella is B2B-only. Health & Her exists to sell its own supplements. Users of all of them describe "awareness without solutions."

MenoCompass attacks all four with a fast daily check-in built for irregular bodies, a real medication engine, on-device data, and one button that renders the clinician PDF.

## Target User

**The 44–58-year-old woman in the perimenopause tunnel.** She has 8+ recurring symptoms, suspects (or knows) they're hormonal, and is either fighting for an HRT prescription or managing one. She's the wealthiest, highest-converting demographic in consumer apps (women's install-to-purchase runs 79% higher than men's) and the least served: she searches "perimenopause symptoms" 201,000 times a month in the US while the entire app category gets ~750 searches — a market with demand and no brand. She distrusts health apps (only 7% of women fully trust them, and she watched Flo's data end up in a Meta courtroom), so privacy is a purchase criterion, not a nicety.

Secondary: the woman post-menopause managing long-term HRT; the woman whose clinician asked her to "keep a symptom diary" before a follow-up.

## Market & Profitability

- **The demand asymmetry is the largest in femtech.** "Perimenopause symptoms": 201K monthly US searches at keyword difficulty 26. "Menopause symptoms": 110K. "Perimenopause app"/"menopause app": ~750 combined at KD 15 — with advertisers paying **$11–13 CPC**, 2–2.5× the period-tracker CPC. The problem is enormous and the solution category is unformed.
- **Willingness to pay is proven at every altitude.** Consumers: Caria charges $49.99/yr; Flo converts 6.6M subscribers at ~$40/yr. Clinics: Midi Health hit a ~$150M revenue run-rate and ~$1B valuation on menopause care alone. Employers: Maven's menopause line grew 300% YoY. The daily-companion app layer between these is unclaimed.
- **Category economics favor annual subscriptions.** Health & Fitness is the best-monetizing app category (highest 12-month install LTV of all categories) and the only one where annual plans dominate and expand (61% of revenue and rising). High-priced annual plans yield ~4× the LTV of cheap ones — women's health apps systematically underprice.
- **Competition timing is favorable.** Femtech company formation collapsed from 508 new companies (2020) to 53 (2024); menopause got just 12% of 2022–25 femtech funding; incumbent consumer apps are grant-funded (Balance) or subscale. No funded incumbent owns HRT management.
- **Realistic revenue target: $20k–$150k MRR.** At category-standard conversion with a $59.99/yr anchor, 5,000 paying subscribers ≈ $25k MRR — reachable on ASO plus content SEO against 300K+ monthly problem searches, without paid UA. Costs are near zero: all user data lives on device; there is no backend (see ARCHITECTURE.md). Gross margin is store-commission-bound.

Sources: DataforSEO Google Ads (US, June 2026) · RevenueCat State of Subscription Apps 2026 · Adapty H&F benchmarks · Rock Health Women in Focus 2025 · PwC/BCG menopause market analyses · full citations in the repo-level `WOMENS_NICHES_RESEARCH.md` (informational only; this folder is self-contained without it).

## Monetization & Pricing

Annual-first (the H&F category pattern), managed via RevenueCat.

| Tier | Price | Trial | Includes |
|------|-------|-------|----------|
| Free | $0 | — | Daily check-in (10 core symptoms), 30-day history, period/spotting log, 1 medication with reminders |
| Plus Annual | $59.99 / year | 7-day free trial | Everything: all 34+ symptoms + custom symptoms, unlimited history, full HRT regimen engine (all delivery methods, dose-change timeline), labs log, Apple Health import, correlation insights, doctor-ready PDF reports, CSV export |
| Plus Monthly | $9.99 / month | — | Same; the visible fallback for the commitment-averse |

Paywall mechanics:

- The free tier is a genuinely usable symptom diary — the app must earn trust before asking, because this audience's default is distrust.
- Paywall triggers at high-intent moments: adding the 11th symptom, adding a second medication, tapping "Generate doctor report," opening an insight card, importing Apple Health.
- Annual-with-trial is presented first; monthly is the same-screen fallback. RevenueCat offerings keep the mix remotely tunable.
- The privacy architecture is paywall copy: "Your data never leaves this phone. That's also why there's no free-forever ad tier — you are the customer, not the product."

## MVP Feature List

- [ ] Onboarding: life-stage quiz (perimenopausal / menopausal / post / unsure), current symptoms picker, HRT status; lands on the paywall after demonstrating value (first check-in completed, projected report preview)
- [ ] Daily check-in: one screen, <30 seconds — tap symptoms from the user's active set, 0–3 severity per symptom, optional note; designed for brain-fog usability (big targets, yesterday-prefill)
- [ ] Full symptom library (34+ curated symptoms across vasomotor, sleep, mood/cognitive, physical, cycle domains) + custom symptom creation (Plus)
- [ ] Cycle log that treats irregularity as first-class: period/spotting days, "no idea when the last one was" state, cycle-gap statistics — never a false "next period" prediction
- [ ] Medication engine: HRT regimens across delivery methods — patch (with twice-weekly change schedule), gel/spray (daily), tablets, cyclical progesterone, vaginal estrogen, plus non-HRT meds/supplements; local notification reminders per schedule
- [ ] Dose-change timeline: every regimen change is a dated event shown as a marker on all trend charts ("what changed and when")
- [ ] Adherence log: mark done/skipped from the notification or the home screen
- [ ] Labs log: date + panel (estradiol, FSH, TSH, etc.) + value + unit, charted alongside symptoms (log and display only — no interpretation)
- [ ] Trends: per-symptom frequency/severity charts (7/30/90-day), symptom-domain heat strips, cycle-gap chart, all annotated with dose-change markers
- [ ] Correlation insights (Plus): plain-language observational cards, e.g. "Night sweats averaged 40% lower in the 6 weeks after your Feb 12 dose change" — always correlational language, never causal or advisory
- [ ] Doctor-ready PDF report (Plus): one tap → last 90 days on one page — top symptoms with frequency/severity trend, cycle pattern, current regimen + change history, labs table; rendered on device, shared via the system sheet
- [ ] Apple Health import (Plus, read-only): sleep data pulled in and charted in Trends; degrades gracefully when denied
- [ ] Local-first storage: SQLite on device; user-controlled backup/export file (v1 plaintext JSON; restore + encryption roadmapped); **zero accounts, zero analytics SDKs, zero third-party trackers**
- [ ] Paywall (RevenueCat): $59.99/yr + 7-day trial primary, $9.99/mo fallback; restore purchases; free-tier gates as specified above
- [ ] Settings: reminder times, data export (CSV + full backup), delete-all-data, privacy explainer ("verify it yourself" — airplane-mode test instructions)
- [ ] Education cards: 20 bundled, clinician-reviewed-style referenced articles (each with citations to NAMS/NICE guidance); educational only, no diagnosis or dosing advice

## Differentiation

1. **The only tracker where treatment is a first-class object.** Symptom-only trackers answer "how bad is it?"; MenoCompass answers "is what I'm doing about it working?" — dose-change markers on every chart make the app the instrument for the HRT titration journey no incumbent serves.
2. **Built for irregular bodies.** No 28-day math anywhere. Cycle gaps, skipped months, and "unknown" are first-class states — the exact structural failure that makes Flo/Clue unusable for this demographic.
3. **The doctor report is the hero feature.** The moment that markets itself: a woman puts one page on the desk and is finally believed. Designed screenshot-first (it will be photographed and posted in menopause communities).
4. **Verifiably private.** On-device SQLite, no account, no analytics SDKs, no network calls except App Store/RevenueCat receipt validation. Post-Flo-verdict, this is a structural moat the funded incumbents (whose business models assume data) cannot copy, and the app tells users how to verify it (airplane mode works forever).
5. **Educational credibility without regulatory exposure.** Log, remind, correlate, educate — never diagnose, never advise doses. Stays inside FDA general-wellness enforcement discretion while every education card cites real clinical guidance.

## Go-to-Market

- **Content SEO against the 400:1 asymmetry.** A companion content site targeting long-tail problem searches ("perimenopause joint pain," "HRT patch vs gel," "estradiol levels perimenopause") — 300K+ monthly searches at KD ~26 with almost no app competing for them — each page funneling to the app. This is the primary channel; the search asymmetry IS the distribution strategy.
- **ASO.** Title/subtitle: "MenoCompass: Menopause Tracker" / "Perimenopause symptoms & HRT". Keywords: perimenopause tracker, menopause app, HRT tracker, hot flash log, hormone tracker. KD 15 terms with $11–13 CPC mean even tiny volume converts at high intent.
- **Menopause communities (earned, not ads).** r/Menopause (300k+ members) runs recurring "how do you track this?" threads answered today with spreadsheets; menopause Facebook groups have six-figure memberships. Genuine participation + the shareable doctor-report screenshot.
- **Clinician channel.** Menopause specialists and GPs ask patients to keep symptom diaries before follow-ups; a printable "your doctor asked you to track — here's the tool" one-pager for clinic waiting rooms. The PDF report is designed to make clinicians recommend the app.
- **Apple Search Ads** on competitor and category terms (balance app, caria, menopause tracker) — cheap at this category's competition level.
- **Press angle:** "The menopause app that can't leak your data" rides every recurring femtech-privacy news cycle for free.

## Competition

| Competitor | Pricing | Strengths | Weaknesses |
|------------|---------|-----------|------------|
| Balance (Newson Health) | Free + Balance+ subscription | Biggest brand (1.5M downloads), Dr. Newson's authority, ORCHA-certified content | Review complaints: broken report generation, degraded journaling after updates, no Apple Health import (duplicate entry), no wearables; content library first, tool second; grant-scale funding |
| Caria | $9.99/mo / $49.99/yr | Clean UX, has an RCT (17% hot-flash distress reduction), CBT content | Most features paywalled before value shown; no calendar view of symptom patterns; no wearable integration; symptom-only — no real HRT regimen engine |
| Midday | Subscription (opaque) | Mayo Clinic affiliation | iOS-only, undisclosed pricing, thin public traction; symptom-focused |
| Stella | B2B2C via insurers/employers | Clinical program depth | Not consumer-purchasable at all — structurally can't serve this buyer |
| Health & Her | Free | Free, UK retail brand | Exists to sell its own supplements; conflicted recommendations |
| Flo/Clue (default choice) | ~$40–50/yr | Habit, brand, polish | 28-day prediction math structurally fails irregular cycles (their own top 1-star complaint); no menopause mode with treatment tracking; privacy reputation destroyed post-verdict |
| DoneDose / HRTMe (new indies) | Free–$20/yr | Actually log HRT doses | Weeks old, single-feature (meds only, no symptom correlation), no design or distribution muscle |

MenoCompass's wedge: Caria's tracking polish + the HRT engine nobody has + Balance's credibility posture + privacy none of them can structurally match.

## Key Risks

1. **Medical-device line.** Correlation insights or education phrased as advice ("your dose is too low") would cross from general wellness into regulated territory. Mitigation: hard copy rules — observational, past-tense, "discuss with your clinician" framing; no diagnosis, no dosing suggestions, no symptom-cause claims; education cards cite guidance rather than instruct. Review every insight template against FDA general-wellness guidance.
2. **Apple Health entitlement & review.** HealthKit apps get extra review scrutiny and must justify every data type. Mitigation: read-only scopes (sleep, cycle), import is a Plus feature not a dependency, app fully functions with permission denied; privacy nutrition label is "data not collected" (true, because nothing leaves the device).
3. **Retention through a long, irregular condition.** Perimenopause lasts years; daily logging fatigue is real (users of incumbents report tracking "becoming a burden"). Mitigation: <30-second check-in with yesterday-prefill, notification-action logging (log a patch change without opening the app), weekly summary as the re-engagement surface, and the report/insight payoff loop — the data is worth something monthly, not just daily.
4. **RevenueCat/paywall dependency.** All revenue through one SDK. Mitigation: entitlements cached locally so an outage degrades to "Plus stays unlocked"; pricing experiments via offerings, not app updates.
5. **Incumbent wake-up.** Flo has the money to ship a "menopause mode." Mitigation: the moat is architectural (their business model monetizes data; ours forbids collecting it) and positional (own the HRT-management wedge and the clinician channel before they move); a data-selling brand cannot credibly market "we can't see your data."
