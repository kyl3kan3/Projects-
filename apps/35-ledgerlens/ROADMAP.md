# LedgerLens Roadmap

## Phase 0 -- Setup (Week 0, ~3-5 days)

Repo, infra, and accounts so Phase 1 is pure product work.

**Acceptance criteria:**

- [ ] Next.js 15 + TypeScript + Tailwind v4 repo scaffolded; CI runs lint + typecheck on every push
- [ ] Neon Postgres provisioned (dev + prod branches); Drizzle configured; `db:generate` / `db:migrate` scripts work against dev
- [ ] Cloudflare R2 bucket created; signed PUT/GET round-trip proven from a test script
- [ ] Upstash Redis provisioned; BullMQ hello-world job round-trips from app to worker locally
- [ ] Worker process boots from the same repo (`npm run worker`) and deploys to Railway/Fly as a separate service
- [ ] Resend account with inbound domain (`in.ledgerlens.app`) receiving a test forwarded email and delivering the webhook locally (tunnel)
- [ ] Anthropic API key provisioned; one test extraction against a sample receipt image returns the structured schema
- [ ] Stripe account in test mode; three products/prices created; webhook endpoint receiving test events via Stripe CLI
- [ ] `.env.example` complete; secrets in Vercel/Railway envs, never in repo
- [ ] Sentry wired into app and worker

## Phase 1 -- MVP (Weeks 1-8)

Goal: a design partner can forward emails and photo receipts for a full month, review flags, and hand their accountant a close package.

- **Weeks 1-2: Ingestion spine.** Auth (Auth.js) + org model with forwarding slugs; inbound email webhook (verify, store to R2, dedupe by hash, enqueue); direct-upload capture flow with signed R2 PUTs; document inbox UI with live status.
- **Weeks 3-4: Extraction.** `extract-document` worker with Anthropic structured outputs; per-field confidence; plan-cap gating; extraction cost tracking per document; blurry-photo pre-check; dead-letter handling and re-run.
- **Week 5: Review + rules.** Review queue UI (sheet per document, provenance crops); accept/correct flow; vendor normalization and learned category rules; duplicate merge flow.
- **Week 6: Close package.** Monthly close job with the unresolved-items gate; PDF cover render; QBO and Xero CSV formats validated against real import screens; ZIP assembly; close email.
- **Week 7: Share + billing.** Accountant share links (hashed tokens, expiry, revoke, access log); Stripe Billing for the three tiers with document metering; upgrade/downgrade flows; soft over-cap queueing.
- **Week 8: Hardening.** Webhook replay tolerance, ingestion abuse limits (size/type/sender checks), audit log coverage, load test with a 200-email forward burst, weekly digest email.

**Acceptance criteria:**

- [ ] A new org can sign up, forward an email, and see a categorized entry within 3 minutes, unassisted
- [ ] Photo capture on a real phone (iOS Safari + Android Chrome) uploads directly to R2 and extracts end to end
- [ ] Duplicate forward of the same receipt produces one entry and one visible duplicate record, never two entries
- [ ] Every field below the confidence threshold appears in the review queue; nothing below threshold ever reaches an export unreviewed (test proves the gate)
- [ ] A category correction creates a vendor rule; the next document from that vendor auto-categorizes and skips review
- [ ] A month with zero flagged items closes automatically on the 1st and the close email arrives with working download links
- [ ] The QBO CSV imports into QuickBooks Online and the Xero CSV into Xero without manual column mapping
- [ ] Share link works logged-out, is revocable, expires, and every access is visible to the operator
- [ ] Plan caps enforce: document 76 on Solo parks with a clear notice and processes after upgrade
- [ ] Stripe checkout, upgrade, and cancel work for all three tiers; metered usage reported correctly for a test month
- [ ] 3-5 design partners (real businesses) complete a full monthly close with zero data-loss incidents

## Phase 2 -- Launch (Weeks 9-14)

Goal: public availability, first 30 paying customers, the accountant channel seeded.

- Marketing site per MARKETING_PLAYBOOK.md (enemy: the January shoebox and the cleanup fee) + cleanup-fee calculator lead magnet
- SEO foundation: 8-10 articles on shoebox/cleanup/receipt-organizer keywords; comparison pages (vs Dext, vs QuickBooks Solopreneur, vs Wave receipts)
- Accountant referral program (20% recurring or client free months) with a one-page "for your clients" PDF accountants can forward
- Onboarding polish: empty states, sample close package to explore pre-signup, go-live checklist
- Launch: r/smallbusiness + r/freelance threads with real before/after close packages, trade Facebook groups, Product Hunt

**Acceptance criteria:**

- [ ] Self-serve funnel proven: at least 15 orgs signed up, ingested 10+ documents, and reached a close with zero human help
- [ ] 30 paying customers; at least 5 arrived via an accountant referral
- [ ] Cleanup-fee calculator converting visitors to email signups at a measured rate (target >= 5%)
- [ ] Extraction accuracy audited on a 500-document sample: >= 97% correct totals among auto-confirmed fields; 100% of wrong totals were flagged, not silently exported
- [ ] Support load sustainable: < 5 tickets/week per 30 customers; runbook for the top 5 issues
- [ ] Trial-to-paid conversion >= 25% for orgs that completed one close during trial

## Phase 3 -- Growth (Months 4-12)

Goal: $15k+ MRR, the accountant channel compounding, and the features that justify Pro.

- Bank-feed CSV import + receipt matching (the "missing receipt" report becomes bidirectional)
- Mileage log (manual first, auto later)
- Multi-entity support for Pro (the operator with an LLC and a side business)
- Accountant portal: one login, all their LedgerLens clients, bulk package download in January
- Quarterly-estimate helper: category totals mapped to Schedule C lines with plain-language disclaimers
- Extraction v2: correction-history fine-tuning of prompts per document class; cheaper classifier pre-pass to reject non-financial documents before paid extraction
- Content flywheel: 2 SEO articles/month; a yearly "State of the Shoebox" report from anonymized aggregates

**Acceptance criteria:**

- [ ] $15k MRR; logo churn < 3%/month over a trailing 3-month window, with post-tax-season (May-June) cohort churn specifically < 5%
- [ ] Accountant channel drives >= 30% of new signups; >= 10 accountants with 3+ referred clients each
- [ ] Bank-matching shipped: >= 50% of Pro orgs connect a CSV and resolve at least one missing-receipt gap
- [ ] Review-queue volume per returning customer down >= 40% from month 1 to month 6 (vendor rules compounding -- measured, not assumed)
- [ ] Extraction unit cost down >= 30% via the classifier pre-pass, with accuracy unchanged (or a documented finding that it isn't worth it)
- [ ] Organic search delivers >= 25% of new trials (attribution survey + analytics)
