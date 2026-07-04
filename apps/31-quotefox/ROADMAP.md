# QuoteFox Roadmap

## Phase 0 -- Setup (Week 0, ~3-5 days)

Repo, infra, and accounts so Phase 1 is pure product work.

**Acceptance criteria:**

- [ ] Next.js 15 + TypeScript + Tailwind v4 repo scaffolded; CI runs lint + typecheck on every push
- [ ] Neon Postgres provisioned (dev + prod branches) with pgvector enabled; Drizzle configured; `db:generate` / `db:migrate` scripts work against dev
- [ ] Upstash Redis provisioned; BullMQ hello-world job round-trips from app to worker locally
- [ ] Worker process boots from the same repo (`npm run worker`) and deploys to Railway/Fly as a separate service
- [ ] Cloudflare R2 bucket created; presigned PUT + GET round-trip proven from a phone browser on cellular
- [ ] OpenAI API key provisioned with a hard monthly budget cap; Whisper + GPT-4o smoke tests pass from the worker
- [ ] Stripe platform account created; Connect (standard) configured in test mode; a test connected account onboarded; webhook endpoint receiving test events via Stripe CLI
- [ ] Resend account + sending domain verified (SPF/DKIM)
- [ ] `.env.example` complete; secrets in Vercel/Railway envs, never in repo
- [ ] Sentry wired into app and worker

## Phase 1 -- MVP (Weeks 1-8)

Goal: a design-partner contractor can walk a real job, review an AI draft, send a branded proposal, and collect a deposit.

- **Weeks 1-2: Data spine + price book.** Org/user model with Auth.js; onboarding (trade, branding, license); price book CRUD + CSV import + per-trade starter templates; embedding generation on item create/update; audit log plumbing.
- **Weeks 3-4: Capture + pipeline.** Mobile capture UI (record with pause/resume, photos, upload retry); presigned R2 uploads; `process-walkthrough` worker: Whisper transcription, candidate-item retrieval, GPT-4o structured drafting, estimate + line-item writes; failure states and re-run.
- **Weeks 5-6: Estimate editor + proposal send.** Review/edit screen with the signature reveal; `needs_pricing` flow; totals/markup/tax; signed proposal tokens; hosted proposal page (light theme); PDF snapshot; Resend delivery + proposal_events timeline; +2d/+5d nudge jobs.
- **Week 7: Acceptance + deposits.** E-acceptance (typed name, IP, timestamp, archived PDF); Stripe Checkout deposits on connected accounts; webhook ingestion with idempotency; receipts to both parties; jobs marked won.
- **Week 8: Our own billing + hardening.** Stripe Billing for the three plans; trial (5 quotes, no card); quote metering and plan gates; webhook replay tolerance; dead-letter queue review; jobsite field test week with 3-5 design partners (attics, wind, gloves).

**Acceptance criteria:**

- [ ] A new org can onboard, import a 200-item price book via CSV, and complete a first walkthrough within 30 minutes, unassisted
- [ ] A 4-minute walkthrough with 6 photos produces a >=8-line-item draft estimate in under 90 seconds, end to end, on cellular
- [ ] Every AI line item references a real price_book_item_id or is flagged `needs_pricing` -- a test corpus of 20 walkthroughs yields zero invented prices
- [ ] Each drafted line item shows the transcript excerpt that produced it; tapping it reveals the surrounding narration
- [ ] Capture survives airplane-mode dropouts: interrupted uploads retry and the walkthrough completes without data loss (proven by test)
- [ ] Proposal link renders correctly on iOS Safari and Android Chrome; first homeowner view fires a `viewed` event and notifies the contractor within 60 seconds
- [ ] End-to-end money path works in test mode: accept proposal, pay a 10% deposit via Checkout on a connected test account, webhook marks `deposit_paid`, both receipts delivered, nudges cancelled
- [ ] Duplicate webhook delivery causes no duplicate deposit records or duplicate emails (replay test, 5x)
- [ ] Plan gates enforced: 26th quote on Solo returns the upgrade prompt without blocking an in-progress walkthrough
- [ ] QuoteFox's own checkout works for all three plans; trial expiry drops org to read-only, never deletes data
- [ ] Signature animation runs at 60fps on a mid-tier Android; `prefers-reduced-motion` collapses it per DESIGN.md
- [ ] 3-5 design partners (real trades, live jobs) have each sent >=5 real proposals and at least one has collected a real deposit

