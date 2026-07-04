# DuesDesk Roadmap

## Phase 0 -- Setup (Week 0, ~3-5 days)

Repo, infra, and accounts so Phase 1 is pure product work.

**Acceptance criteria:**

- [ ] Next.js 15 + TypeScript + Tailwind v4 repo scaffolded; CI runs lint + typecheck on every push
- [ ] Neon Postgres provisioned (dev + prod branches); Drizzle configured; `db:generate` / `db:migrate` scripts work against dev
- [ ] Stripe platform account with Connect enabled (test mode); a test Standard account onboards and receives a destination charge end to end
- [ ] Stripe Billing products/prices for the three DuesDesk tiers; webhook endpoint receiving both platform and connected-account test events via Stripe CLI
- [ ] Cloudflare R2 bucket created; signed PUT/GET round-trip proven (photo upload)
- [ ] Resend domain verified (SPF/DKIM); Twilio account + number acquired; 10DLC registration *started* (weeks of lead time)
- [ ] Vercel Cron against a stub job route with double-fire idempotency proven
- [ ] Portal-token scheme (jose) + magic-link step-up proven: mint, verify, expire, revoke, step-up
- [ ] `.env.example` complete; secrets in Vercel envs, never in repo; Sentry wired in

## Phase 1 -- MVP (Weeks 1-8)

Goal: a design-partner association runs a real dues cycle -- invoices out, autopay charging, checks recorded, delinquency visible -- plus real issues and announcements.

