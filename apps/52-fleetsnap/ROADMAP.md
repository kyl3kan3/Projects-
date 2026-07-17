# FleetSnap Roadmap

## Phase 0 -- Setup (Week 0, ~3-4 days)

Repo, infra, and the offline spike so Phase 1 is pure product work.

**Acceptance criteria:**

- [ ] Next.js 15 + TypeScript + Tailwind v4 repo scaffolded; CI runs lint + typecheck on every push
- [ ] Neon Postgres provisioned (dev + prod branches); Drizzle configured; `db:generate` / `db:migrate` work against dev
- [ ] Upstash Redis provisioned; BullMQ hello-world job round-trips app -> worker locally
- [ ] Worker boots from the same repo (`npm run worker`) and deploys to Railway/Fly as a separate service
- [ ] PWA spike: manifest + service worker installed to a phone home screen; an IndexedDB inspection draft survives airplane mode and syncs on reconnect -- proving the offline path before building on it
- [ ] Cloudflare R2 bucket created; client-compressed photo -> signed PUT -> signed GET round-trip proven from a phone browser
- [ ] Stripe account + test-mode products for the three plans; webhook endpoint receiving test events via Stripe CLI
- [ ] Resend domain verified (SPF/DKIM); Twilio account + number acquired; 10DLC registration *started* (weeks of lead time)
- [ ] Driver-token scheme (jose) proven: mint, verify, revoke
- [ ] FMCSA DVIR format reviewed against 49 CFR 396.11; the default template's item list and attestation/certification lines drafted
- [ ] `.env.example` complete; secrets in envs, never in repo; Sentry wired into app and worker

## Phase 1 -- MVP (Weeks 1-4)

Goal: a design-partner fleet runs real pre-trips -- drivers tapping 90-second walkarounds, defects opening tickets before trucks leave the yard, the audit answered by PDF.

- **Week 1: Tenant spine + assets.** Auth (Auth.js) + fleet workspace; vehicles CRUD (unit, VIN, plate, class, photo, CSV import); drivers CRUD with SMS opt-in + tokenized links; inspection templates with the FMCSA default per class; fleet board skeleton.
- **Week 2: The driver flow.** `/drive/[token]` PWA: vehicle confirm, item groups one screen at a time, pass/fail/NA segments, photo-on-fail (client compression -> signed PUTs), odometer with sanity check, signature, the stopwatch; IndexedDB drafts with background sync and the SYNC PENDING state; submission writing inspections + items transactionally.
- **Week 3: Defects, tickets, and history.** `process-inspection`: failed items -> defects, critical -> OUT OF SERVICE + immediate office alert, auto-opened work orders with photos; ticket queue (triage, vendor note, cost, resolve-with-certification returning the loop to the defect and vehicle); service entries timeline; odometer-based reminders with the nightly recompute and reminder -> work order conversion.
- **Week 4: Exports + billing + polish.** `render-dvir-pdf` (FMCSA format, per vehicle or fleet, date range, reproducible); weekly digest email; Stripe Billing (three flat tiers, trial, vehicle-limit upgrade prompts); webhook pipeline verify -> persist -> enqueue -> ack; the stamp-at-1:28 signature; empty/loading/error states to DESIGN.md at 390px.

**Acceptance criteria:**

