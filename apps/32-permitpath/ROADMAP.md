# PermitPath Roadmap

## Phase 0 -- Setup (Week 0, ~3-5 days)

Repo, infra, accounts, and the one decision that shapes everything: seeding strategy.

**Acceptance criteria:**

- [ ] Next.js 15 + TypeScript + Tailwind v4 repo scaffolded; CI runs lint + typecheck on every push
- [ ] Neon Postgres provisioned (dev + prod branches); Drizzle configured; `db:generate` / `db:migrate` scripts work against dev
- [ ] Upstash Redis provisioned; BullMQ hello-world job round-trips from app to worker locally
- [ ] Worker process boots from the same repo (`npm run worker`) and deploys to Railway/Fly as a separate service
- [ ] Stripe account created; three plans + annual prices configured in test mode; webhook endpoint receiving test events via Stripe CLI
- [ ] Resend account + sending domain verified (SPF/DKIM)
- [ ] **Seeding strategy decided and written down: first 50 jurisdictions are hand-curated, one metro covered completely** (target metro chosen by where design partners work); job-type taxonomy v1 frozen (10-15 types across HVAC/electrical/plumbing/roofing/solar)
- [ ] Crawler etiquette settled: identified `CRAWLER_USER_AGENT` with a contact URL, default 72h frequency, per-host concurrency 1, robots.txt respected
- [ ] `.env.example` complete; secrets in Vercel/Railway envs, never in repo
- [ ] Sentry wired into app and worker

## Phase 1 -- MVP (Weeks 1-8)

Goal: a design partner can look up requirements, run a job checklist, and get a rule-change and expiry alert -- all against real curated data.

- **Weeks 1-2: Data spine.** Jurisdiction + source + versioned requirement-record schema; job-type taxonomy; auth (Auth.js) + org model; seed pipeline for the first 10 hand-curated jurisdictions to prove the shape.
- **Week 3: Curation admin.** Record editor with version chaining, source manager, verified-at/verified-by stamping; audit log on every publish. Curate to 25 jurisdictions using the console itself (dogfood the tooling).
- **Week 4: Checklist generation.** Job creation (site, jurisdiction, job type); checklist generated and pinned to record version; item verification with the stamp; "not covered yet" state that files a coverage request.
- **Week 5: Jobs + application tracking.** Permit application status timeline (not submitted -> in review -> issued -> expired); inspection scheduling notes; "requirements changed since generation" banner on stale checklists.
- **Week 6: Change detection + expiry alerts.** Crawl -> diff -> review queue -> versioned update -> alert fan-out; daily expiry scan with T-60/T-30/T-7/T-1 escalation for licenses and permits; license vault.
- **Week 7: Billing + contributions.** Stripe Billing for the three plans, plan gating on users/jobs/jurisdictions watched; suggest-an-edit flow with moderation queue and credit awards.
- **Week 8: Hardening + curation sprint.** Webhook replay tolerance, dead-letter review, broken-source detection; finish curating to 50 jurisdictions with everything verified fresh.

**Acceptance criteria:**

- [ ] 50 jurisdictions live with >=90% of requirement records verified within the last 90 days, every record carrying source link + verified-at + version history
- [ ] A new org can sign up, watch a jurisdiction, create a job, and see a generated checklist with correct fees and timelines in under 10 minutes, unassisted
- [ ] An edit to a monitored source page produces a pending diff in the review queue within 96 hours; approving it creates a new record version and emails every watching org (proven end to end against a controlled test page)
- [ ] No requirement change is ever published without human review (enforced in code, not convention; write path requires a reviewer id)
- [ ] Checklists pinned to a superseded record version show the change banner with a working diff view
- [ ] A license with `expires_at` 61 days out receives exactly the T-60/T-30/T-7/T-1 sequence; renewal cancels the remainder (proven by test with clock control)
- [ ] Duplicate Stripe/Resend webhook delivery causes no duplicate processing (replay the same event 5x in test)
- [ ] A contribution can be submitted, moderated, accepted into a new record version, and credited to the contributor's balance -- visible on their next invoice in test mode
- [ ] 3-5 design partner orgs (real contractors in the covered metro) active for 2+ weeks, with at least one real rule change caught and alerted before any partner heard it elsewhere
- [ ] Every publish, moderation decision, and billing change appears in the audit log

## Phase 2 -- Launch (Weeks 9-14)

Goal: public availability, the SEO surface live, the crowdsourcing loop open, first 20 paying customers.

- Programmatic SEO pages per jurisdiction x job type (ISR): top-level answer + fee public; checklist detail, quirks, and change history gated
- Marketing site to MARKETING_PLAYBOOK.md: the enemy (the buried rule change), the device (the stamp, not the stop-work order), honest coverage map
- Crowdsourcing launch: contribution flow opened to all customers, contributor reputation live, first credits paid
- Comparison pages (PermitFlow alternative, vs calling the building department) + 5 deep articles on the covered metro's permitting
- Onboarding polish: empty states with real corpus data, trial scoped to the buyer's jurisdictions, go-live checklist
- Expand curation to 100 jurisdictions (second metro chosen by waitlist votes)

**Acceptance criteria:**

- [ ] 100 jurisdictions live at the >=90%-verified-in-90-days bar
- [ ] SEO pages indexed for every covered jurisdiction x job type; first organic signups attributed (analytics + "how did you hear" survey)
- [ ] 20 paying customers; at least 12 in the launch metro (depth-first proof)
- [ ] Self-serve funnel proven: at least 10 orgs signed up, watched jurisdictions, and generated checklists with zero human help
- [ ] >=15 accepted contributions from >=5 distinct customer orgs; zero accepted-then-reverted incidents
- [ ] At least 3 real rule changes detected, reviewed, and alerted within 5 days of the source changing
- [ ] Support load sustainable: < 5 tickets/week per 20 customers; runbook exists for the top 5 issues
- [ ] Zero data-accuracy complaints escalating to a claimed fine (and a written incident process in case one ever does)

## Phase 3 -- Growth (Months 4-12)

Goal: $25k+ MRR, change detection running at scale, the expediter network compounding coverage.

- Change-detection automation at scale: per-source selectors tuned, broken-source auto-triage, diff noise classifier (rule-based first; assist the curator, never replace review)
- Expediter partner program: white-glove data access + referral cut in exchange for high-volume verified contributions
- Coverage expansion to 300+ jurisdictions across 4-6 metros, sequenced by waitlist votes and customer demand
- Weekly digest ("2 rule changes in your jurisdictions, 1 license renewal due") -- the retention feature
- Regional-tier features earning $249: multi-license entities, priority re-verification SLA, CSV export
- Content flywheel: quarterly "State of Permitting" report from anonymized corpus data (change frequency by jurisdiction -- nobody else has this number)
- Evaluate (do not commit to): ServiceTitan/Jobber integrations and a public API, based on inbound demand only

**Acceptance criteria:**

- [ ] $25k MRR; logo churn < 2.5%/month over a trailing 3-month window
- [ ] 300 jurisdictions live, still at the >=90%-verified-in-90-days bar (coverage never outruns freshness)
- [ ] Median time from source-page change to customer alert < 5 days across all monitored sources
- [ ] >=30% of requirement re-verifications originate from contributions or expediter partners (the flywheel is real, measured)
- [ ] At least 3 active expediter partners who have each sent >= 2 paying customers
- [ ] Organic search delivers >= 40% of new trials (measured via attribution survey + analytics)
- [ ] Weekly digest enabled for > 80% of active customers; digest-open cohort shows measurably lower churn
- [ ] Net revenue retention >= 100% (tier upgrades on users/jurisdictions offsetting churn)
