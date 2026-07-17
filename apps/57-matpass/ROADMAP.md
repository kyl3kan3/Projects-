# MatPass Roadmap

## Phase 0 — Setup (Week 0, ~3-5 days)

Repo, infra, and accounts so Phase 1 is pure product work.

**Acceptance criteria:**

- [ ] Next.js 15 + TypeScript + Tailwind v4 repo scaffolded; CI runs lint + typecheck on every push
- [ ] Neon Postgres provisioned (dev + prod branches); Drizzle configured; `db:generate` / `db:migrate` work against dev
- [ ] Upstash Redis + BullMQ proven: enqueue from the app, process in a local `tsx` worker, retries + dead-letter verified
- [ ] Stripe platform account with Connect enabled (test mode); a test Standard account onboards and a test tuition subscription bills end to end on the connected account
- [ ] Stripe Billing products/prices for MatPass's three tiers; webhook endpoint receiving platform + connected-account test events via Stripe CLI
- [ ] R2 bucket; signed PUT/GET round-trip proven (student photo)
- [ ] Resend domain verified (SPF/DKIM); magic-link auth working
- [ ] Kiosk device-token scheme (jose) proven: mint, verify, revoke — a revoked token bricks the kiosk route
- [ ] Offline check-in queue spiked: client-generated idempotency keys survive replay (double-sync inserts once)
- [ ] Curriculum templates drafted for BJJ (adult/kids), karate (10-kyu), TKD — reviewed by one real instructor each
- [ ] `.env.example` complete; secrets in host envs; Sentry wired; COPPA-conscious data review done (guardian-centric contacts, optional photos)

## Phase 1 — MVP (Weeks 1-4)

Goal: a design-partner school runs its floor on MatPass — kiosk at the door, a real grading event assembled and recorded, families billed on the school's own Stripe, and the first retention flags worked.

- **Week 1 — Spine + curriculum + roster.** Auth + school/roles; design tokens + global CSS from DESIGN.md before any screen; programs, ranks with requirements (templates preloaded), families + students with CSV import (rank columns honored); the belt-bar component rendered from curriculum data.
- **Week 2 — Kiosk + attendance.** Class schedule; kiosk route with device tokens, search/PIN, class pre-select, the check-in beats; offline queue with idempotent sync; desk check-in fallback; check-ins feeding the progression inputs live.
- **Week 3 — Progression + gradings.** The progression engine (classes since promotion, days in rank, sign-offs); per-student progress bars; grading events with the self-assembling eligibility list + near-miss deltas; invite/confirm; event-day flow; batch promotion behind the review sheet; append-only promotions with the stripe-seat animation per DESIGN.md; mat promotions.
- **Week 4 — Money + retention + hardening.** Stripe Connect onboarding; membership plans + family subscriptions via hosted payment-method links; past-due states at the desk + dunning notices (attendance never blocked); nightly retention scan with personal baselines + the flag workflow; announcements with delivery status; MatPass's own billing (trial, tiers, soft student limits); empty/error states; reduced-motion pass.

**Acceptance criteria:**

- [ ] A new school can pick a curriculum template, import 150 students with ranks, and check in its first class within one evening, unassisted
- [ ] Kiosk check-in completes in <=5 seconds from search to confirmation; offline check-ins queue and sync exactly once (replay test proves the idempotency key)
- [ ] A revoked kiosk token stops the device immediately (test proves it); no staff credentials are reachable from the kiosk route
- [ ] The progression engine matches hand-computed eligibility for edge cases: promotion mid-week, paused enrollments, transfers with imported history, stripes within a rank
- [ ] A grading event assembles eligible + near-miss lists that match manual counts; batch promotion writes append-only records with grader attribution; a correction appends, never edits (test proves immutability)
- [ ] Tuition flows land only in the school's connected Stripe account — no flow touches a platform balance (verified against Stripe test data)
- [ ] A failed family payment shows at the desk with a working hosted update link; the student can still check in (test proves attendance is never blocked by billing)
- [ ] The retention scan flags a seeded drop-off case (3x/week student gone 2 weeks) and does NOT flag a paused student or a stable 1x/week adult (both proven by tests)
- [ ] `npm install && npm run typecheck && npm run build` green; every screen matches DESIGN.md at 390px (kiosk verified on an actual cheap tablet) including empty/loading/error states
- [ ] 2-3 design-partner schools run a real grading event and one full billing cycle; zero misapplied promotions or payments (any occurrence is a stop-ship postmortem)

## Phase 2 — v1 Launch (Weeks 5-10)

Goal: public availability, first 60 paying schools, the grading-event demo proven as the closer.

- Onboarding to the "first grading inside the trial" goal: template refinements per style, import wizard hardening against incumbent exports (Kicksite/Zen Planner CSVs)
- Attendance analytics (Academy tier): per-class heat, program trends, the retention tally ("7 flags, 4 recovered")
- Waiver/document uploads; certificate-data export (PDF/CSV)
- Instructor accounts with sign-off workflow on ranks that require it
- Marketing site per MARKETING_PLAYBOOK.md — enemy: the index-card ledger; device: the belt bar filling + stripe seating; CTA **"Start free — 14 days"** verbatim everywhere
- Comparison pages: vs Kicksite, vs Zen Planner, vs Gymdesk, vs the whiteboard; the eligibility-calculator lead magnet
- Launch in owner communities (BJJ owner groups, dojo-business podcasts) with a permissioned design-partner grading story

**Acceptance criteria:**

- [ ] 60 paying schools; trial -> paid >= 30% for trials that ran a grading event or 2+ weeks of kiosk check-ins
- [ ] Median setup-to-first-check-in < 2 days; >= 70% of trials import students
- [ ] >= 50% of active schools run a grading event in their first 60 days (the wedge metric)
- [ ] Retention flags: >= 30% of flags worked to an outcome; recovered rate reported per school
- [ ] Two comparison pages ranking on their target queries; >= 25% of signups name an incumbent or "spreadsheet/whiteboard" as what they're replacing
- [ ] Support < 6 tickets/week per 60 schools; kiosk issues trending to zero after the tablet setup guide ships

## Phase 3 — Growth (Months 4-12)

Goal: $35k+ MRR, Federation tier landing multi-location schools, and the progression ledger as the moat.

- Multi-location (Federation): per-location kiosks/schedules, cross-location student transfers with history intact, roll-up reporting
- Parent view (read-only, guardian-authenticated link): their kids' belt bars, progress, and grading invitations — the fridge-door artifact, demand-gated
- Testing-fee collection per grading event (paid through the school's Connect account)
- Curriculum marketplace v0: shareable rank-ladder templates from real schools/organizations
- SMS announcements + reminders (10DLC) — demand-gated against email's performance
- Incumbent migration kits (Kicksite/Zen Planner full-history importers, promotion history included)

**Acceptance criteria:**

- [ ] $35k MRR; logo churn < 2.5%/month trailing 3 months (the ledger retains)
- [ ] >= 15 Federation-tier schools; multi-location transfers work with zero history loss (tracked explicitly)
- [ ] Parent view shipped or explicitly killed with documented evidence — no zombie features
- [ ] Organic (comparison pages + calculator) delivers >= 35% of new trials
- [ ] Migration kits move >= 20 schools off incumbents with promotion history intact
- [ ] Median school's grading events per year >= 3 (the product is the school's operating rhythm, not a database)