- [ ] A new fleet can add 10 vehicles, text a driver link, and receive its first submitted inspection within 20 minutes, unassisted
- [ ] Median driver inspection time <= 2 minutes across design-partner fleets, measured by `duration_seconds` (the product's honesty metric); a clean walkaround is achievable in 90 seconds
- [ ] A failed brake item flips the vehicle OUT OF SERVICE, alerts the office by SMS+email, and opens a ticket carrying the photo -- all before the driver's next screen (test proves the chain)
- [ ] The photo requirement on failed items is structural: a fail cannot submit without its photo (server rejects, not just UI)
- [ ] Airplane-mode test: a full inspection drafted offline syncs exactly once on reconnect -- no loss, no duplicate (idempotent by draft id)
- [ ] An odometer entry a digit short of the last reading is caught inline with the sanity check; the corrected value updates `vehicles.current_odometer`
- [ ] A reminder rule ("oil every 5,000 mi") flips to due at the right odometer from inspection entries alone, converts to a work order in one tap, and resets its baseline on resolution (closed-loop test)
- [ ] A date-range DVIR export renders the FMCSA fields -- vehicle, driver, date, items, defects, signature, certification line -- and re-renders byte-identically for the same range
- [ ] Returning an OOS vehicle to service requires the hold-to-confirm certification and lands in the audit log
- [ ] Stripe: all three plans purchasable in test mode; adding vehicle 16 on Crew prompts an upgrade, never blocks silently; a replayed webhook event is a no-op (idempotency ledger test)
- [ ] 3-5 design-partner fleets complete 100+ real inspections; at least one defect-to-repair loop closes end to end

## Phase 2 -- v1 Launch (Weeks 5-10)

Goal: public availability, first 60 paying fleets, the defect-to-ticket loop proven as the wedge.

- Marketing site per MARKETING_PLAYBOOK.md (enemy: the clipboard; device: the pre-trip that takes 90 seconds, not a clipboard; CTA verbatim: "Start free — 14 days")
- Lead magnets: printable FMCSA-format inspection form, fleet maintenance log template -- both in the product's own format
- 8-10 SEO articles on compliance/breakdown keywords ("DVIR app," "pre trip inspection checklist," "DOT audit checklist for small fleets")
- Comparison pages: vs Fleetio, vs Whip Around, vs the clipboard
- Custom templates per vehicle class, work-order assignment, cost tracking, scheduled compliance emails (Fleet tier earners)
- Insurance-agent referral kit (the compliance PDF is the pitch)
- Launch: landscaping/contractor communities, trade Facebook groups, 2-3 trade-podcast sponsorships

**Acceptance criteria:**

- [ ] 60 paying fleets; trial -> paid >= 25% for fleets that completed 10+ inspections during trial (the wedge metric -- measured per cohort)
- [ ] Self-serve funnel proven: 20+ fleets reach a closed defect-to-repair loop with zero human help
- [ ] Driver compliance: >= 80% of active vehicles inspected on scheduled days across cohorts (pencil-whip rate tracked via duration outliers)
- [ ] Lead magnets converting visitors to email signups at >= 5%
- [ ] >= 5 customers attributable to insurance-agent referrals
- [ ] Support load < 8 tickets/week per 60 customers; runbook for offline sync, SMS delivery, and template questions

## Phase 3 -- Growth (Months 4-12)

Goal: $25k+ MRR and the records moat compounding.

- Multi-yard grouping + CSV/API export (Depot tier earners)
- Cost analytics: cost per vehicle per mile, repair vs replace signals from service history
- Telematics odometer feeds (Samsara/Geotab APIs) where inspections undercount miles -- integration, not hardware
- Parts/vendor light touch: preferred shops per fleet, ticket handoff by email with photo links
- Driver performance view (inspection streaks, defect catch rate) framed as recognition, not surveillance
- Annual-plan push timed to insurance renewal season; retention framing (cancelling keeps records readable for 12 months)

**Acceptance criteria:**

- [ ] $25k MRR; logo churn < 2.5%/month trailing 3 months (records stickiness proven)
- [ ] >= 25% of revenue on annual plans; >= 15% of accounts on Fleet+ tiers
- [ ] Cost-per-vehicle analytics used by >= 30% of active fleets in a month
- [ ] At least one telematics integration live with >= 25 fleets using it
- [ ] A published case study: a real fleet's DOT audit or insurance claim answered with FleetSnap records (with permission)
- [ ] Organic search delivers >= 30% of new trials
