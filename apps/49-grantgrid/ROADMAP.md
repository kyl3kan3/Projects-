# GrantGrid Roadmap

## Phase 0 -- Setup (Week 0, ~3-5 days)

Repo, infra, and the data-source spike so Phase 1 is pure product work.

**Acceptance criteria:**

- [ ] Next.js 15 + TypeScript + Tailwind v4 repo scaffolded; CI runs lint + typecheck on every push
- [ ] Neon Postgres provisioned (dev + prod branches); Drizzle configured; `db:generate` / `db:migrate` work against dev
- [ ] Upstash Redis provisioned; BullMQ hello-world job round-trips app -> worker locally
- [ ] Worker boots from the same repo (`npm run worker`) and deploys to Railway/Fly as a separate service
- [ ] 990 ingestion spike: parse one year of 990-PF grant schedules for one state into `funders` + `funder_awards` proposals — proving the data path before building on it
- [ ] Stripe account + test-mode products for the three plans
- [ ] Resend domain verified (SPF/DKIM)
- [ ] `.env.example` complete; secrets in envs, never in repo; Sentry wired into app and worker

## Phase 1 -- MVP (Weeks 1-8)

Goal: a design-partner nonprofit runs its real pipeline in GrantGrid, gets reminded of a real deadline, and assembles one application from the answer library.

- **Weeks 1-2: Tenant spine.** Auth (Auth.js magic-link + Google), org model + roles, org profile (mission, states, causes, budget band, EIN), pipeline CRUD (grants, stages, notes, owners), activity log.
- **Weeks 3-4: Deadlines + reminders.** Deadline model (LOI/application/report/renewal/custom); nightly deadline-scan; T-14/7/1 reminder ladder with exactly-once ledger; award entry auto-creating report schedules; signed ICS feed.
- **Weeks 5-6: Funder database + discovery.** Ingestion pipeline for 2-3 launch states (proposals only); internal curation admin (approve/edit/retire); member discovery feed with filters; fit scoring with visible reasons and profile-thinness guard.
- **Week 7: Answer library + workspace.** Answer blocks with versions + staleness flags; per-grant requirement checklist; link-and-snapshot drafting; freeze-to-history on award/decline.
- **Week 8: Billing + polish.** Stripe Checkout + portal + webhooks + plan gating (tracked-grant caps, discovery on Grow+); weekly digest email; empty/loading/error states to DESIGN.md; mobile pass at 390px.

**Acceptance criteria:**

- [ ] A new org can sign up, complete its profile, add 5 pipeline grants, and see them on the calendar in under 20 minutes, unassisted
- [ ] Reminder ladder proven by test clock: T-14/7/1 emails send exactly once per deadline offset, stop when the deadline is marked done, and escalate report T-1 to all users
- [ ] Entering an award with a report schedule creates report deadlines that appear in the calendar, the ICS feed, and reminders
- [ ] ICS feed subscribed in Google Calendar shows the same deadlines as the app; rotating the token kills the old URL
- [ ] Discovery shows only `approved` funders; every fit score expands to its factor reasons; an org with a thin profile sees no scores (guard proven by test)
- [ ] Fit-score fixture test: a defined org profile + funder record produces the documented factor breakdown and total
- [ ] Linking an answer block snapshots it: editing the library afterward does not change the grant's draft (test)
- [ ] Stale answer blocks (>12 months unreviewed) are flagged in the library and in the weekly digest
- [ ] 990 ingestion re-runs are idempotent (same filings -> no duplicate funders/awards)
- [ ] Stripe: all three plans purchasable in test mode; Seed's 25-grant cap blocks new adds with an upgrade prompt, never data loss
- [ ] 3-5 design-partner orgs live for 2+ weeks; at least one real deadline met via a GrantGrid reminder

## Phase 2 -- Launch (Weeks 9-14)

Goal: public availability, first 30 paying orgs, the curation flywheel running.

- Funder database expanded to 5+ states or 2 national cause areas; freshness dates on every record; member change-report loop live
- Marketing site per MARKETING_PLAYBOOK.md + the free fit-check lead magnet (mission + state -> 5 scored funders by email)
- Free spreadsheet-template lead magnets (grant tracker, grant calendar) targeting the template keywords
- Comparison pages (vs Instrumentl, vs GrantStation, vs the spreadsheet) + 6 SEO articles on practitioner keywords
- State nonprofit association outreach (2-3 partnerships: webinar + member discount)
- Launch: r/nonprofit, grant-writer communities, partner newsletters

**Acceptance criteria:**

- [ ] 30 paying orgs; trial -> paid >= 20%
- [ ] Self-serve funnel proven: 10+ orgs reach an active pipeline with zero human help
- [ ] Fit-check page converting >= 8% of visitors to emails; >= 15% of fit-check emails start a trial
- [ ] Funder database >= 5,000 approved records with median freshness < 12 months
- [ ] Member change reports resolved within 7 days median (the trust loop)
- [ ] 2 state-association partnerships signed with measurable referral codes
- [ ] Support load < 6 tickets/week per 30 orgs; help-center deflection measured
- [ ] Reminder deliverability: bounce < 2%, complaint < 0.1%

## Phase 3 -- Growth (Months 4-12)

Goal: $15k+ MRR, retention through grant cycles, and the Field tier earning its price.

- Multi-org support for consultants (Field tier): org switcher, shared answer libraries, cross-org deadline digest
- Board-report export (pipeline summary PDF/CSV) — the quarterly artifact EDs need anyway
- Outcome memory: renewal prompts from history ("Kresge funded you in 2026 — their LOI window opens next month")
- AI-assisted draft assembly from the answer library (assist, never autowrite; clearly labeled) — evaluate carefully against trust risk
- Funder database national coverage for top cause areas; curation team playbook + quality SLAs
- Referral program for grant writers (20% recurring); association program scaled to 10 states
- Annual-plan push timed to nonprofit budget season

**Acceptance criteria:**

- [ ] $15k MRR; logo churn < 3%/month trailing 3 months, including one full summer (the seasonal test)
- [ ] >= 25% of revenue on annual plans
- [ ] >= 15 consultants on Field managing 3+ orgs each
- [ ] Board-report export used by >= 30% of active orgs in a quarter
- [ ] Renewal prompts generate >= 50 documented pipeline adds
- [ ] Funder database >= 25,000 approved records; freshness SLA (90% < 12 months) held for two consecutive quarters
- [ ] A published case study: a real org's grants won with GrantGrid in the pipeline (with permission), even if modest