## Phase 2 -- Launch (Weeks 9-14)

Goal: public availability, first 20 paying customers, distribution foundations in one trade (HVAC).

- Marketing site to MARKETING_PLAYBOOK.md: the enemy (the 10pm kitchen table), the device ("walk the job, send the bid from the driveway"), a real capture-to-send screen recording as the hero
- Quote-speed calculator lead magnet ("what a 3-day quote lag costs you per year")
- Comparison pages: vs Joist, vs Housecall Pro proposals, vs the Word template
- Onboarding polish: per-trade starter price books expanded, empty states, go-live checklist; assisted price-book import offer for every trial
- Launch in HVAC communities (HVAC-Talk, r/HVAC, Facebook owner groups) with design-partner receipts; 2-3 trade-creator sponsorships booked
- Support runbook; status page; OpenAI outage degradation path (capture always works, drafting queues)

**Acceptance criteria:**

- [ ] Self-serve funnel proven: at least 10 orgs signed up, imported a price book, and sent a real proposal with zero human help
- [ ] 20 paying customers; at least 12 in HVAC (beachhead discipline)
- [ ] Median capture-to-sent time across all real usage under 4 hours (the marketing claim must be true)
- [ ] Draft acceptance quality: >=70% of AI-drafted line items sent without edits (measured, published to design partners)
- [ ] At least 25 real deposits collected through the platform, zero misrouted funds, zero double-charges
- [ ] Calculator page converting visitors to email signups at a measured rate (target >=5%)
- [ ] Two trade-creator videos live with trackable codes; CAC per channel measured
- [ ] Support load sustainable: <5 tickets/week per 20 customers; runbook covers the top 5 issues (audio quality, CSV import, Stripe onboarding, deposit refunds, plan limits)

## Phase 3 -- Growth (Months 4-12)

Goal: $25k+ MRR, retention proof, and expansion beyond the beachhead trade.

- Review-request follow-ups after job completion (the Fleet-tier retention feature)
- Win-rate analytics: quote speed vs outcome, per tech, per job type -- the dashboard that proves QuoteFox pays for itself
- Good/better/best proposal options; financing-offer slot (partner referral, not underwriting)
- QuickBooks export + Jobber handoff (coexist strategy made concrete)
- Spanish-language capture (large share of field techs narrate in Spanish)
- Second and third trades opened (roofing, then electrical), each with its own starter price books, comparison pages, and community push
- Model cost pass: batch/smaller models where draft quality holds; renegotiate per-quote COGS below $0.06
- Referral program for trade consultants and supply-house reps (20% recurring)

**Acceptance criteria:**

- [ ] $25k MRR; logo churn <3%/month over a trailing 3-month window
- [ ] Net revenue retention >=100% (Solo -> Crew upgrades offsetting churn)
- [ ] Win-rate analytics live and cited in at least 2 real customer case studies with real numbers
- [ ] Roofing launched with >=15 paying roofing customers; playbook documented and repeatable for trade #3
- [ ] Organic + community channels delivering >=40% of new trials (measured via attribution survey + analytics)
- [ ] At least 5 active referral partners who have each sent >=2 paying customers
- [ ] Per-quote AI cost reduced below $0.06 with no measurable draft-quality regression (or a documented finding that quality requires the spend -- honesty over vanity)
- [ ] iOS/Android native decision made from PWA friction data, not assumption
