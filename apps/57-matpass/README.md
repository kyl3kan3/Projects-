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

All of it is built. What each item means in the shipped app, and where it lives:

- [x] **Auth + school setup; roles (owner, instructor, front desk).** Email + password
  (scrypt) with a signed JWT session cookie — the portfolio's convention rather than
  ARCHITECTURE.md's Auth.js, with the same school-scoped session shape. Role gates in
  `src/lib/auth.ts`: the desk checks students in and works flags but cannot record a
  promotion or touch billing.
- [x] **Programs + curricula.** Rank ladders with belt colour, stripe steps, display
  order, minimum classes, minimum days in rank and an instructor sign-off flag.
  Templates preloaded for BJJ adult and kids, karate (10-kyu), taekwondo and judo.
  `src/lib/curricula.ts`, `/curriculum`.
- [x] **Students.** Profile, per-program enrollments with current rank and promotion
  history, family grouping, notes, kiosk PIN. CSV import that honours rank and
  last-promoted columns and reports every row it could not read. `src/lib/roster.ts`,
  `src/lib/csv.ts`, `/setup`, `/roster`.
- [x] **Kiosk check-in.** `/kiosk/[deviceToken]` — device-token locked, no staff login
  reachable, name search from three letters or a PIN, today's class pre-selected,
  offline queue that syncs exactly once. Desk fallback at `/roster/checkin`.
- [x] **Class schedule.** Weekly recurring classes per program with day, time,
  duration and instructor; check-ins attach to the class that was actually running.
  `src/lib/schedule.ts`, `/schedule`.
- [x] **Progression engine.** Classes-since-promotion and days-in-rank computed from
  the check-in ledger and promotion history — never from a stored status column — plus
  the per-student belt bar and progress hairline. `src/lib/progression.ts`.
- [x] **Grading events.** Date + programs in, a candidate list out: eligible, and
  near-miss with the exact deltas. Invite by household email, confirm at the desk,
  event-day promote / hold back / no-show, batch promotion behind a review sheet, every
  promotion stamped with its date, event and grader. `src/lib/gradings.ts`, `/gradings`.
- [x] **Promotion history.** The student's rank timeline, and certificate data as CSV
  or a printable PDF. `/roster/[studentId]`, `/gradings/[id]/certificates`.
- [x] **Family memberships + billing.** Households with several students, per-student
  and family-flat plans, Stripe subscriptions on the school's own connected account,
  and past-due state visible at the desk with a dunning ladder that stops.
  `src/lib/billing.ts`, `/billing`.
- [x] **Retention flags.** Drop-off measured against each student's own cadence, a call
  sheet sorted worst-first, one-tap outcomes with a note, and flags that close
  themselves when the student comes back. `src/lib/retention.ts`, `/retention`.
- [x] **Email announcements** school-wide or per program, with a per-household delivery
  outcome and a retry for the ones that failed. `src/lib/announcements.ts`, `/announce`.
- [x] **Billing for MatPass itself** — three tiers, a 14-day trial, and student limits
  that nudge rather than block. `/settings/plan`.

Post-MVP (explicitly cut from v1): tournament/event ticketing, curriculum video content, belt-testing fee collection per event, SMS, native mobile apps (the kiosk is a web app on a tablet), point-of-sale/pro-shop, multi-brand franchise reporting.

## Running it

Postgres 14+, Redis (optional), Node 20+.

```bash
npm install
cp .env.example .env            # then fill in the values it describes
npm run db:generate             # only after changing src/db/schema.ts
npm run db:migrate              # applies drizzle/*.sql
npm run dev                     # http://localhost:3057
```

Only three variables are needed to boot: `DATABASE_URL`, `AUTH_SECRET` and
`KIOSK_TOKEN_SECRET`. Everything else degrades honestly and says so on screen:

| Missing | What happens |
|---|---|
| `RESEND_API_KEY` (or `DRY_RUN=1`) | Announcements, grading invitations and dunning notices are recorded and logged instead of sent. Delivery rows, bounce handling and retries are real. |
| `STRIPE_SECRET_KEY` | Membership plans, subscriptions, past-due state and the dunning ladder all work; the Stripe-hosted pages are replaced by an in-app page that says in plain words that it is a development simulation, and it never asks for a card number. |
| `REDIS_URL` | The nightly sweep runs unlocked, which is correct for a single process. |
| `CRON_SECRET` | `/api/cron/tick` refuses to run at all. |

Then:

```bash
npm run typecheck   # tsc --noEmit
npm run craft       # the design and invariant rules a type-checker cannot see
npm test            # domain logic; the database-backed suite skips without DATABASE_URL
npm run build
```

To run the database-backed invariant tests (append-only promotions, kiosk sync
idempotency, attendance-never-blocked-by-billing, the retention scan):

```bash
node --env-file=.env node_modules/.bin/tsx --test src/lib/db.test.ts
```

### The scheduled work

Eligibility refresh, the retention scan, dunning notices and resuming a stalled
announcement fan-out all live in `src/lib/sweeps.ts`, with two triggers and one
implementation:

- **Production:** `GET /api/cron/tick`, protected by `CRON_SECRET`, with a bounded
  time budget. On Vercel add to `vercel.json`:
  `{ "crons": [{ "path": "/api/cron/tick", "schedule": "0 8 * * *" }] }`.
- **Development:** `npm run worker` runs the same functions in a loop, so a nightly
  behaviour can be watched in a minute instead of at 3am. It takes a Redis lock so a
  developer's worker and a cron invocation cannot both email the same parent.

ARCHITECTURE.md specified long-lived BullMQ workers; the deployment target has no
always-on process, so the queue became a cron-triggered route. Redis is still real and
still load-bearing — it is what makes the lock possible.

### Setting up the door tablet

Settings → Kiosk devices → mint a link. Open it once on the tablet and add it to the
home screen. The link is shown only at the moment it is created; if a tablet goes
missing, revoke it — the next request from it fails even though its signature is still
valid.

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
