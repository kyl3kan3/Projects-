# Dunly Roadmap

## Phase 0 -- Setup (Week 0, ~3-5 days)

Repo, infra, and accounts so Phase 1 is pure product work.

**Acceptance criteria:**

- [ ] Next.js 15 + TypeScript + Tailwind v4 repo scaffolded; CI runs lint + typecheck on every push
- [ ] Neon Postgres provisioned (dev + prod branches); Drizzle configured; `db:generate` / `db:migrate` scripts work against dev
- [ ] Upstash Redis provisioned; BullMQ hello-world job round-trips from app to worker locally
- [ ] Worker process boots from the same repo (`npm run worker`) and deploys to Railway/Fly as a separate service
- [ ] Stripe platform account created; Connect OAuth app configured in test mode; webhook endpoint receiving test events via Stripe CLI
- [ ] Resend account + dev sending domain verified (SPF/DKIM); Twilio account + test number acquired; 10DLC registration *started* (it takes weeks -- begin now)
- [ ] `.env.example` complete; secrets in Vercel/Railway envs, never in repo
- [ ] Sentry wired into app and worker

## Phase 1 -- MVP (Weeks 1-8)

Goal: a design partner can connect Stripe, turn on dunning, and see attributed recovered revenue.

- **Weeks 1-2: Data spine.** Stripe Connect OAuth flow; webhook ingestion (verify, persist to `webhook_events`, enqueue); idempotent event processing; mirrors for customers/subscriptions/payment methods; 90-day historical backfill; auth (Auth.js) + org model.
- **Weeks 3-4: Retry engine.** `payment_failures` lifecycle; retry scheduling with BullMQ delayed jobs; Stripe Smart Retries suppression; hard-decline short-circuiting; idempotency keys on `invoices.pay`; audit log.
- **Weeks 5-6: Messaging + card-update page.** Email sequences via Resend with React Email templates; per-org sender subdomain setup flow; hosted card-update page (signed tokens + SetupIntents); suppression/unsubscribe handling; delivery-status webhooks.
- **Week 7: Attribution + dashboard.** Conservative attribution ledger; dashboard (recovered $, recovery rate, at-risk MRR, per-failure drill-down); recovery preview on connect (the "here's your leak" moment).
- **Week 8: Pre-dunning + our own billing.** Card-expiring daily scan and campaign; Stripe Billing for Dunly's four plans; plan gating; hardening pass (webhook replay, dead-letter queue review, load test with synthetic events).

**Acceptance criteria:**

- [ ] A new org can connect a Stripe test account and see backfilled failures + recovery preview within 10 minutes, unassisted
- [ ] `invoice.payment_failed` on a connected account produces a `payment_failures` row, a scheduled retry plan, and a queued email sequence -- verifiable in the dashboard
- [ ] Duplicate webhook delivery and out-of-order events cause no duplicate retries or messages (proven by test that replays the same event 5x)
- [ ] No retry is ever scheduled while Stripe Smart Retries are active on the same invoice (test fixture proves suppression)
- [ ] End-to-end recovery works in test mode: fail with `4000000000000341`, receive email, update card on hosted page, off-schedule retry succeeds, failure marked `recovered`, attribution row written with correct `attributed_to`
- [ ] Baseline recoveries (Stripe's own retry succeeds) are recorded but excluded from "recovered by Dunly" totals
- [ ] Pre-dunning: a test card expiring this month triggers the T-21/T-7/T-1 sequence and stops when the card is updated
- [ ] Unsubscribe link works and permanently suppresses; bounces auto-suppress
- [ ] Dunly's own checkout works for all three flat plans; Performance plan computes a correct monthly amount from the attribution ledger in a test scenario
- [ ] Every write action to a connected Stripe account appears in the audit log
- [ ] 3-5 design partners (real Stripe accounts, live mode) running for 2+ weeks with zero double-charge incidents

## Phase 2 -- Launch (Weeks 9-14)

Goal: public availability, first 20 paying customers, distribution foundations.

- Stripe App Marketplace submission (start review early -- it's slow)
- Marketing site + involuntary-churn calculator (lead magnet)
- Comparison pages (vs Churn Buster, vs Baremetrics Recover, vs Stunning) + 5 SEO articles on core keywords
- Onboarding polish: empty states, sequence template gallery, go-live checklist (sender domain verified before live sends)
- SMS dunning shipped behind Growth+ gate (10DLC should be approved by now)
- Launch: Indie Hackers post with real design-partner recovery numbers, r/SaaS, MicroConf Connect, Product Hunt

**Acceptance criteria:**

- [ ] Stripe App Marketplace listing submitted (approved is not fully in our control; submitted + responding to review feedback is)
- [ ] Self-serve funnel proven: at least 10 orgs signed up, connected, and reached live sending with zero human help
- [ ] 20 paying customers; at least 3 on the Performance plan
- [ ] Aggregate recovered revenue across customers > 10x aggregate Dunly fees (the ROI story is true, not aspirational)
- [ ] SMS sequences live for at least 5 customers with delivery rate > 95% and zero TCPA complaints
- [ ] Churn-calculator page converting visitors to email signups at a measured rate (target >= 5%)
- [ ] Support load sustainable: < 5 tickets/week per 20 customers; runbook exists for the top 5 issues
- [ ] Deliverability: aggregate bounce rate < 2%, complaint rate < 0.1% across all sending

## Phase 3 -- Growth (Months 4-12)

Goal: $10k+ MRR, retention proof, and the features that justify Scale-tier pricing.

- A/B testing for sequences (subject lines, timing, SMS vs email mix)
- Slack/email weekly recovery digest ("Dunly recovered $1,240 for you this week" -- the retention feature)
- Multiple Stripe accounts per org; team roles
- Public API + outbound webhooks (recovered/lost events into customers' stacks)
- Retry-timing model v2: learn from accumulated attempt outcomes (success rate by decline code, weekday, hour) and ship data-backed default schedules
- Content flywheel: 2 SEO articles/month; quarterly "State of Failed Payments" report from anonymized aggregate data
- Agency/consultancy referral program (20% recurring)
- Evaluate (do not commit to): Paddle or Chargebee as a second platform, based on inbound demand only

**Acceptance criteria:**

- [ ] $10k MRR; logo churn < 2%/month over a trailing 3-month window
- [ ] Net revenue retention >= 100% (MRR-tier upgrades offsetting any churn)
- [ ] Measured recovery-rate lift from A/B tests published as a case study (real numbers, even if modest)
- [ ] Weekly digest enabled for > 80% of active customers
- [ ] At least 5 customers on Scale tier using multi-account or API
- [ ] Organic search delivers >= 30% of new trials (measured via attribution survey + analytics)
- [ ] At least 3 active referral partners who have each sent >= 2 paying customers
- [ ] Retry-timing v2 shipped with a documented, statistically defensible improvement over the static schedule (or a documented finding that it doesn't matter -- honesty over vanity)
