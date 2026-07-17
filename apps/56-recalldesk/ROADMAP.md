# RecallDesk Roadmap

## Phase 0 — Setup (Week 0, ~4-5 days)

Repo, infra, compliance groundwork, and the PMS export fixtures Phase 1 will be built against.

**Acceptance criteria:**

- [ ] Next.js 15 + TypeScript + Tailwind v4 repo scaffolded; CI runs lint + typecheck on every push
- [ ] BAAs executed (or scheduled with signed intent) with Neon, Upstash, Cloudflare, Resend, Twilio, and hosting — no real patient data before this list is done; customer-facing BAA template drafted
- [ ] Neon Postgres (Business) provisioned; Drizzle configured; `db:generate` / `db:migrate` work against dev
- [ ] Upstash Redis + BullMQ proven: enqueue from the app, process in a local `tsx` worker, retries + dead-letter verified; payloads are IDs only (reviewed as a rule)
- [ ] R2 bucket; signed PUT/GET round-trip proven with a CSV
- [ ] Real export fixtures acquired for Dentrix, Eaglesoft, and Open Dental (design-partner or sanitized samples) — the recipes are built against real files, not documentation
- [ ] Twilio account + number; **10DLC registration started** (weeks of lead time); STOP webhook receiving in dev
- [ ] Resend domain verified (SPF/DKIM); per-practice sending-domain plan written
- [ ] Stripe products/prices for the three tiers with per-location quantities; webhook endpoint receiving test events via Stripe CLI
- [ ] `.env.example` complete; secrets in host envs; Sentry wired with PII scrubbing on

## Phase 1 — MVP (Weeks 1-4)

Goal: a design-partner practice imports its real roster, sees its overdue list with a dollar total, runs one real campaign, works the call queue, and reads a conservative attribution number it believes.

- **Week 1 — Spine + import.** Auth + practice/location/roles; design tokens + global CSS from DESIGN.md before any screen; CSV upload -> mapping (per-PMS recipes for the big three) -> worker parse -> dry-run preview -> commit/rollback with provenance; anomaly flags.
- **Week 2 — The overdue engine + list.** Recall intervals (default + per-patient), `next_due_on` computation, nightly recompute, buckets; the overdue list screen with dollar-weighted total, bucket chips, filters, CSV export; suppression flags on the patient record.
- **Week 3 — Campaigns + booking links.** Templates with merge fields; segment builder from list filters; sequences with offsets, quiet hours, pacing, max-touch caps; the single consent chokepoint in `send-touch`; tokenized booking pages writing booking requests; provider webhooks (delivery, bounce, STOP) updating state; DRY_RUN discipline against real rosters.
- **Week 4 — Queue + ledger + money.** Daily call-queue build with ranking and two-tap dispositions; bookings + nightly attribution run (30-day window, unique per booking); dashboard with recovered counter + week-strip + the chair-fill signature per DESIGN.md; owner-report PDF v1; Stripe Billing (trial, tiers, location quantities); empty/error states; reduced-motion pass.

**Acceptance criteria:**

- [ ] Each of the three PMS fixtures imports through its recipe to a correct roster (spot-checked against source) in under 15 minutes of operator time, including mapping
- [ ] A committed import can be rolled back in one action and leaves no orphaned visits (test proves it)
- [ ] The overdue engine matches hand-computed `next_due_on` for edge cases: no hygiene history, multiple visits same day, future appointments in the export
- [ ] No touch is ever sent without passing the consent chokepoint — opt-out, bounce flags, do-not-contact, quiet hours, and touch caps each have a test that proves the block
- [ ] STOP opts out permanently, stops active enrollments, and is reflected in the UI within one minute
- [ ] A booking with no qualifying touch in 30 days creates NO attribution row (test proves the conservatism); an attributed booking's receipt trail renders end to end
- [ ] A booked patient's active enrollments stop before the next step sends (test proves it)
- [ ] The front desk can work a 20-patient queue with two taps per disposition; dispositions appear as touches in the ledger
- [ ] `npm install && npm run typecheck && npm run build` green; every screen matches DESIGN.md at 390px including empty/loading/error states
- [ ] 2-3 design-partner locations run a real campaign; zero consent incidents (any occurrence is a stop-ship postmortem)

## Phase 2 — v1 Launch (Weeks 5-10)

Goal: public availability, first 40 paying locations, the attribution ledger proven as the renewal engine.

- Recall Engine tier complete: SMS steps live behind 10DLC approval, A/B on send copy, monthly owner report with holdout comparison
- Import hardening: more PMS recipes (Curve, Denticon exports), saved mapping presets per location, scheduled re-import reminders ("your roster is 45 days stale")
- The overdue-list calculator as the lead magnet; per-PMS export-recipe articles (SEO + onboarding docs in one)
- Marketing site per MARKETING_PLAYBOOK.md — enemy: the empty hygiene chair at 10am; device: the chair that fills; CTA **"See your overdue list"** verbatim everywhere
- Comparison pages: vs Solutionreach, vs Weave, vs RevenueWell, vs "the front desk calls when it's slow"
- AADOM/office-manager community launch with a permissioned design-partner ledger as the receipt

**Acceptance criteria:**

- [ ] 40 paying locations; trial -> paid >= 30% for trials that reached the overdue-list screen with a committed import
- [ ] Activation proven: median time from signup to committed import < 2 days; >= 70% of trials reach the overdue list
- [ ] Attributed recovered production >= 8x subscription price at the median location (tracked per location; this is THE metric)
- [ ] Deliverability: campaign email bounce < 5%, spam complaints < 0.1%; SMS opt-out < 2% per campaign
- [ ] Owner report generated for every active location monthly; >= 3 owners quote their own number back in testimonials (with consent)
- [ ] Zero consent incidents and zero PHI incidents; support < 5 tickets/week per 40 locations with import questions trending down

## Phase 3 — Growth (Months 4-12)

Goal: $60k+ MRR, the Group tier landing multi-location dentistry, attribution defensibility deepened.

- Group tier: cross-location dashboard, per-location benchmarks ("Maple St recovers 2.1x what Oak Ave does"), roll-up owner reports
- Direct PMS bridges (Sikka or per-PMS APIs) as a paid add-on where demand proves out — CSV stays the default and the fallback
- Kept-visit verification loop: imports backfill `kept`, ledger shows kept vs no-show honestly; no-show follow-up sequence
- Holdout methodology v2: automatic matched-cohort comparison in every owner report
- Two-way reply handling (patient texts back a question -> front-desk inbox item) — scoped tightly to campaign replies
- Annual compliance review cadence (TCPA copy, consent imports, 10DLC renewals) as a recurring operating task

**Acceptance criteria:**

- [ ] $60k MRR; logo churn < 2%/month trailing 3 months (the ledger retains)
- [ ] >= 10 Group-tier practices (3+ locations each); Group >= 25% of new revenue
- [ ] Median location's attributed recovered production >= 10x subscription price
- [ ] Organic (calculator + recipes + comparison pages) delivers >= 40% of new trials
- [ ] PMS bridge add-on shipped or explicitly killed with documented evidence — no zombie integrations
- [ ] Still zero consent/PHI incidents — the streak is the brand
