# BidBoard Roadmap

## Phase 0 -- Setup (Week 0, ~3-5 days)

Repo, infra, and accounts so Phase 1 is pure product work.

**Acceptance criteria:**

- [ ] Next.js 15 + TypeScript + Tailwind v4 repo scaffolded; CI runs lint + typecheck on every push
- [ ] Neon Postgres provisioned (dev + prod branches); Drizzle configured; `db:generate` / `db:migrate` scripts work against dev
- [ ] Cloudflare R2 bucket created; signed PUT/GET round-trip proven, including a 200 MB plan-set upload from the browser
- [ ] Resend account + sending domain verified (SPF/DKIM); delivery webhook received locally (tunnel)
- [ ] Vercel Cron configured against a stub job route with idempotency proven (double-fire test)
- [ ] Stripe account in test mode; three products/prices created; webhook endpoint receiving test events via Stripe CLI
- [ ] Signed portal-token scheme (jose) proven: mint, verify, expire, revoke
- [ ] `.env.example` complete; secrets in Vercel envs, never in repo
- [ ] Sentry wired in

## Phase 1 -- MVP (Weeks 1-8)

Goal: a design-partner GC runs a real bid package end to end -- invite, collect through the portal, level, award -- on a live project.

- **Weeks 1-2: Directory + projects.** Auth (Auth.js) + company/seat model; sub directory with CSI trade tagging and CSV import; project + trade package setup; bid form line editor with package templates; plan upload (signed R2 PUTs, version labels).
- **Weeks 3-4: Invitations + portal.** Invite flow with personal notes; signed-token portal (scope, plans, Q&A, bid form with draft persistence and revisions); lump-sum + attachment fallback; delivery/open tracking via Resend webhooks; the status board.
- **Week 5: Reminders + Q&A.** Cron reminder sweeps (T-7/T-3/T-1, idempotent); Q&A thread with broadcast answers; sub-side confirmation emails.
- **Week 6: Leveling.** The grid (pivot, per-row lows, missing cells, plugs); needs-mapping tray with manual mapping remembered per sub; inclusion/exclusion matrix; adjustments and adjusted totals; the level snap per DESIGN.md.
- **Week 7: Award + exports.** Award flow with confirm gates; award/regret notifications; owner-meeting PDF/CSV export with footnoted adjustments; audit log coverage (every bid view logged).
- **Week 8: Billing + hardening.** Stripe Billing for three tiers; project/seat limit enforcement; portal abuse limits (rate, size, token replay); load test a 20-sub package; empty/error states.

**Acceptance criteria:**

- [ ] A new GC can import 50 subs from CSV, create a project with 5 packages, and send 20 invites in under 30 minutes, unassisted
- [ ] A sub on a phone can open the link, download plans, fill the bid form, and submit -- with zero account creation and no horizontal scrolling at 390px
- [ ] A returning sub via the same link sees their draft; a resubmission before the due date creates revision 2 with revision 1 preserved
- [ ] The status board reflects sent/opened/submitted/declined accurately against real Resend events; reminders fire exactly once per scheduled touch (double-fire test proves idempotency)
- [ ] The leveling grid shows an apparent low computed on adjusted totals; plugs are visually distinct and footnoted in the export; a mapped free-form row is remembered for that sub's next bid
- [ ] The inclusion/exclusion matrix surfaces a seeded scope gap (test fixture: one sub excluding an item others include) with the red row treatment
- [ ] Award locks the package read-only and sends award + regret notices; every bid access appears in the audit log
- [ ] One sub's numbers are never renderable in another sub's portal (test proves token scoping)
- [ ] Stripe checkout, upgrade, downgrade, and cancel work; a Crew account cannot open a 4th active project
- [ ] 3-5 design-partner GCs complete at least one real package award each with zero lost-bid incidents

## Phase 2 -- Launch (Weeks 9-14)

Goal: public availability, first 25 paying GCs, the sub-side flywheel measurably turning.

- Marketing site per MARKETING_PLAYBOOK.md (enemy: bid leveling in a spreadsheet at midnight) with a live leveling demo
- Free leveling spreadsheet template (lead magnet) + 8-10 SEO articles ("bid leveling template," "bid tabulation," "how to level subcontractor bids")
- Comparison pages: vs BuildingConnected, vs SmartBid, vs Pantera, vs email + Excel
- Sub-side branding: "bid requested via BidBoard" touchpoints + a soft "run your own bids" path for subs who are also GCs
- Onboarding polish: template gallery per CSI division, sample leveled project to explore pre-signup
- Launch: r/Construction + estimator communities with real (permissioned) before/after leveling screenshots; builder-exchange lunch-and-learn kit

**Acceptance criteria:**

- [ ] Self-serve funnel proven: at least 12 GCs signed up, sent invites, and received portal bids with zero human help
- [ ] 25 paying GCs; portal submission rate >= 60% of invited subs across live packages (the north-star metric -- measured, not assumed)
- [ ] At least 3 signups attributable to the sub-side flywheel (a sub who received an invite became a GC customer)
- [ ] Leveling-template lead magnet converting visitors to email signups at >= 5%
- [ ] Trial-to-paid conversion >= 30% for GCs that ran a real package during trial
- [ ] Support load sustainable: < 6 tickets/week per 25 customers; runbook for the top 5 issues (plan upload, token links, mapping)

## Phase 3 -- Growth (Months 4-12)

Goal: $30k+ MRR, retention through the sub-database moat, and the features that justify Precon.

- Normalization assist: suggest-and-confirm mapping of free-form sub lines onto form lines (built on the accumulated mapping corpus; never silent)
- Sub coverage analytics: response rates, decline reasons, trade coverage gaps ("you have 2 reliable drywall subs; invite depth is risky")
- Bid history intelligence: per-trade unit-cost history across projects (private to each GC)
- Multi-office support, custom portal branding, API export (Precon tier)
- Plan-room upgrades: sheet indexing, per-package sheet subsets
- Pause-instead-of-cancel plan state for seasonal GCs
- Partnerships: takeoff-tool integrations (STACK/PlanSwift export -> bid form lines)

**Acceptance criteria:**

- [ ] $30k MRR; logo churn < 2.5%/month trailing 3 months, with paused accounts tracked separately from churn
- [ ] Portal submission rate >= 70% and median time-to-first-bid < 48h from invite
- [ ] Normalization assist accepts >= 70% of its suggestions (measured), with zero silent mappings
- [ ] >= 20% of new revenue on Precon tier; >= 5 accounts using multi-office
- [ ] Sub directories average > 100 subs per active GC (the switching-cost metric)
- [ ] Organic search delivers >= 25% of new trials; at least 5 builder-exchange/association channel deals live
- [ ] One takeoff-tool integration shipped with >= 10 GCs using it (or a documented decision not to build it, with evidence)
