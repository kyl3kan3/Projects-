# LumaShot Roadmap

Solo-founder / two-person pace assumed. "Week" estimates are focused build weeks.

---

## Phase 0 -- Setup (Week 0, ~3-4 days)

Scope:

- Repo, Next.js 15 + TypeScript + Tailwind v4 scaffold, lint/typecheck CI
- Postgres provisioned (Neon), Drizzle schema + first migration for all tables in ARCHITECTURE.md
- Stripe account: 3 one-time Products/Prices created, test-mode webhook wired to a local tunnel
- Replicate account + API token; run one manual Flux LoRA train + generate end-to-end with founder selfies to validate quality and record real timings/costs
- S3 buckets (uploads, results) with CORS for presigned PUT and lifecycle backstop rules
- Upstash Redis + skeleton BullMQ worker boots and processes a no-op job
- Resend domain verified, test email sends
- `.env.example` complete; a new machine reaches "app boots, worker boots" from README alone

Acceptance criteria:

- [ ] Manual Replicate run produced headshots the founder would actually use on LinkedIn (subjective gate -- if this fails, stop and fix prompts/model choice before writing product code)
- [ ] Recorded baseline: training time, per-image inference time, exact cost per 100 images
- [ ] `pnpm dev`, `pnpm worker`, `pnpm db:migrate` all work from a clean clone
- [ ] Stripe test checkout completes and the webhook event is received locally

## Phase 1 -- MVP (Weeks 1-6)

Scope (maps to the README MVP checklist):

- Weeks 1-2: Auth (Google), pack purchase via Stripe Checkout, order state machine, upload flow with presigned S3 PUTs, upload validation (face detection, quality scoring, consistency checks)
- Weeks 3-4: Full pipeline in the worker: train LoRA -> generate batches per style -> store results -> zip -> email. Replicate webhook handling with idempotency. Style catalog with 6-8 launch styles and real previews.
- Weeks 5-6: Gallery, favorites, downloads, order status page with live progress, auto-deletion job + countdown UI, refund/regeneration flow, admin queue for failed orders, NSFW output filter, polish + private beta with 20-30 users (free codes in exchange for feedback and before/after permission)

Acceptance criteria:

- [ ] End-to-end pack delivered in **under 30 minutes p50, under 60 minutes p95** (payment to "ready" email), measured across the beta cohort
- [ ] **Likeness acceptance rate above 70%** in the beta cohort ("would you use at least one of these as your real profile photo?" survey) -- below that, iterate on validation/prompts before charging strangers
- [ ] Upload validation rejects a planted bad-input test set (blurry, multi-face, sunglasses, mixed-person) with actionable per-photo messages
- [ ] Zero orders stuck in a non-terminal state for more than 24h without appearing in the admin queue
- [ ] Training photos of every completed beta order deleted on schedule, verified against S3
- [ ] Stripe test-mode refund flow updates order state and triggers data deletion

## Phase 2 -- Launch (Weeks 7-10)

Scope:

- Real-money launch: production Stripe, refund policy page, terms (subject-consent clause), privacy policy
- Landing page conversion pass: per-style preview galleries, before/after wall from beta users, FAQ targeting the top objections (likeness, privacy, refunds)
- SEO foundation: comparison pages (vs HeadshotPro / Aragon / BetterPic), 4-6 persona pages, sitemap, structured data
- Product Hunt launch; founder LinkedIn before/after series
- Google Ads pilot: $500-1,000 test budget on 3-5 exact-match high-intent keywords, hard CPA cap
- Analytics: funnel events (visit -> checkout -> upload complete -> ready), refund and regeneration rates on a dashboard

Acceptance criteria:

- [ ] First 100 paid orders fulfilled with **refund rate under 5%** and **regeneration-request rate under 15%**
- [ ] Checkout conversion from pricing-page view **above 2%** (else fix the page before scaling spend)
- [ ] Ads pilot CPA at or below $25 blended, or the channel is paused (documented decision either way)
- [ ] p50 delivery time still under 30 minutes at launch traffic
- [ ] At least 3 organic before/after posts from real customers

## Phase 3 -- Growth (Weeks 11+)

Scope:

- **Team accounts:** admin buys N seats, email invites, shared style presets, consolidated gallery, per-seat CSV export, invoice payment for larger orders
- **Upsells:** extra styles on completed orders (reuse stored LoRA), rush processing, regeneration credit packs
- **New styles pipeline:** internal tooling to author, test (across a fixed diverse face set), and publish a style as a DB insert -- target one new style per week without deploys
- **API / white-label:** keyed API for recruiting agencies and career platforms (submit photos, receive gallery URL), bulk-code generation for B2B deals
- **Affiliate program:** career coaches / resume writers, 20-30% first-order commission, tracked links and self-serve payouts
- Ops hardening: queue autoscaling, cost alerts, weekly likeness-quality regression run against the fixed face set

Acceptance criteria:

- [ ] First 5 team orders (5+ seats each) delivered; at least one repeat team purchase
- [ ] Upsell attach rate above 10% of completed orders
- [ ] New style shipped end-to-end (authored -> tested -> live) in under one day, no deploy
- [ ] 20+ active affiliates generating 10%+ of monthly orders
- [ ] Monthly infra + COGS tracking within 10% of the ARCHITECTURE.md model at real volume
