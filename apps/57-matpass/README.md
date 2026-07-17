# MatPass

**Martial-arts school management that keeps the promises a dojo makes: belt and stripe progression tracked per curriculum, kiosk check-in at the door, grading events with real eligibility rules (minimum classes plus time-in-rank), family memberships billed through Stripe, and retention flags before a quiet student becomes a quit student.**

## The Problem

A martial-arts school is a progression machine wearing a small business as a disguise. Every student is somewhere on a ladder — white belt, two stripes, eligible for grading in March if they hit 24 more classes — and the school owner is personally carrying that ledger for 150 students across four programs. In practice it's index cards, a whiteboard, memory, and the head instructor's gut. Stripes get forgotten. A kid who earned his grading gets skipped because nobody counted his classes. A parent asks "when does she test?" and the honest answer is "let me check three places."

Meanwhile the business side leaks. Attendance is taken by eyeball, so nobody notices that Marcus hasn't been in for three weeks — and in this industry, three quiet weeks *is* the cancellation, it just hasn't been emailed yet. Families with three kids training get billed as three unrelated memberships. Grading events are organized in a group text.

The incumbents are either gym software wearing a gi — billing-first platforms where belt tracking is a custom field — or aging martial-arts tools with the curriculum model but a decade-old workflow. None of them treat the school's core promise (*every stripe earned, on the wall and on record*) as the product.

MatPass is the progression ledger first: curricula with real rank requirements, attendance that feeds eligibility automatically, grading events that assemble their own candidate lists, family billing, and an attendance-drop alarm that fires while the student is still saveable.

## Target User

- **Primary:** single-location martial-arts schools — BJJ academies, karate/TKD dojangs, judo clubs — with 60-400 students, an owner-operator head instructor, and maybe one front-desk person. The buyer is the owner.
- **Secondary:** two-to-three location schools grown from one; after-school martial-arts programs with belt curricula.
- **Buyer profile:** a lifelong martial artist who never wanted to run a database. Buys when they see a grading event assemble its own eligibility list — the hours before every test, refunded.
- **Not a target (yet):** big-box gyms/fitness studios without rank progression (Wodify/Mindbody territory), national franchise HQs needing multi-brand reporting, tournament management.

## Market & Profitability

