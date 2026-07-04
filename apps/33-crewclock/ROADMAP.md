# CrewClock Roadmap

## Phase 0 — Setup (Week 0, ~3-5 days)

Repo, infra, and accounts so Phase 1 is pure product work.

**Acceptance criteria:**

- [ ] Next.js 15 + TypeScript + Tailwind v4 repo scaffolded; CI runs lint + typecheck on every push
- [ ] PWA baseline: web app manifest, service worker registered, installable to a phone home screen with the correct icon and name
- [ ] Neon Postgres provisioned (dev + prod branches); Drizzle configured; `db:generate` / `db:migrate` scripts work against dev
- [ ] Upstash Redis provisioned; BullMQ hello-world job round-trips from app to worker locally
- [ ] Worker process boots from the same repo (`npm run worker`) and deploys to Railway/Fly as a separate service
- [ ] Stripe account in test mode; per-seat prices for Crew ($8) and Company ($12) plans created; webhook endpoint receiving test events via Stripe CLI
- [ ] Resend account + dev sending domain verified (SPF/DKIM); Twilio account + test number acquired; 10DLC registration *started* (it takes weeks — begin now)
- [ ] **ES translation workflow decided and set up:** dictionary files (`en.ts` / `es.ts`) in-repo, every string keyed and typed; a native Spanish speaker (contractor or advisor) contracted to review every crew-facing string before launch — machine translation is a draft, never the shipped copy
- [ ] `.env.example` complete; secrets in Vercel/Railway envs, never in repo
- [ ] Sentry wired into app and worker

## Phase 1 — MVP (Weeks 1-8)

Goal: a design-partner sub can invite their crew, run a full pay period on CrewClock, and hand their bookkeeper a working Gusto or ADP CSV.

- **Week 1: Auth + org + crew invites.** Auth.js magic links for owner/office; org model; crew invite codes + QR; crew PIN claim flow (in both locales from day one); roles and session scoping.
- **Week 2: Time engine + offline queue.** `time_entries` lifecycle; `client_event_id` dedupe; IndexedDB outbox + background sync; forgotten-clock-out auto-flagging; the crew clock screen with the hero readout.
- **Week 3: Geofencing + accuracy handling.** Job sites with lat/lng/radius; haversine evaluation with accuracy widening; inside/outside/unavailable states in UI and data; the geofence ring signature animation; honest state copy in EN/ES.
- **Week 4: Jobs, bids + live costing.** Jobs CRUD; bid labor hours/dollars entry; cost rollup job; the 4px cost bar; job detail with projection line.
- **Week 5: OT alerts.** Daily overtime-scan cron per org timezone; weekly projection; email alerts via Resend; SMS behind a per-org flag; 80%/100% budget alerts on jobs.
- **Week 6: Review/approve + audit.** Pay-period review screen; flagged-entry surfacing; edit sheet with required reason; `time_entry_edits` audit trail; approval locking.
- **Week 7: Payroll CSV, ADP + Gusto.** Regular/OT computation per worker rule in site timezone; export worker job; golden-file tests for both formats; pre-export validator; download + email delivery.
- **Week 8: Billing + hardening.** Stripe per-seat subscriptions with the $49 floor; seat sync on invite/deactivate; trial logic; dead-letter queue review; load test with synthetic punch traffic; both-locale layout audit at 390px.

**Acceptance criteria:**

