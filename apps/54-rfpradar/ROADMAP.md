# RFPRadar Roadmap

## Phase 0 -- Setup (Week 0, ~4-5 days)

Repo, infra, and the ingestion spike so Phase 1 is pure product work.

**Acceptance criteria:**

- [ ] Next.js 15 + TypeScript + Tailwind v4 repo scaffolded; CI runs lint + typecheck on every push
- [ ] Neon Postgres provisioned (dev + prod branches); Drizzle configured; `db:generate` / `db:migrate` work against dev
- [ ] Upstash Redis provisioned; BullMQ hello-world job round-trips app -> worker locally
- [ ] Worker boots from the same repo (`npm run worker`) and deploys to Railway/Fly as a separate service
- [ ] SAM.gov spike: API key obtained; one week of real opportunities pulled, normalized, and upserted idempotently -- proving the federal path before building on it
- [ ] State connector spike: the 5 launch states chosen by feed quality; one state's feed parsed end to end into the same normalized shape
- [ ] Postgres full-text search proven on the normalized descriptions (keyword + negative-keyword queries)
- [ ] Stripe account + test-mode products for the three plans; webhook endpoint receiving test events via Stripe CLI
- [ ] Resend domain verified (SPF/DKIM); a Slack incoming-webhook post proven
- [ ] ICS-feed token scheme (jose) proven: mint, verify, rotate
- [ ] `.env.example` complete; secrets in envs, never in repo; Sentry wired into app and worker

## Phase 1 -- MVP (Weeks 1-4)

Goal: a design-partner firm gets a real 6am scan, pursues a real tender through a scorecard, and assembles one response from its library.

- **Week 1: Tenant spine + ingestion.** Auth (Auth.js) + firm workspace with seat roles; keyword profiles CRUD; the sources registry with SAM.gov + 2 state connectors polling on schedule (hash short-circuit, amendment events, per-source health surfaced honestly); the shared opportunities store.
- **Week 2: Scoring + the radar.** `score-matches` with verbatim factor reasons and threshold suppression; the radar screen with match cards, the notice reader, pursue/watch/dismiss-with-reason; the 6am `morning-scan` (email + Slack, including the quiet no-matches line); the 6am-find signature.
- **Week 3: Pursuits, scorecards, deadlines.** Pursuit stages with owners; the go/no-go scorecard (criteria, live weighted verdict, recorded decision, no-bid as first-class); requirement checklists; the deadline calendar + signed ICS feed; T-7/3/1 reminders with the exactly-once ledger.
- **Week 4: Library + billing + polish.** Answer blocks (kinds, tags, versions, staleness flags); link-and-snapshot into requirements; win/loss close with `won_with` flagging; the remaining 3 state connectors; Stripe Billing (three seat tiers, trial, seat prompts); webhook pipeline verify -> persist -> enqueue -> ack; empty/loading/error states to DESIGN.md at 390px.

**Acceptance criteria:**

- [ ] A new firm can build a profile (NAICS + keywords) and see real scored matches from live federal data within 20 minutes, unassisted
- [ ] Ingestion idempotency proven: re-running a poll over the same source window creates zero duplicate opportunities; an amendment updates in place and appends exactly one event
- [ ] Every visible score expands to its factor reasons; a match below threshold is suppressed but queryable (audit test); no score renders without factors (test proves the invariant)
- [ ] The 6am scan sends at the firm's local hour with new matches sorted by score, and sends the quiet line when nothing matched (silence distinguishable from breakage); a dead source appears in the scan's health section
- [ ] Fit-score fixture test: a defined profile + notice produces the documented factor breakdown and total
- [ ] Reminder ladder proven by test clock: T-7/3/1 emails send exactly once per deadline offset and stop when the deadline completes or the pursuit closes
- [ ] The ICS feed subscribed in Google Calendar shows the same deadlines as the app; rotating the token kills the old URL
- [ ] A scorecard verdict is recorded with who/when; a no-bid closes the pursuit with its reason preserved and counts in the denominator report
- [ ] Linking a library block snapshots it: editing the library afterward does not change the pursuit's content (test); a stale block warns at link time
- [ ] Stripe: all three plans purchasable in test mode; inviting seat 3 on Scout prompts an upgrade, never blocks silently; a replayed webhook event is a no-op (idempotency ledger test)
- [ ] 3-5 design-partner firms live for 2+ weeks; at least one real tender pursued from a scan the firm confirms it would have missed

