# ShelfSense Roadmap

## Phase 0 -- Setup (Week 0, ~3-5 days)

Repo, infra, and the Shopify partner plumbing so Phase 1 is pure product work.

**Acceptance criteria:**

- [ ] Next.js 15 + TypeScript + Tailwind v4 repo scaffolded; CI runs lint + typecheck on every push
- [ ] Shopify Partner account + development store created; app registered with least-privilege scopes (`read_products`, `read_inventory`, `read_orders`) and App Bridge embedded config
- [ ] OAuth token exchange works against the dev store; webhook registration verified with `app/uninstalled` round-trip
- [ ] Neon Postgres provisioned (dev + prod branches); Drizzle configured; `db:generate` / `db:migrate` scripts work against dev
- [ ] Upstash Redis provisioned; BullMQ hello-world job round-trips from app to worker locally
- [ ] Worker process boots from the same repo (`npm run worker`) and deploys to Railway/Fly as a separate service
- [ ] Resend account + dev sending domain verified (SPF/DKIM)
- [ ] `.env.example` complete; secrets in Vercel/Railway envs, never in repo
- [ ] Sentry wired into app and worker

## Phase 1 -- MVP (Weeks 1-8)

Goal: a design-partner merchant installs, sees their revenue-at-risk number within 15 minutes, and sends their first PO draft within a week.

- **Weeks 1-2: Data spine.** OAuth install flow; webhook ingestion (HMAC verify, persist to `webhook_events`, enqueue); idempotent processing; product/variant/inventory mirrors; 90-day order backfill with cursor checkpoints and API-cost-limit awareness.
- **Weeks 3-4: Forecast engine.** `sales_daily` aggregation; 7/30/90-day velocities with trend weighting; suppliers + lead times (manual entry + CSV import); nightly recompute producing reorder points, order-by dates, days-of-cover, and status transitions; the `inputs` audit trail on every forecast row.
- **Weeks 5-6: The dashboard.** Reorder screen to DESIGN.md (at-risk stat block, ranked SKU rows, the runway, "the math" panel); revenue-at-risk computation; dead-stock report; alert dedup + snooze.
- **Week 7: PO drafts.** Supplier-grouped drafts with MOQ/pack-size rounding; inline quantity editing; CSV export; send-via-Resend with reply-to; sent/dismissed lifecycle and re-suggestion suppression.
- **Week 8: Billing + hardening.** Shopify Billing API subscriptions for the three plans with SKU-count gating and trial; weekly digest email; webhook replay tolerance; load test backfill against a 50k-order store; empty/loading/error states.

**Acceptance criteria:**

- [ ] A fresh install on a dev store reaches a populated reorder dashboard (backfill + first forecast) in under 15 minutes, unassisted
- [ ] Replaying the same order webhook 5x produces no duplicate `sales_daily` increments (idempotency proven by test)
- [ ] Forecast math is auditable: every reorder point on screen expands to the exact inputs stored on its forecast row, and a fixture test pins the formula (velocity x (lead + safety), MOQ/pack rounding)
- [ ] A SKU crossing its order-by date appears under ORDER NOW after the nightly run and raises exactly one alert email (dedup proven by running the job twice)
- [ ] Revenue-at-risk headline matches the sum of its per-SKU drill-downs to the cent
- [ ] PO draft for a supplier with MOQ 100 / pack 24 rounds 130 suggested units to 144, and the emailed CSV opens correctly in Sheets/Excel
- [ ] Dead-stock report ranks by cash tied up (`units x cost`) and excludes snoozed SKUs
- [ ] Billing: trial -> paid conversion works on a dev store; exceeding the plan's SKU cap prompts an in-app upgrade, never a silent failure
- [ ] `app/uninstalled` cleanly deactivates the shop: no further jobs, digests, or API calls
- [ ] 3-5 design-partner stores (live) running 2+ weeks; at least one reorder decision made from ShelfSense instead of the spreadsheet

## Phase 2 -- Launch (Weeks 9-14)

Goal: public App Store listing, first 30 paying shops, distribution foundations.

- Shopify App Store submission (start review early -- embedded-app review is slow and picky about scopes/billing)
- Marketing site + the free stockout-cost calculator (paste CSV or connect read-only; the lead magnet)
- App Store listing SEO: keyword-mapped title/tagline, 6 annotated screenshots at 390px fidelity, demo video
- Onboarding polish: data-readiness checklist (costs, suppliers, tracked inventory), sample-data preview mode
- 5 comparison/SEO articles ("Stocky alternative," "shopify reorder point," "inventory forecasting for Shopify," "dead stock calculator," "Inventory Planner alternative")
- Launch: design-partner case study with real recovered numbers, r/shopify, Shopify Community, D2C newsletters

**Acceptance criteria:**

- [ ] App Store listing approved and live
- [ ] Self-serve funnel proven: 10+ installs that reach a populated dashboard with zero human help
- [ ] 30 paying shops; trial->paid >= 25% for installs that complete backfill
- [ ] First 15 App Store reviews averaging >= 4.5
- [ ] Calculator page converting visitors to installs/emails at a measured rate (target >= 5%)
- [ ] Support load sustainable: < 5 tickets/week per 30 shops; runbook for the top 5 issues (missing costs, untracked inventory, backfill stalls)
- [ ] Digest deliverability: bounce rate < 2%, complaint rate < 0.1%

## Phase 3 -- Growth (Months 4-12)

Goal: $15k+ MRR, retention proof, and the features that justify Warehouse-tier pricing.

- Multi-location transfer suggestions (rebalance before reorder)
- Bundle/component (BOM) awareness so kits deplete component SKUs
- PO receiving: mark quantities received, reconcile against forecasts, measure supplier lead-time accuracy and feed it back into the model
- Seasonality v2: learn per-shop seasonal curves from 12+ months of data; promo/event flags merchants can set ahead of spikes
- Weekly "cash and cover" email digest upgrade -- the retention feature (at-risk $, dead $, what changed)
- Agency referral program (20% recurring); co-marketing with complementary apps
- Evaluate (do not commit to): Amazon channel ingestion, based on inbound demand only

**Acceptance criteria:**

- [ ] $15k MRR; logo churn < 3%/month over a trailing 3-month window
- [ ] Net revenue retention >= 100% (SKU-tier upgrades offsetting churn)
- [ ] Supplier lead-time accuracy measured and displayed for >= 50% of active suppliers (receiving shipped)
- [ ] Transfer suggestions adopted by >= 10 multi-location shops
- [ ] Digest open rate >= 45%; >= 60% of active shops have digests enabled
- [ ] Organic (App Store + SEO) delivers >= 50% of new installs
- [ ] A published case study with real numbers: stockouts prevented and dead stock recovered for a named merchant (or a documented honest miss and what changed)
