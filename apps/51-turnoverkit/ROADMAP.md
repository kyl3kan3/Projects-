# TurnoverKit Roadmap

## Phase 0 -- Setup (Week 0, ~3-4 days)

Repo, infra, and the iCal spike so Phase 1 is pure product work.

**Acceptance criteria:**

- [ ] Next.js 15 + TypeScript + Tailwind v4 repo scaffolded; CI runs lint + typecheck on every push
- [ ] Neon Postgres provisioned (dev + prod branches); Drizzle configured; `db:generate` / `db:migrate` work against dev
- [ ] Upstash Redis provisioned; BullMQ hello-world job round-trips app -> worker locally
- [ ] Worker boots from the same repo (`npm run worker`) and deploys to Railway/Fly as a separate service
- [ ] iCal spike: a real Airbnb feed and a real VRBO feed parse into normalized stays; a moved booking produces a correct diff -- proving the data path before building on it
- [ ] Cloudflare R2 bucket created; client-compressed photo -> signed PUT -> signed GET round-trip proven from a phone browser
- [ ] Stripe account + test-mode products for the three plans; webhook endpoint receiving test events via Stripe CLI
- [ ] Resend domain verified (SPF/DKIM); Twilio account + number acquired; 10DLC registration *started* (weeks of lead time)
- [ ] Job-token scheme (jose) proven: mint, verify, expire, revoke
- [ ] `.env.example` complete; secrets in envs, never in repo; Sentry wired into app and worker

## Phase 1 -- MVP (Weeks 1-4)

Goal: a design-partner host runs real turnovers -- calendars syncing, cleaners working photo-gated checklists on their phones, the board answering "is every unit ready?" before check-in.

- **Week 1: Tenant spine + calendar intake.** Auth (Auth.js) + host workspace; units CRUD with access notes and check-in/out times; cleaners CRUD with SMS opt-in state; iCal feeds per unit; `sync-ical` worker on the 15-minute repeatable with hash short-circuit, stay upserts by `(feed_id, external_uid)`, and honest feed-age/error surfacing.
- **Week 2: Turnover engine.** `reflow-turnovers`: checkout-to-checkin gaps become turnovers with working windows; move-not-recreate on booking changes; default-cleaner assignment + per-turnover override; collision flags; job-token mint; `notify-cleaner` (SMS with email fallback, STOP honored, `notifications` ledger).
- **Week 3: The cleaner job page + photo gate.** `/clean/[token]`: room cards from the unit's checklist template, task ticks, client-side photo compression -> signed PUTs, the structural photo gate (no room done below its count), resume-on-reconnect, mid-clean issue filing (damage/lost item with photos), end-of-job stock counts, Finish -> the immutable turnover record.
- **Week 4: Host board + records + billing.** Today's board with unit tiles, status pills, and the tile-flip signature (webhook/completion driven); turnover record page with photo strip + PDF export; damage/lost-item log views; stock screens with par levels + `stock-digest`; Stripe Billing (three tiers, trial, unit-limit upgrade prompts); webhook pipeline verify -> persist -> enqueue -> ack; empty/loading/error states to DESIGN.md at 390px.

**Acceptance criteria:**

- [ ] A new host can add 3 units, paste iCal URLs, and see turnovers auto-scheduled with correct windows within 20 minutes, unassisted
- [ ] A moved Airbnb booking re-flows its turnover (same assignment, new window) and the cleaner gets one change notification -- proven against a live feed edit
- [ ] Double-fire test: running `sync-ical` twice on the same feed content creates zero duplicate stays or turnovers
- [ ] A cleaner on a phone can open the SMS link, complete a 5-room checklist with required photos, file a damage entry mid-clean, and finish -- with no account and no app install; a dropped connection resumes where they left off
- [ ] The photo gate is structural: a room cannot be completed below its photo count (test proves the server rejects it, not just the UI)
- [ ] Completing the last room flips the host's board tile through the four-beat signature (photo settles, count ticks, VERIFIED seal, tile crossfade), with the reduced-motion fallback per DESIGN.md
- [ ] A completed turnover record is immutable: annotations append; photos, times, and checklist state cannot be edited (test)
- [ ] A stock count at or below par sets `low_since` and lands in the next morning digest; a zero count alerts immediately
- [ ] Stripe: all three plans purchasable in test mode; adding unit 6 on Solo prompts an upgrade, never blocks silently; a replayed webhook event is a no-op (idempotency ledger test)
- [ ] 3-5 design-partner hosts complete 20+ real turnovers; at least one photo record settles a real "was it clean?" question

## Phase 2 -- v1 Launch (Weeks 5-10)

Goal: public availability, first 100 paying hosts, the turnover record proven as the wedge.

- Marketing site per MARKETING_PLAYBOOK.md (enemy: taking "it's done" on faith; device: the turnover photographed clean before the next guest lands; CTA verbatim: "Start free — 14 days")
- Lead magnets: printable room-by-room STR cleaning checklist, damage-claim evidence template -- both in the product's own format
- 8-10 SEO articles on host-operations keywords ("airbnb turnover schedule," "str cleaning checklist," "airbnb damage claim evidence")
- Comparison pages: vs Turno, vs Breezeway, vs the group text
- Cleaner performance history + guest-ready shareable PDF report (Host tier earners)
- Checklist template library per unit type; onboarding polish to the "6 stays found, 2 turnovers scheduled" first-run preview
- Launch: r/airbnb_hosts, STR Facebook groups, 2-3 host-podcast sponsorships

**Acceptance criteria:**

- [ ] 100 paying hosts; trial -> paid >= 25% for hosts who completed one photo-verified turnover during trial (the wedge metric -- measured per cohort)
- [ ] Self-serve funnel proven: 25+ hosts reach a completed verified turnover with zero human help
- [ ] Cleaner compliance: >= 85% of turnovers completed with all photo gates met (skipped-photo rate is the product's health metric)
- [ ] Lead magnets converting visitors to email signups at >= 5%
- [ ] Support load < 8 tickets/week per 100 customers; runbook for feed quirks (Airbnb lag, VRBO all-day events) and SMS delivery
- [ ] Zero data-loss incidents on photo evidence -- tracked explicitly, any occurrence is a stop-ship postmortem

## Phase 3 -- Growth (Months 4-12)

Goal: $20k+ MRR and the records moat compounding.

- Owner-client report exports + multi-property groups (Operator tier earners)
- Restock intelligence: burn rates per unit, auto par suggestions, shopping-list export
- Cleaner payout tracking (record what's owed per turnover; payments stay off-platform in v1 -- evaluated against demand before any money movement)
- PMS/channel-manager API integrations (Hostaway, Guesty) where iCal is the ceiling
- Inspection scoring: host spot-check flow rating completed turnovers; cleaner history deepens
- Seasonal pause plan (records stay readable; scheduling sleeps) to blunt off-season churn
- Annual-plan push timed to pre-season (Feb-Apr in most vacation markets)

**Acceptance criteria:**

- [ ] $20k MRR; logo churn < 3%/month trailing 3 months, including one off-season (the seasonality test)
- [ ] >= 25% of revenue on annual plans; >= 15% of accounts on Operator
- [ ] >= 30% of new hosts arrive via cleaner-led referral or host-community word of mouth (measured by attribution survey + referral codes)
- [ ] Restock suggestions accepted on >= 40% of low-stock events they fire on
- [ ] At least one PMS integration live with >= 50 hosts using it
- [ ] A published case study: a real host's damage claim won with a TurnoverKit record (with permission)