## Phase 2 -- v1 Launch (Weeks 5-10)

Goal: public availability, first 60 paying firms, the 6am habit proven.

- Marketing site per MARKETING_PLAYBOOK.md (enemy: the tender that got away; device: the tender you'd have missed, found at 6am; CTA verbatim: "Start free — 14 days")
- The free lead magnet: NAICS + keywords -> five scored live tenders by email, no account
- Comparison pages (vs GovWin IQ, vs GovTribe/HigherGov, vs SAM.gov alone) + 8 SEO articles on discovery and go/no-go keywords ("GovWin IQ pricing" is the front-door query)
- State coverage expanded to 10-12 states, prioritized by customer demand; connector health dashboard public on the status page
- Profile-tuning suggestions from dismiss reasons (the precision loop) + measured match precision >= 70% on active firms
- Scorecard PDF export (the shareable go/no-go -- the referral artifact)
- Launch: APEX Accelerator advisor outreach, r/GovernmentContracting, govcon LinkedIn, agency-owner communities

**Acceptance criteria:**

- [ ] 60 paying firms; trial -> paid >= 25% for firms whose trial included a pursued match (the wedge metric -- measured per cohort)
- [ ] Self-serve funnel proven: 20+ firms reach an active profile + delivered scan with zero human help
- [ ] The lead magnet converts >= 8% of visitors to emails; >= 15% of those start a trial
- [ ] Scan engagement: >= 50% of active firms open or act on the scan weekly (the habit metric)
- [ ] Match precision >= 70% (pursued+watched / surfaced, per cohort) and rising after profile tuning
- [ ] 10+ state connectors live with >= 99% weekly uptime each; connector breakage median time-to-fix < 3 days
- [ ] Support load < 8 tickets/week per 60 customers; runbook for profile tuning, connector status, ICS setup

## Phase 3 -- Growth (Months 4-12)

Goal: $25k+ MRR and the library moat compounding.

- Multi-profile portfolios + win/loss reporting + API/CSV export (Capture tier earners)
- State coverage to 25+ states; local/municipal pilot sources (school districts, transit authorities) by demand
- Requirement extraction assist: parse the RFP's submission requirements into the checklist (assist, never autowrite; clearly labeled)
- Library intelligence: "answers that win" surfacing from `won_with` data; team-wide reuse analytics
- Teaming signals: matched opportunities flagged "likely needs a partner" from size/scope heuristics -- evaluated against demand
- SOC2 Type I (the enterprise-services firms ask); annual-plan push aligned to BD budget season
- Win-rate benchmarking report (anonymized, opt-in) -- the segment's first honest denominator data

**Acceptance criteria:**

- [ ] $25k MRR; logo churn < 3%/month trailing 3 months, including one government fiscal-year trough (the seasonality test)
- [ ] >= 25% of revenue on annual plans; >= 15% of accounts on Capture
- [ ] Library depth: median active firm has >= 25 blocks with >= 60% reviewed in the last 12 months (the moat metric)
- [ ] Requirement extraction used on >= 40% of new pursuits where enabled, with correction rate measured and falling
- [ ] Win/loss recorded on >= 70% of closed pursuits (the denominator holds)
- [ ] A published case study: a real firm's win on a tender RFPRadar surfaced (with permission), even if modest
- [ ] Teaming signals shipped or explicitly killed with documented evidence -- no zombie features
