# GreenTally Roadmap

## Phase 0 — Setup (Week 0, ~3-5 days)

Repo, infra, and reference data so Phase 1 is pure product work.

**Acceptance criteria:**

- [ ] Next.js 15 + TypeScript + Tailwind v4 repo scaffolded; CI runs lint + typecheck on every push
- [ ] Neon Postgres provisioned (dev + prod branches); Drizzle configured; `db:generate` / `db:migrate` work against dev
- [ ] Upstash Redis provisioned; BullMQ hello-world job round-trips locally; worker boots from the same repo (`npm run worker`) and deploys to Railway/Fly
- [ ] Cloudflare R2 bucket created; presigned upload + signed download round-trip proven
- [ ] Emission-factor seed data loaded and versioned: EPA GHG factors, eGRID subregions, DEFRA fuel factors, US EEIO spend factors — each row with citation + vintage
- [ ] Anthropic API key wired; one real utility bill extracts to the target JSON schema in a script
- [ ] Playwright renders a hello-world print route to PDF inside the worker container
- [ ] Stripe products/prices created for the three plans (+ annual); webhook endpoint receiving test events
- [ ] `.env.example` complete; Sentry wired into app and worker

## Phase 1 — MVP (Weeks 1-8)

Goal: a design partner can upload a year of bills and a spend CSV, review extractions, and download a credible CSRD-lite PDF with mapped questionnaire answers.

- **Weeks 1-2: Data spine.** Auth (Auth.js) + org/site/period model; document upload flow (presigned R2, `documents` rows, queue); dashboard shell with coverage meter.
- **Weeks 3-4: Extraction.** `extract-document` job with strict schema + per-field confidence; deterministic validators (units, period continuity, duplicates); the review screen (bill image beside editable fields); audit log on every acceptance.
- **Week 5: Spend pipeline.** CSV column mapping, EEIO auto-classification with user confirmation table, exclusion rules with reasons.
- **Week 6: Emissions engine.** Deterministic, replayable `compute-footprint` (Scope 1, Scope 2 location + market, Scope 3 spend screen); provenance chain on every result row; footprint dashboard with the provenance thread.
- **Week 7: Report + answers.** Print-CSS report route -> Playwright PDF; methodology + factor citations; questionnaire answer bank with templated answers and source refs.
- **Week 8: Billing + hardening.** Stripe Checkout + portal, plan gating, footprint-preview gate for free users; dead-letter review, extraction-failure UX, load test with a 60-document batch.

**Acceptance criteria:**

- [ ] A new org can sign up, create a site, upload 12 months of real bills, and reach a complete Scope 1/2 footprint without human help
- [ ] Extraction accuracy proven on a 50-bill benchmark set: ≥95% of high-confidence fields correct; 100% of incorrect fields either flagged below threshold or caught by validators (no silent wrong numbers)
- [ ] Every figure on the dashboard and in the PDF traces to a source document and a cited factor via the provenance thread
- [ ] Recompute is idempotent: deleting and replaying `compute-footprint` yields identical results (engine determinism test)
- [ ] Spend CSV of 1,000 lines classifies in one pass with user-confirmable suggestions; excluded categories carry reasons
- [ ] The CSRD-lite PDF renders with both Scope 2 methods, intensity metrics, methodology notes, and the explicit screening-estimate disclaimer for Scope 3
- [ ] Answer bank produces ≥20 mapped CDP/EcoVadis-style answers with correct interpolated figures
- [ ] Locking a period freezes results; post-lock uploads land in the next period
- [ ] Checkout works for all three plans; free users see the footprint preview and a blurred report page
- [ ] 3-5 design partners (real bills) have delivered a GreenTally PDF to a real customer questionnaire

## Phase 2 — Launch (Weeks 9-14)

Goal: public availability, first 20 paying customers, the SEO + lead-magnet engine live.

- Marketing site per MARKETING_PLAYBOOK.md: the bill-to-number demo as the hero, consultant-price anchoring
- Free **questionnaire decoder** lead magnet (paste questions, get plain-English explanations + which GreenTally answers them)
- 10 SEO articles on the panic queries ("EcoVadis questionnaire help", "Scope 1 2 3 for small business", "CDP supplier request")
- Onboarding polish: sample data mode, extraction-failure recovery, go-live checklist
- Year-over-year comparison for returning periods; branded report headers (Standard+)
- Launch: accountant/fractional-CFO outreach list, two trade-association webinars, Indie Hackers/LinkedIn build-in-public posts with real (consented) partner numbers

**Acceptance criteria:**

- [ ] Self-serve funnel proven: ≥10 orgs signed up, uploaded, and reached a complete footprint with zero human help
- [ ] 20 paying customers; ≥5 on Standard or above
- [ ] Questionnaire decoder converting visitors to email signups at ≥5%
- [ ] ≥3 customers report (verbatim quote collected) that a real procurement reviewer accepted the GreenTally report
- [ ] Median time from first upload to generated PDF < 5 days (including review passes)
- [ ] Extraction unit cost measured and < $2.50 per onboarded org at current mix
- [ ] Support load sustainable: < 5 tickets/week per 20 customers; runbook for the top 5 issues

## Phase 3 — Growth (Months 4-12)

Goal: $15k+ MRR, the accountant channel, and defensible depth.

- Accountant/fractional-CFO multi-client workspace with per-client billing (the channel feature)
- Reduction-plan builder: pick measures, project year-over-year deltas honestly (Supplier+)
- Procurement-portal exports: formatted responses for common supplier portals
- Utility integrations (Arcadia/UtilityAPI or direct) to replace manual bill upload for supported providers
- Factor-set expansion: country grids beyond US/UK, licensed sets (ecoinvent-derived) as a paid add-on with proper agreements
- Practitioner review network: credentialed reviewers co-sign reports for a fixed fee (credibility ladder)
- Renewal-season lifecycle: automated "your 2026 questionnaire cycle starts now" campaigns
- Content flywheel: 2 articles/month + an annual "State of Supplier Carbon Requests" report from anonymized aggregate data

**Acceptance criteria:**

- [ ] $15k MRR; logo churn < 2%/month over a trailing 3-month window
- [ ] Annual-plan mix ≥ 50% of revenue (the renewal-cycle bet proven)
- [ ] ≥5 accountant partners each managing ≥3 client orgs
- [ ] Second-year renewal rate ≥ 80% among customers who completed a first reporting period
- [ ] Utility integration live for ≥2 major providers, cutting median onboarding time measurably (report the number honestly)
- [ ] ≥10 reports co-signed through the practitioner network with zero methodology disputes
- [ ] Organic search delivers ≥ 30% of new trials (attribution survey + analytics)