- **The category is real and priced in public.** [Kicksite charges $49-199/mo by student count](https://www.wodify.com/blog/pricing-guide-martial-arts-software); [Zen Planner runs $99-289/mo with commonly-cited add-ons pushing full stacks to $348-525+](https://zenplanner.com/pricing/); [Gymdesk spans $75-200/mo by member count](https://gymdesk.com/blog/best-martial-arts-management-software). Thousands of US schools already pay in exactly MatPass's $59-149 band.
- **The spend is anchored to revenue, not software budgets.** A 150-student school at $130-180/student-month grosses $20-27k/mo; $99 software is half of one student. The sales math is one *saved* student: catching a single $150/mo family before they quietly quit pays for the year.
- **Retention is the industry's open wound.** Martial-arts schools live and die on attrition, and the earliest reliable churn signal — attendance drop-off — is sitting in the check-in data nobody instruments. MatPass's retention flags are the feature the incumbents treat as a report and we treat as an alarm.
- **Realistic ceiling:** **$25k-$100k MRR** over 2-4 years (300-1,100 schools at ~$90 blended ARPU). Churn is structurally low once the rank ledger lives in the product: leaving means re-carrying every student's progression by hand.
- **Margins:** classic SaaS; email is the only meaningful variable cost. >90% gross margin.

## Monetization & Pricing

Priced by active student count — the honest scale axis, and the one the category already uses. All features in every tier; no per-feature ransom.

| Plan | Price | Students | Includes |
|---|---|---|---|
| **Dojo** | $59/mo | up to 100 | Curricula + belt/stripe tracking, kiosk check-in, grading events with eligibility, family memberships + Stripe billing, retention flags, email announcements |
| **Academy** | $99/mo | up to 250 | Everything in Dojo + multiple programs with separate curricula, instructor accounts, attendance analytics, document uploads (waivers), CSV export |
| **Federation** | $149/mo | up to 500 | Everything in Academy + multi-location (up to 3), cross-location reporting, API export, priority support |

14-day free trial, no card. Annual = 2 months free. Payment processing at standard Stripe rates — no markup on tuition.

## MVP Feature List

- [ ] Auth + school setup (Auth.js); roles (owner, instructor, front desk)
- [ ] Programs + curricula: rank ladders per program (belt, stripe steps, display order, color), per-rank requirements (minimum classes since promotion, minimum days in rank, instructor sign-off flag)
- [ ] Students: profile, program enrollments with current rank + promotion history, family grouping, photo, notes; CSV import from spreadsheets/incumbent exports
- [ ] Kiosk check-in: tablet-at-the-door mode (device-token locked, no staff login exposed), student searches name or enters PIN, taps their class, done in <5 seconds; late/manual check-in from the desk
- [ ] Class schedule: weekly recurring classes per program (day, time, instructor); check-ins attach to the nearest scheduled class
- [ ] Progression engine: classes-since-promotion and days-in-rank computed from check-ins and promotion history; per-student progress bar toward next rank
- [ ] Grading events: pick a date + programs, the eligibility list assembles itself (requirements met / near-miss with what's missing), invite/confirm candidates, run the event, batch-promote with one review screen — every promotion recorded with date, event, and grader
- [ ] Promotion history: the student's rank timeline ("the wall and the record"); printable certificates data (name, rank, date) as CSV/PDF export
- [ ] Family memberships + billing: households with multiple students, membership plans (per-student and family rates), Stripe subscriptions, failed-payment dunning states visible at the desk
- [ ] Retention flags: attendance drop-off detection (student's own baseline vs recent weeks), flagged list with "last seen 19 days ago · was 3x/week", one-tap log-a-call/email outcome
- [ ] Email announcements (school-wide or per program) with delivery status
- [ ] Billing for MatPass itself (Stripe, three tiers, trial)

Post-MVP (explicitly cut from v1): tournament/event ticketing, curriculum video content, belt-testing fee collection per event, SMS, native mobile apps (the kiosk is a web app on a tablet), point-of-sale/pro-shop, multi-brand franchise reporting.

## Differentiation

1. **The curriculum is the data model, not a custom field.** Rank ladders with real requirements drive eligibility, grading events, and the student's progress bar. Gym-first incumbents bolt belts onto membership software; MatPass bolts billing onto a progression ledger — the direction the buyer actually thinks in.
2. **Grading events assemble themselves.** "Who's ready to test?" is a query, not a weekend of index cards: requirements met, near-misses with exactly what's missing ("2 classes short"), and a batch-promotion flow with a review gate. This is the demo moment that closes school owners.
3. **Check-in exists to feed progression and retention** — not just to count heads. Every kiosk tap advances a progress bar and updates the drop-off baseline. The data works double shifts.
4. **Retention flags fire while the student is saveable.** A student's own cadence is the baseline (3x/week kid vs 1x/week adult), so the alarm is personal and early — with a built-in outreach log so "we called, mom says knee injury, back in June" is on record, not in the owner's head.
5. **Families are first-class.** One household, three students, one payment method, one family rate — and one screen at the desk when the card fails. Per-student billing sprawl is how incumbents make a $400/mo family feel like paperwork.

## Go-to-Market Channels

1. **SEO on the owner's actual searches:** "martial arts school software," "belt testing tracker," "BJJ gym management," "kicksite alternative," "zen planner alternative" — the category has high-intent comparison traffic and thin content at the small-school end.
2. **The eligibility calculator lead magnet:** upload your student list, get a "who could grade this quarter" report — the product's core query as a free artifact.
3. **Instructor communities:** BJJ owner groups on Facebook, r/bjj and r/martialarts school-owner threads, dojo-business podcasts (a genuinely underserved, tight-knit channel).
4. **Belt/equipment suppliers and curriculum organizations** whose customer lists are exactly school owners; co-marketing with honest claims only.
5. **Comparison pages:** vs Kicksite, vs Zen Planner, vs Gymdesk, vs "the whiteboard and index cards" — the last one is the honest anchor.

## Competition

| Competitor | Pricing | Weaknesses |
|---|---|---|
| **Kicksite** | [$49-199/mo by student count](https://www.wodify.com/blog/pricing-guide-martial-arts-software) | Long-time martial-arts incumbent; validates the category. Aging UX, belt tracking without deep eligibility rules, retention as reports rather than alarms. |
| **Zen Planner** | [$99-289/mo; full stack commonly $348-525+ with add-ons](https://zenplanner.com/pricing/) | Gym-software DNA; martial-arts features are a skin; add-on pricing (CRM, website) balloons the real cost; heavyweight setup for a solo owner. |
| **Gymdesk** | [$75-200/mo, all features included](https://gymdesk.com/blog/best-martial-arts-management-software) | Closest modern competitor — clean and fairly priced. Progression model is thinner (requirements/eligibility/grading-event flow); retention analytics generic; beatable on curriculum depth and the grading workflow. |
| **Spark Membership / MyStudio** | ~$149+/mo | Marketing-automation heavy, progression light; pitched at franchise-style schools; complexity overwhelms the single-location owner. |
| **Whiteboard + index cards + memory** | Free | The real competitor. Beaten by the self-assembling grading list and the drop-off alarm that catches the quiet quit. |

## Key Risks

1. **Owners are operators, not admins — onboarding is the funnel's cliff.** Mitigation: curriculum templates for the big styles (BJJ adult/kids, karate 10-kyu, TKD), CSV student import with rank columns, and a "first grading event inside the trial" onboarding goal; setup measured in one evening.
2. **Kiosk hardware reality.** Cheap tablets, flaky wifi, sticky fingers. Mitigation: kiosk as an installable web app with offline check-in queueing (sync on reconnect), device-token lock (no staff creds on the mat), 44px+ targets sized for kids.
3. **Billing migration friction.** Moving 150 families' payment methods is the switching cost. Mitigation: Stripe-hosted payment-method collection links parents complete themselves, dual-running period guidance, and dunning states that make the desk conversation easy; never hold attendance/progression hostage to billing setup (adopt ledger first, billing second).
4. **Incumbent response.** Gymdesk especially can deepen progression features. Mitigation: stay the best at the grading workflow and the retention alarm; ship curriculum depth (sign-offs, multi-program ladders) that requires their data-model surgery to copy.
5. **Seasonal churn pressure on schools themselves.** Schools close, downsize, and season. Mitigation: month-to-month honesty, a pause state (summer), and pricing tiers that flex down without cancellation.
6. **Minors' data.** Student rosters are mostly kids. Mitigation: guardian-centric contact model (email/phone live on the family, not the child), no student-facing accounts in v1, photo storage optional and access-controlled, COPPA-conscious design review in Phase 0.

## Landing Page

Message architecture per MARKETING_PLAYBOOK.md (in this folder):

- **Enemy:** the index-card ledger — the stripe that got forgotten, the kid whose grading got missed, the student who quietly quit three weeks before anyone noticed.
- **One sentence:** the whole page proves *"Every stripe earned, on the wall and on record."*
- **The device:** the belt bar. A student's belt rendered as a clean horizontal bar; check-ins tick the class counter, the progress bar fills toward eligibility, and when requirements are met a stripe slides onto the belt and seats with a snap — then the grading-event list adds their name by itself. Hero, pricing, and OG image all reuse the belt bar filling.
- **Proof beats:** a real (design-partner, permissioned) grading event assembling its candidate list with near-misses shown; the retention flag that caught a real drop-off ("flagged day 12, family called, student stayed"); the promotion-history timeline.
- **Objection killer:** "My whiteboard works fine." -> Until the fourth program, the second location, or the quiet quit. Show the drop-off alarm next to the whiteboard's blind spot.
- **One CTA phrase, used verbatim everywhere (hero, post-proof, post-pricing, sticky mobile bar):** **"Start free — 14 days"**. De-risk line: no card required, import your students in an evening.
