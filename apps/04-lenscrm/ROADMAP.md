# LensCRM Roadmap

Guiding sequencing decision: **CRM + booking + invoicing first, galleries second.** The money path (lead -> booking -> contract -> deposit) is the product's spine and the thing competitors without galleries already prove people pay for; galleries are the differentiator but are also the heaviest infrastructure. Ship a chargeable spine by week 6, layer galleries by week 10.

---

## Phase 0 -- Setup (Week 0-1)

Scaffolding, accounts, and rails so Phase 1 is pure feature work.

**Acceptance criteria:**
- [ ] Repo bootstrapped: Next.js 15 App Router + TypeScript strict + Tailwind 4 + ESLint; CI runs typecheck + lint on PRs
- [ ] Neon Postgres provisioned (dev + prod branches); Drizzle configured; `db:generate` and `db:migrate` scripts work end to end on an empty database
- [ ] Auth.js wired: magic-link + Google sign-in creates an `accounts` + `users` row; protected `(dashboard)` route group redirects unauthenticated users
- [ ] Stripe test-mode account configured; webhook endpoint receives and verifies a test event locally (Stripe CLI)
- [ ] R2 bucket created; presigned PUT/GET round-trip proven with a test file
- [ ] Resend domain verified (SPF/DKIM); a test transactional email delivers to Gmail without spam-foldering
- [ ] Worker process skeleton deploys (Railway/Fly) and consumes a test BullMQ job from Upstash Redis
- [ ] `.env.example` complete; a new developer can go from clone to running app in under 30 minutes

## Phase 1 -- MVP (Weeks 1-10)

### Weeks 1-2: Clients, leads, lead forms
- [ ] CRUD for clients with notes and session history view
- [ ] Lead form builder (3 templates by shoot type + custom fields); hosted public form page at `/f/:slug` with spam protection (honeypot + rate limit)
- [ ] Form submission creates a lead, emails the photographer within 60 seconds
- [ ] Lead pipeline board (inquiry / consult / proposal / booked / lost) with drag-to-move; lead -> client conversion in one click

### Weeks 3-4: Booking engine
- [ ] Booking types CRUD (duration, price, deposit %, buffers, min notice, max advance)
- [ ] Availability rules: weekly hours, date overrides, blackout dates; timezone-correct slot generation verified by unit tests covering DST transitions
- [ ] Public booking page `/book/:slug`: month view, slot pick, client details form; double-booking impossible under concurrent requests (constraint-backed)
- [ ] Reschedule + cancel flows with email notifications; dashboard calendar view of sessions

### Weeks 5-6: Contracts + invoicing (chargeable spine complete)
- [ ] Contract templates with merge fields; 4 starter templates (wedding, newborn, family/portrait, commercial with usage-rights clause)
- [ ] E-sign flow: consent checkbox, typed/drawn signature, IP + UA + timestamp audit trail, signed PDF stored to R2 with SHA-256 hash, copies emailed to both parties
- [ ] Deposit-first invoicing via Stripe Invoicing: retainer invoice on signature, draft balance invoice auto-finalized T-14d before session
- [ ] Stripe webhooks update invoice/payment/session state; deposit payment flips session `pending -> confirmed`
- [ ] SaaS billing: three tiers via Stripe Billing, 14-day trial, plan-limit enforcement (clients, forms, booking types)
- [ ] **Milestone check: a stranger can go from lead form to paid deposit without the photographer leaving LensCRM**

### Weeks 7-9: Galleries + proofing
- [ ] Direct-to-R2 uploads via presigned URLs with parallel batching; resumable on flaky connections; 2,000-image gallery uploads without browser crash
- [ ] Worker pipeline: sharp derivatives (thumb/web/full), optional watermark, content-hashed keys; p95 image ready < 60s after upload
- [ ] Storage quota enforcement per tier with clear UI before hitting the wall
- [ ] Public gallery page: password protection, responsive image grid, lightbox; loads first screen of a 1,000-image gallery in < 2s on 4G
- [ ] Proofing: favorites + final picks + per-image comments; photographer sees selection sets and exports filename list
- [ ] Delivery: per-gallery download policy, zip-build worker job with expiring link, gallery expiry dates

### Week 10: Automations + workflow templates
- [ ] Automation engine: triggers (booking confirmed, contract signed, invoice paid, gallery published, session T-offset), scheduled runs, idempotent sends, cancellation on reschedule
- [ ] 5 stock automations including shoot reminder T-48h and gallery-expiring warning
- [ ] Workflow templates per shoot type (wedding, newborn, family, commercial) that pre-configure form + contract + deposit % + automation sequence in one apply step
- [ ] Onboarding flow: pick shoot types -> templates applied -> checklist to first booking link

**Phase 1 exit criteria:**
- [ ] 10 design-partner photographers actively using it with real clients (real money moved through at least 15 deposits)
- [ ] Zero data-integrity incidents (no double-bookings, no double-sent automations, no lost signatures) over final 3 weeks
- [ ] Error tracking + uptime monitoring live; p95 dashboard page load < 1.5s

## Phase 2 -- Launch (Weeks 11-16)

- [ ] Billing hardening: dunning, plan upgrade/downgrade with proration, storage overage purchase, annual plans
- [ ] Marketing site with the HoneyBook+Pixieset price-comparison page and 3 SEO articles ("HoneyBook alternative for photographers", "photography contract template", "wedding photography workflow")
- [ ] Template lead magnets live (contract + questionnaire downloads, email-gated) feeding a trial-nurture sequence
- [ ] Import tools: CSV client import; Studio Ninja and Dubsado export-file importers (switching cost is the #1 objection)
- [ ] Launch posts coordinated: 3 photography Facebook groups (via design partners, not founder spam), r/WeddingPhotography feedback thread, 2 YouTube educator affiliate deals signed (30% recurring/12mo)
- [ ] Public status page; support inbox with < 24h first-response SLA
- [ ] Security pass: rate limiting on all public endpoints, signed gallery visitor tokens, e-sign audit-trail review with counsel completed

**Phase 2 exit criteria:**
- [ ] 100 paying accounts or $2.5k MRR (whichever first)
- [ ] Trial -> paid conversion >= 8%; monthly logo churn < 6%
- [ ] At least 30% of signups arriving from non-founder-driven channels (SEO, affiliates, word of mouth)

## Phase 3 -- Growth (Months 5-12)

- [ ] Studio features earn their tier: multi-shooter calendars, per-shooter booking pages and availability, round-robin assignment, roles/permissions
- [ ] Custom workflow template builder (Pro tier) + template sharing/community library
- [ ] Client portal: one login for a client's contracts, invoices, galleries, and questionnaires
- [ ] Questionnaires as a first-class object (wedding timeline builder is the killer instance)
- [ ] Gallery archive mode: expired galleries move to cold storage pricing; off-season account pause (churn deflection)
- [ ] Integrations: Google Calendar two-way sync, Zapier, QuickBooks/Xero export
- [ ] Mobile-responsive dashboard audit -> decide on PWA vs native based on usage data
- [ ] SEO scaled to 20+ comparison/template pages; affiliate program self-serve; WPPI/PPA partnership explored for year-2

**Phase 3 exit criteria:**
- [ ] $10k MRR with infra cost < 10% of revenue (watch storage line per ARCHITECTURE.md)
- [ ] Monthly logo churn < 4% annualized; >= 40% of new revenue on Studio/Pro tiers or annual plans
- [ ] NPS survey run with n >= 100; galleries and workflow templates cited as top-2 retention drivers (validates the differentiation thesis -- if not, re-plan)
