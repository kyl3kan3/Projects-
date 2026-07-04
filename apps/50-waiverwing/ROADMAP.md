# WaiverWing Roadmap

## Phase 0 -- Setup (Week 0, ~3-4 days)

Repo and infra so Phase 1 is pure product work. Deliberately the leanest setup in the portfolio (no queue/worker -- see ARCHITECTURE.md).

**Acceptance criteria:**

- [ ] Next.js 15 + TypeScript + Tailwind v4 repo scaffolded; CI runs lint + typecheck on every push
- [ ] Neon Postgres provisioned (dev + prod branches); Drizzle configured; `db:generate` / `db:migrate` work against dev
- [ ] AWS S3 bucket (SSE) + least-privilege IAM for PDFs and signature assets
- [ ] PWA spike proven: a service worker + IndexedDB outbox round-trips a queued write through airplane-mode toggle on a real tablet
- [ ] Postgres trigram search spike: pg_trgm indexes return sub-50ms name search on a 100k-row participants fixture
- [ ] Stripe account + test-mode products for the three plans
- [ ] Resend domain verified (SPF/DKIM)
- [ ] `.env.example` complete; secrets in envs, never in repo; Sentry wired

## Phase 1 -- MVP (Weeks 1-8)

Goal: a design-partner gym runs a real Saturday on WaiverWing -- QR pre-signs, kiosk walk-ups, guardian flows, and staff retrieval -- with zero paper fallback.

- **Weeks 1-2: Data spine.** Auth (Auth.js) + account/location/role model; waiver + immutable version model (builder blocks: text, initialed clauses, custom questions, signature); participants with guardian self-reference; trigram search plumbing.
- **Weeks 3-4: Signing flow.** `/sign/[token]` mobile-first per DESIGN.md; adult flow (contact, questions, clauses, typed/drawn signature, disclosure, evidence capture: timestamp/IP/UA/text hash); the guardian/minor flow (multi-minor, relationship, age validation); receipt emails; QR generation per location.
- **Weeks 5-6: Kiosk + check-in.** Kiosk PWA route (PIN entry, attract screen, auto-reset, big type, offline outbox with idempotent sync, sync indicator); check-in dashboard (today view, search-as-you-type, coverage pills, check-in taps recording the proving signature); expiry rules + re-sign prompts.
- **Week 7: Retrieval + incidents.** Participant detail with signature history and evidence lines; single + bulk PDF export with evidence summary (pdf-lib, S3-cached); incident logging with participant links snapshotting the in-force signature; incident-file bulk PDF.
- **Week 8: Billing + hardening.** Stripe Checkout + portal + webhooks + volume soft-caps (signing never blocks); Vercel Cron expiry roll + daily digest; kiosk chaos testing (old tablets, connectivity drops, rapid consecutive signers); empty/loading/error states to DESIGN.md.

**Acceptance criteria:**

- [ ] A new account can build a waiver from a template, print a QR, and take a real signature on a phone in under 15 minutes, unassisted
- [ ] Guardian flow: one guardian signs for two minors in one pass; each minor gets a signature row linked to the guardian with relationship; a minor's DOB entering the flow as a signer is rejected (test)
- [ ] Every signature stores the exact waiver_version and a text hash that matches an independent hash of the rendered text (fixture test)
- [ ] Kiosk survives: airplane-mode mid-signature -> completed signing lands in the outbox, syncs on reconnect exactly once (offline_key dedupe proven by replaying the sync 5x)
- [ ] Kiosk auto-reset never shows the previous signer's data (walk-through test on device)
- [ ] Search: any of the last 100k participants found by partial name in <50ms server-side; the "current waiver on file?" answer visible without a second tap
- [ ] Check-in writes the proving signature_id; an expired participant shows amber and one tap opens the re-sign flow
- [ ] PDF export contains waiver text version, answers, initials, signature image, and evidence summary; bulk export by date range works to 500 waivers
- [ ] Incident links snapshot the in-force signature: re-signing later does not change the incident file (test)
- [ ] Over-cap accounts see upgrade prompts but signing NEVER blocks (test)
- [ ] 3-5 design-partner locations live 2+ weeks including one real Saturday with zero paper fallback

## Phase 2 -- Launch (Weeks 9-14)

Goal: public availability, first 40 paying locations, the QR flywheel spinning.

- Marketing site per MARKETING_PLAYBOOK.md: the binder is the enemy; the 5-second demo is search -> waiver -> PDF
- Activity-specific waiver template skeletons (climbing, trampoline, tours, rentals -- clearly labeled for attorney review) as SEO lead magnets
- Competitor CSV import (Smartwaiver/WaiverForever exports)
- "Waivers by WaiverWing" QR-poster footer live (removable on Operator)
- Comparison pages (vs Smartwaiver, vs WaiverForever, vs the binder) + 6 SEO articles on job keywords
- Vertical community launch: climbing-gym owner groups, tour-operator forums, rental associations; 2 niche-podcast sponsorships

**Acceptance criteria:**

- [ ] 40 paying locations; trial -> paid >= 25%
- [ ] Self-serve funnel proven: 10+ locations reach a live QR/kiosk with zero human help
- [ ] >= 5 accounts migrated from a competitor via CSV import
- [ ] Median kiosk signing time < 90 seconds adult, < 3 minutes guardian+2 minors (measured in-product)
- [ ] Aggregate kiosk sync-failure rate < 0.1% of signings; zero lost signatures
- [ ] Template pages converting >= 6% of visitors to emails
- [ ] Support load < 6 tickets/week per 40 locations; runbook for top 5 issues (tablet setup, QR reprints, expiry rules, imports)
- [ ] Receipt/digest deliverability: bounce < 2%, complaint < 0.1%

## Phase 3 -- Growth (Months 4-12)

Goal: $12k+ MRR, seasonal resilience, and the Operator tier earning its price.

- Multi-location + multi-kiosk management (Operator): cross-location participant dedupe, roll-up dashboards
- Webhook out (participant.signed, checkin.created) + Zapier -- the integration wedge before native booking-suite integrations
- Booking-suite integrations (FareHarbor/Peek first) based on inbound demand ranking
- Marketing exports: opted-in participant CSV segments (COPPA-aware: adults only)
- Pause-not-cancel seasonal plan (archive retained, small retention fee)
- Insurance-broker channel program + co-branded waiver-hygiene checklist
- Season-boundary campaigns (pre-summer outfitters, January gyms)

**Acceptance criteria:**

- [ ] $12k MRR; logo churn < 3%/month trailing 3 months, measured across one full season boundary
- [ ] >= 30% of tour/rental accounts on annual or pause plans before their off-season (churn deflected, measured)
- [ ] >= 20 accounts on Operator using multi-location or webhooks
- [ ] One booking-suite integration live with >= 10 shared customers
- [ ] >= 3 insurance-broker partners each referring >= 2 paying locations
- [ ] A published retrieval case study: a real records request answered in minutes (with permission), even if mundane -- mundane is the pitch
