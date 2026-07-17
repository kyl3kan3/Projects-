# PriceProbe Roadmap

## Phase 0 -- Setup (Week 0, ~3-4 days)

Repo, infra, and the extraction spike so Phase 1 is pure product work.

**Acceptance criteria:**

- [ ] Next.js 15 + TypeScript + Tailwind v4 repo scaffolded; CI runs lint + typecheck on every push
- [ ] Neon Postgres provisioned (dev + prod branches); Drizzle configured; `db:generate` / `db:migrate` work against dev
- [ ] Upstash Redis provisioned; BullMQ hello-world job round-trips app -> worker locally; a per-domain limiter group proven (two jobs to one domain space out; two domains run parallel)
- [ ] Worker boots from the same repo (`npm run worker`) and deploys to Railway/Fly as a separate service
- [ ] Extraction spike: 20 real product pages across 10 commerce platforms (Shopify, Woo, BigCommerce, Magento, custom) -- structured-data extraction succeeds on >= 15, selector fallback covers the rest; the results table checked into the repo as the fixture set
- [ ] Robots-awareness helper proven against real robots.txt files
- [ ] Stripe account + test-mode products for the three plans; webhook endpoint receiving test events via Stripe CLI
- [ ] Resend domain verified (SPF/DKIM); a Slack incoming-webhook post proven
- [ ] `.env.example` complete; secrets in envs, never in repo; Sentry wired into app and worker

## Phase 1 -- MVP (Weeks 1-4)

Goal: a design-partner brand tracks its real catalog, gets a real overnight alert, and starts the morning from the digest instead of a bookmarks folder.

- **Week 1: Tenant spine + catalog.** Auth (Auth.js) + brand workspace; own-SKU CRUD with CSV import (name, your price, cost floor, URL); Shopify read-only product sync; the positions screen skeleton with SKU rows.
- **Week 2: Tracking + the scrape loop.** Track-a-page flow with the extraction preview ("we read $84.99 -- correct?") and fix-the-read element picker; scrape_domains with per-domain limiters, jitter, robots awareness; schedule-checks + scrape-page workers with hash short-circuit, snapshot writes, and the warning/blocked failure ladder with honest status notes.
- **Week 3: Changes, alerts, positions.** detect-changes with noise + sanity filters; change_events with position before/after; alert rules (any-change, undercut, MAP floor, margin floor) routing to email + Slack; the position ladder and history chart per SKU; exposure-sorted positions list.
- **Week 4: Suggestions + digest + billing.** Suggestion rules (match lowest / median band / floor guard) with verbatim reasoning and accept/dismiss/stale lifecycle; the morning digest (including the quiet no-changes line); the overnight-reveal signature; Stripe Billing (three tiers by tracked SKUs, trial, limit prompts); webhook pipeline verify -> persist -> enqueue -> ack; empty/loading/error states to DESIGN.md at 390px.

**Acceptance criteria:**

- [ ] A new brand can import 30 SKUs, track 5 competitor pages through the extraction preview, and see correct positions within 20 minutes, unassisted
- [ ] Politeness proven by test: two pages on one domain never fetch closer than the domain's min interval; a blocked domain backs off entirely (`blocked_until`) and its pages show the red status note
- [ ] Hash short-circuit proven: an unchanged page produces no new snapshot row and no events on repeat checks
- [ ] A real price change on a tracked page produces exactly one change event, one Slack alert (old price, new price, your price, new position), and a recomputed suggestion -- and a replayed detect-changes run adds nothing (idempotency test)
- [ ] The sanity quarantine catches a 100x price misread (fixture test): no alert fires, the page flips to attention
- [ ] Suggestions never touch anything: the codebase contains no store write path (architectural review item); accepting a suggestion only marks it handled + audit-logs
- [ ] The morning digest sends at the brand's local hour with overnight changes, and sends the quiet line when nothing moved (silence distinguishable from breakage)
- [ ] The overnight reveal plays on first open with unseen changes, with the reduced-motion fallback per DESIGN.md
- [ ] Stripe: all three plans purchasable in test mode; tracking SKU 101 on Watch prompts an upgrade, never blocks silently; a replayed webhook event is a no-op (idempotency ledger test)
- [ ] 3-5 design-partner brands live for 2+ weeks; at least one real repricing decision made from a PriceProbe alert

## Phase 2 -- v1 Launch (Weeks 5-10)

Goal: public availability, first 80 paying brands, the digest habit proven.

- Marketing site per MARKETING_PLAYBOOK.md (enemy: the silent undercut; device: your price position while you slept; CTA verbatim: "Start free — 14 days")
- The free one-shot lead magnet: paste one URL -> extracted price + a 7-day watch by email (the product demonstrating itself)
- Comparison pages (vs Prisync, vs Price2Spy, vs the spreadsheet) + 8 SEO articles on tracking/audit keywords
- Shopify app-store listing (read-only sync as the hook)
- Selector-pack hardening from real-world breakage reports ("report a wrong price" loop feeding domain packs)
- Price-rule alerts and flagged-SKU hourly checks polished (Desk/Floor earners)
- Launch: r/ecommerce, eCommerceFuel, e-comm newsletters

**Acceptance criteria:**

- [ ] 80 paying brands; trial -> paid >= 25% for brands that received one real change alert during trial (the wedge metric -- measured per cohort)
- [ ] Self-serve funnel proven: 25+ brands reach a confirmed tracked page + Slack connection with zero human help
- [ ] Extraction health: >= 95% of active pages read successfully in any 24h window; median staleness < the plan's check interval
- [ ] The lead magnet converts >= 8% of visitors to emails; >= 15% of those start a trial
- [ ] Digest open/considered rate >= 50% weekly (the habit metric)
- [ ] Support load < 8 tickets/week per 80 customers; runbook for extraction fixes and Slack setup
- [ ] Zero repricing incidents (by construction) and zero scraping-conduct complaints escalating beyond a domain block -- tracked explicitly

## Phase 3 -- Growth (Months 4-12)

Goal: $20k+ MRR and the history moat compounding.

- Multi-brand workspaces + API export (Floor tier, the agency channel)
- Headless-browser pool for JS-only pages (the one cost cliff -- gated behind measured Floor-tier demand)
- Competitor discovery assist ("other sites selling this SKU") from search + structured data -- suggestions only, human-confirmed
- Promo intelligence: stock-gap opportunities surfaced proactively ("every rival is out -- pause the discount")
- Weekly position report PDF (the founder's Monday artifact) and margin-exposure summaries
- Google Shopping feed monitoring -- evaluated against demand, not assumed
- Annual-plan push; retention framing around irreplaceable price history

**Acceptance criteria:**

- [ ] $20k MRR; logo churn < 4%/month trailing 3 months (audited-quarterly pressure priced in and beaten)
- [ ] >= 20% of revenue on annual plans; >= 10 agencies on Floor with 2+ brand workspaces each
- [ ] History depth: median active brand has >= 6 months of continuous snapshots (the moat metric)
- [ ] Promo-intelligence surfaced opportunities acted on by >= 25% of Desk+ brands in a quarter
- [ ] The headless pool ships or is explicitly killed with documented evidence -- no zombie features
- [ ] A published case study: a real brand's margin decision made from PriceProbe data (with permission)
