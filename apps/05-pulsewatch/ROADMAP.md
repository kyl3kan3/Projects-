# PulseWatch — Roadmap

## Phase 0 — Setup (Week 0)

Goal: repo, infra accounts, and deploy pipeline exist before feature work starts.

- [ ] Next.js 15 + TypeScript + Tailwind 4 app boots locally (`npm run dev`)
- [ ] Drizzle configured; `db:generate` and `db:migrate` run against a local Postgres and a Neon branch
- [ ] Upstash Redis provisioned; BullMQ smoke test (enqueue + consume one job) passes
- [ ] Fly.io app created; hello-world probe image deploys to one region and connects to Redis
- [ ] Stripe test-mode account with Free/Solo/Team products and prices created
- [ ] Resend account + domain (pulsewatch.dev) verified for sending
- [ ] `.env.example` complete; CI runs lint + typecheck on every push
- [ ] Vercel project connected; preview deploys on PRs

## Phase 1 — MVP (Weeks 1–6)

### Week 1 — Auth, teams, monitor CRUD
- [ ] Email/password + GitHub OAuth sign-in; session handling
- [ ] Team auto-created on signup; plan defaults to Free
- [ ] Monitor create/edit/pause/delete UI for `http` and `heartbeat` types
- [ ] Plan limits enforced at creation time (3 monitors on Free)

### Week 2 — Scheduler + HTTP probe pipeline
- [ ] Scheduler enqueues due HTTP checks onto per-region queues at correct intervals (5-min Free, 1-min paid)
- [ ] Probe worker executes HTTP checks (status code, latency, keyword, timeout) and returns typed results
- [ ] Results persisted to `check_results`; monitor status column updates
- [ ] End-to-end: creating a monitor against a test endpoint produces results within one interval

### Week 3 — Incidents + alerting
- [ ] Incident opens after failure threshold met; auto-resolves on recovery
- [ ] Alert channels CRUD: email, Slack webhook, Discord webhook, generic webhook (with verification ping)
- [ ] Alert dispatcher sends down + recovery notifications with retries; `notifications` audit rows written
- [ ] Duplicate-alert suppression: one down alert per incident per channel

### Week 4 — Cron heartbeats
- [ ] Heartbeat monitor type with generated ping token; ingest route handles GET/POST and `/fail`
- [ ] Missed-ping sweep opens incidents after interval + grace elapses; ping auto-resolves
- [ ] Copy-paste snippets in UI (curl, GitHub Actions step, crontab line)
- [ ] Ingest rate limiting per token

### Week 5 — SSL/domain expiry + status pages
- [ ] Daily TLS scan records cert expiry; alerts at 30/14/7/1 days, each threshold once
- [ ] WHOIS-based domain expiry monitoring with same thresholds
- [ ] Public status page: slug, monitor selection, 90-day uptime bars, incident history; SSR + 30s cache
- [ ] Manual incident posting with public updates

### Week 6 — Billing + polish
- [ ] Stripe Checkout upgrade flow for Solo/Team; Billing portal for cancel/card changes
- [ ] Webhook handler syncs subscription state; downgrade enforces monitor limits gracefully (pause overflow, never delete)
- [ ] Dashboard overview: current status, recent incidents, latency sparkline per monitor
- [ ] Onboarding: first monitor + first alert channel in under 60 seconds

**Phase 1 exit criteria:** a stranger can sign up, add an HTTP monitor and a cron heartbeat, receive a Slack alert for a real outage and a missed cron, publish a status page, and pay for Solo — with zero founder intervention.

## Phase 2 — Launch (Weeks 7–9)

- [ ] PulseWatch monitors itself from an independent external service; probe fleet health alarms exist
- [ ] Load test: 10k monitors' worth of synthetic checks sustained without queue lag
- [ ] Abuse controls: signup rate limits, ping-ingest throttling, status-page content sanitization
- [ ] Marketing site: homepage, pricing, docs (heartbeat setup guides for cron/GitHub Actions/Kubernetes)
- [ ] SEO comparison pages live: UptimeRobot alternative, BetterStack alternative, Cronitor alternative, "cron job monitoring"
- [ ] Free public SSL-checker tool live and indexed
- [ ] Show HN post + Product Hunt launch executed; feedback triaged into backlog
- [ ] Analytics: signup -> first monitor -> first alert -> paid funnel instrumented
- [ ] Status page "monitored by PulseWatch" badge/footer on free tier

**Phase 2 exit criteria:** launched publicly; >= 200 signups; >= 5 paying customers; zero missed-outage reports; funnel data flowing.

## Phase 3 — Growth (Months 3–6)

- [ ] Multi-region check confirmation GA (3 regions, quorum-based alerting) on paid plans
- [ ] SMS alerts via Twilio with per-plan credit metering (Team: 100/mo)
- [ ] TCP port checks and ICMP ping monitor types
- [ ] Public REST API (API keys, monitor CRUD, results read) + docs
- [ ] Embeddable uptime badges (SVG) and status widgets
- [ ] Status page custom domains with automated TLS (Team tier)
- [ ] Team invites, roles, and audit log
- [ ] Maintenance windows (suppress alerts, annotate status pages)
- [ ] Check-result rollups + retention pruning keeping DB growth linear-in-monitors, not linear-in-checks
- [ ] Weekly uptime digest email (re-engagement for a set-and-forget product)

**Phase 3 exit criteria:** $2k+ MRR, monthly churn < 3%, infra cost < 10% of MRR, support load < 5 hrs/week.