- [ ] A new org can sign up, add a job site, invite a crew member by QR, and record a geofence-verified punch within 15 minutes, unassisted
- [ ] Clock events queued offline for 8 hours sync without loss or duplication (airplane-mode test: punch in/out offline, restore signal, verify exactly one entry with correct timestamps)
- [ ] The same punch synced twice (simulated retry) produces exactly one `time_entries` row
- [ ] Punches outside the fence and punches with no GPS are recorded, honestly labeled, and surfaced as review flags — never blocked, never shown as verified
- [ ] Every crew-facing screen renders 100% translated in ES with no clipped layouts at 390px (verified by a native-speaker review pass, not machine spot checks)
- [ ] A mid-week projected-OT scenario (31h by Wednesday) produces exactly one owner alert for that worker/week, before the threshold is crossed
- [ ] A job crossing 80% of its bid fires one budget alert; crossing 100% fires one more; re-running rollups fires neither again
- [ ] Editing a time entry requires a reason and produces an immutable `time_entry_edits` row showing old and new values
- [ ] A generated Gusto CSV imports into a Gusto sandbox without column errors; a generated ADP CSV matches the ADP import template golden file byte-for-byte
- [ ] CrewClock's own checkout works for both plans; an org with 4 seats on Crew is invoiced $49 (floor), an org with 10 seats is invoiced $80
- [ ] `prefers-reduced-motion` collapses the ring and all fills to instant states with text equivalents
- [ ] 3-5 design partners (real crews, live payroll) complete 2+ full pay periods with zero export corrections

## Phase 2 — Launch (Weeks 9-14)

Goal: public availability, first 20 paying companies, the bilingual channel proven.

- Marketing site per MARKETING_PLAYBOOK.md: the hours-paid vs hours-on-site gap as the device, the ring drawing in the hero, honest design-partner receipts
- Full ES marketing site and ES onboarding materials (videos, one-pagers for the foreman to hand out)
- Comparison pages (vs QuickBooks Time, vs ClockShark, vs busybusy, vs paper) in EN and ES
- Gusto partner directory listing submitted; bookkeeper referral program (20% recurring) live
- Off-season pause plan shipped (the seasonal-churn answer)
- Launch: Spanish-language contractor Facebook groups, trade-supplier counter cards in two metros, r/Construction and landscaping-owner communities with real recovered-minutes numbers

**Acceptance criteria:**

- [ ] 20 paying companies; at least 5 acquired through Spanish-language channels
- [ ] Self-serve funnel proven: at least 10 orgs reached their first payroll export with zero human help
- [ ] ES onboarding materials shipped and used: at least 10 crew members onboarded entirely in Spanish
- [ ] Aggregate across customers: >90% of punches geofence-verified `inside`; support tickets < 5/week per 20 customers
- [ ] Trial-to-paid conversion >= 40% for orgs that complete one payroll export during trial (the export is the close — measure it)
- [ ] Comparison pages indexed and ranking for at least 3 "alternative/vs" queries; the ES timesheet-app page ranking for its head term
- [ ] Zero payroll incidents: no customer-reported export error that reached a worker's paycheck

## Phase 3 — Growth (Months 4-12)

Goal: $25k+ MRR, retention proof, and the integrations that justify Company-tier pricing.

- QuickBooks Time-style API sync: QuickBooks Online first, then Gusto API push (replace the CSV with a button), ADP Marketplace evaluation
- Scheduling lite: assign crews to jobs by day; feeds better OT projection
- Native wrapper (Capacitor) if PWA install friction shows up in onboarding data — decision from metrics, not fashion
- Per-task cost codes within jobs (the upsell for concrete/electrical subs)
- Partner channel scale-up: 20+ active bookkeeper referrers, payroll-provider co-marketing
- Quarterly "State of the Crew Hour" report from anonymized aggregate data (the PR flywheel)

**Acceptance criteria:**

- [ ] $25k MRR; logo churn < 3%/month trailing 3 months (excluding paused seasonal accounts, reported separately)
- [ ] Net revenue retention >= 105% (seat expansion + Crew->Company upgrades outrunning churn)
- [ ] >= 30% of customers on the Company plan; upgrade prompt conversion measured and > 10%
- [ ] Gusto API push live for >= 25 customers; CSV support remains for the rest
- [ ] Seasonal pause: >= 60% of paused accounts reactivate within 4 months
- [ ] At least 10 active referral partners who have each sent >= 2 paying customers
- [ ] Organic search delivers >= 25% of new trials, with the ES pages contributing a measured share
