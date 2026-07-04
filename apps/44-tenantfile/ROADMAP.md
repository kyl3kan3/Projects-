# TenantFile Roadmap

## Phase 0 — Setup (Week 0, ~3–5 days)

- Next.js 15 + TypeScript + Tailwind v4 scaffolded; CI runs lint + typecheck
- Neon Postgres + Drizzle migrations; Upstash Redis + BullMQ round-trip; worker deploys as its own service
- Cloudflare R2 bucket + presigned-upload helper working end to end
- Screening-provider and e-sign-provider sandbox accounts approved (start immediately — partner onboarding takes weeks); Stripe Connect configured in test mode
- Resend domain verified; Twilio test number acquired; 10DLC registration started
- `.env.example` complete; Sentry wired into app and worker

**Acceptance criteria:**
- [ ] A photo uploads browser → R2 via presigned URL and renders back
- [ ] Sandbox screening invite and e-sign envelope each round-trip a webhook into the dev database

## Phase 1 — MVP (Weeks 1–8)

- **Weeks 1–2: Spine.** Auth + landlord/property/unit model; listing pages at `/apply/[slug]`; application intake with document uploads; pipeline states.
- **Week 3: Screening.** Provider adapter, applicant-initiated invite + payment, webhook ingestion, report summary display, adverse-action letter flow.
- **Week 4: Leases.** E-sign adapter, field mapping from tenancy data, embedded signing, signed-PDF capture, tenancy activation.
- **Weeks 5–6: Money.** Charges + ledger, Stripe ACH on connected accounts, tenant pay page (signed links), manual payment recording, late-fee rules with state-cap warnings, reminder scheduler (send-time paid re-check).
- **Week 7: Maintenance + the File.** Request threads with photos, notifications, `file_events` assembly, PDF export of the File.
- **Week 8: Our billing + hardening.** Stripe plans + unit-count gating, audit log, webhook replay tolerance, a seeded 20-unit portfolio load test.

**Acceptance criteria:**
- [ ] A new landlord lists a unit and receives a test application (with documents) within 15 minutes, unassisted
- [ ] Screening: invite → applicant pays in sandbox → report summary appears on the application; declining after screening forces the adverse-action letter step and logs it
- [ ] Lease: draft → both parties sign on phones in sandbox → sealed PDF lands in the File and the tenancy activates with prorated first charges
- [ ] Rent cycle end to end: charge generated → T-3 reminder sent → tenant pays ACH on the pay page → ledger cell fills, reminder for that charge auto-cancels, file_events row written
- [ ] No reminder ever sends for a paid or waived charge (test replays the reminder job after payment)
- [ ] Late-fee engine respects grace days and the acknowledged state cap; a manual "mark paid (Zelle)" keeps the ledger consistent
- [ ] Maintenance: tenant opens a request with photos from the pay page; thread notifications deliver both ways; closing it stitches the File
- [ ] Export the File produces a complete, ordered PDF for a seeded tenancy (application → screening → lease → payments → requests)
- [ ] 5 design-partner landlords (real units) live for 2+ weeks; zero wrong-tenant messages; zero double-charged rent

## Phase 2 — Launch (Weeks 9–14)

- Marketing site to MARKETING_PLAYBOOK.md (device: the shoebox becoming the File; 5-second demo: a tenancy timeline assembling itself)
- Template/SEO library live: rental application, late-rent notice, deposit-return letter, per-state cheat sheets (the guardrail content, dated and sourced)
- Onboarding polish: import-existing-tenancy flow (mid-lease start is the common case), empty states, go-live checklist
- Annual billing; screening margin instrumentation
- Launch: BiggerPockets/r/Landlord presence, landlord Facebook groups, modest search ads on "tenant screening"/"rental application"

**Acceptance criteria:**
- [ ] Self-serve funnel proven: 25 landlords signed up and reached an active tenancy (lease signed or imported) with zero human help
- [ ] 60 paying landlords; ≥ 40% of active units collecting rent through the pay page
- [ ] ≥ 100 screening reports processed; margin per report verified against provider invoices
- [ ] Template pages drawing ≥ 5k organic visits/mo with measured signup conversion
- [ ] Reminder deliverability: bounce < 2%, SMS delivery > 95%, zero TCPA complaints
- [ ] Winter churn measured honestly (cohort dashboard exists, not vibes)

## Phase 3 — Growth (Months 4–12)

- Listing syndication (Zillow feed partners where accessible), applicant messaging
- Tax season: Schedule E-shaped expense tracking + year-end ledger export per property
- Second screening provider behind the adapter; income-verification add-on
- Collaborator roles (spouse/partner/bookkeeper), portfolio dashboard polish for 10–20 units
- Tenant autopay + rent-day flexibility; vendor contact book on requests
- Referral program (accountants, agents) with per-referred-landlord revenue share

**Acceptance criteria:**
- [ ] $20k MRR; logo churn < 2.5%/month trailing 3 months, including a full winter
- [ ] ≥ 25% of new signups arrive with an existing tenancy to import (retention-heavy cohort) — import flow measured and smooth
- [ ] Year-end export used by ≥ 30% of active landlords in tax season
- [ ] Screening attach rate ≥ 1.5 reports per vacancy; second provider live as failover
- [ ] Autopay adoption ≥ 25% of tenants on payment-enabled tenancies