- **Weeks 1-2: Roster + association spine.** Auth (Auth.js) + association/board roles; household/member model with CSV import and join/leave history; Stripe Connect onboarding flow (their account, our platform); portal tokens with magic-link step-up.
- **Weeks 3-4: Dues engine.** Assessment schedules; invoice generation cron (idempotent per household+period) with the "63 invoices will be created" preview; invoice emails with portal links; hosted checkout (card + ACH, ACH nudged); manual check/cash recording; payment webhooks (including ACH's delayed settlement) updating invoices.
- **Week 5: Autopay + delinquency.** SetupIntent enrollment behind the step-up; due-date charge runs (off-session, idempotent, retry-once, graceful fallback to unpaid); aging buckets; late-fee application + reversal; the reminder ladder (configurable, idempotent, audit-logged).
- **Week 6: Issues.** Numbered issues with photo threads (signed PUTs), member-visible vs board-only events, notice-sent receipts with delivery status, per-issue PDF export; member request filing from the portal.
- **Week 7: Announcements + documents.** Segmented compose, email + SMS channels with opt-in enforcement and STOP handling, delivery reports; document library with member visibility; monthly board digest email.
- **Week 8: Billing + hardening.** Stripe Billing for the three tiers; member-count limit enforcement; the PAID seal + countdown per DESIGN.md; audit-log coverage on every money movement; empty/error states; DRY_RUN safety against real member contacts.

**Acceptance criteria:**

- [ ] A new association can import a 60-household roster, connect Stripe, and generate a real quarterly invoice run within one evening, unassisted
- [ ] A member on a phone can open their portal link, pay by ACH, and enroll in autopay -- with no password ever created; saving a payment method requires the magic-link step-up (test proves the gate)
- [ ] The autopay run charges enrolled households on the due date exactly once (double-fire cron test), retries a failure once, and degrades failed enrollments to normal unpaid invoices with the treasurer notified
- [ ] ACH's multi-day settlement is represented honestly: invoices show "processing" until `succeeded`, and never show paid-then-unpaid
- [ ] Association funds land only in the association's Connect account -- no flow touches a platform balance (verified against Stripe test data)
- [ ] Recording a paper check takes <= 2 taps from the household row; a late fee can be applied and waived with both actions in the audit log
- [ ] A violation issue carries a member-visible timeline and board-only notes; the member portal never renders board-only events (test proves it); notice-sent events show delivery status
- [ ] An SMS announcement reaches only opted-in members, STOP opts out immediately, and the delivery report matches provider events
- [ ] The PAID seal + checks-to-chase countdown fire on webhook settlement, with the reduced-motion fallback per DESIGN.md
- [ ] Stripe checkout/upgrade/cancel for DuesDesk's own billing work; unit 76 on Block prompts an upgrade, never blocks silently
- [ ] 3-5 design-partner associations complete a full dues cycle with zero misapplied payments (tracked explicitly; one is a launch-blocking postmortem)

## Phase 2 -- Launch (Weeks 9-14)

Goal: public availability, first 30 paying associations, autopay enrollment proven as the wedge.

- Marketing site per MARKETING_PLAYBOOK.md (enemy: the volunteer treasurer chasing 40 checks a quarter) with the portal demo
- Lead magnets: HOA treasurer spreadsheet template, violation-letter templates (with review-your-documents language), dues-letter pack; 8-10 SEO articles on treasurer/self-managed keywords
- New-treasurer onboarding content timed to annual-meeting season (Q4-Q1)
- Comparison pages: vs PayHOA, vs Buildium, vs spreadsheet + checkbook
- Referral kit for accountants and community-association attorneys
- Launch: r/HOA and neighbor-forum threads with real (permissioned) before/after treasurer stories; league/club directories

**Acceptance criteria:**

- [ ] Self-serve funnel proven: at least 15 associations signed up, connected Stripe, and sent a real invoice run with zero human help
- [ ] 30 paying associations; autopay enrollment >= 50% of households within 60 days of an association's first cycle (the wedge metric -- measured per cohort)
- [ ] Template lead magnets converting visitors to email signups at >= 5%
- [ ] Trial-to-paid conversion >= 30% for associations that completed an invoice run during trial
- [ ] At least 5 customers from accountant/attorney referrals or league networks
- [ ] Support load sustainable: < 6 tickets/week per 30 customers; runbook for Connect onboarding, ACH timing, and portal-link questions
- [ ] Zero fund-handling incidents (misrouted or misapplied money) -- tracked explicitly, any occurrence is a stop-ship postmortem

## Phase 3 -- Growth (Months 4-12)

Goal: $25k+ MRR, the payments revenue line switched on, and the features that justify Community.

- Platform fee on card volume (~0.5%, transparently disclosed) once autopay value is proven; ACH stays fee-free to keep the nudge honest
- Payment plans v2 (automated schedules from the delinquency view) and prepayment/credit balances
- Budget vs actual view + annual summary pack (the board-packet artifact; not full fund accounting)
- Ballots/votes lite (annual meeting quorum + simple motions) -- evaluated against demand, not assumed
- Multi-property/sub-association support + API export (Community tier)
- Amenity/facility booking (clubs and leagues pull this forward; HOAs don't) -- demand-gated
- Board-turnover flow: role handoff wizard, outgoing-treasurer report, "everything the new board needs" export
- Annual template/compliance review (violation letters, SMS consent copy) as a recurring operating task

**Acceptance criteria:**

- [ ] $25k MRR; logo churn < 2%/month trailing 3 months (institutional-memory stickiness proven)
- [ ] Autopay enrollment >= 65% of households across active associations; median treasurer sessions per cycle down measurably from cohort 1 (the product should need them *less*)
- [ ] Platform fee live with zero disclosed-fee complaints escalating to churn; payments margin >= 10% of total revenue
- [ ] >= 20% of new revenue on Neighborhood+ tiers driven by SMS and payment plans; >= 5 Community-tier multi-property accounts
- [ ] Board-turnover flow used by >= 20 associations (the retention moment -- a turnover that stays is a decade-long account)
- [ ] Organic search delivers >= 30% of new trials; annual-meeting-season campaign delivers a measured Q4-Q1 signup spike
- [ ] Ballots and booking shipped or explicitly killed with documented evidence -- no zombie features
