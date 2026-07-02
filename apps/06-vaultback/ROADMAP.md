# VaultBack Roadmap

Solo-founder pacing. Weeks are focused build weeks, not calendar hope. MVP scope is deliberately narrow: Supabase + Neon first (they are the community beachhead), Railway and generic Postgres ride along cheaply, PlanetScale Postgres validated before launch.

## Phase 0 -- Setup (Week 0)

Scope: repo, infrastructure accounts, walking skeleton. No product features.

- Repo scaffolding: Next.js 15 + TypeScript + Tailwind v4 + Drizzle wired to a dev Postgres; worker and scheduler entrypoints boot and log
- Environments: Vercel project (web), Railway project (worker + scheduler + Postgres + Redis), R2 bucket, KMS key created; all env vars from `.env.example` resolvable in dev and prod
- Auth.js with GitHub OAuth works end to end (sign in, session, org auto-created)
- Drizzle migrations run in CI-less fashion via `db:migrate` script; schema for users/orgs/subscriptions exists
- BullMQ round trip proven: scheduler enqueues a heartbeat job every minute, worker consumes it, row lands in Postgres

Acceptance criteria:

- [ ] Fresh clone + `.env` + documented commands = running dashboard, worker, and scheduler locally
- [ ] Sign in with GitHub, land on an empty dashboard tied to an auto-created organization
- [ ] Heartbeat job visibly flows scheduler -> Redis -> worker -> Postgres in production infrastructure
- [ ] KMS GenerateDataKey/Decrypt round trip succeeds from the worker in production

## Phase 1 -- MVP (Weeks 1-6)

Scope: the full backup loop with encryption, restore, drills v1, and billing. Feature list = README "MVP Feature List".

Week-by-week:

- **Week 1 -- Connections.** Connect-a-database flow: connection string input, provider detection, worker-side validation job, encrypted credential storage, connection health UI. Read-only role docs for Supabase/Neon.
- **Week 2 -- Backup pipeline.** Streaming pg_dump -> gzip -> AES-256-GCM -> R2 multipart in the worker; envelope encryption with KMS; snapshots table; manual "back up now" button end to end.
- **Week 3 -- Scheduling + policies.** Policy editor (frequency, retention, timezone), scheduler enqueue loop with Redis locks, missed-schedule watchdog, retention pruning job, failure emails via Resend.
- **Week 4 -- Restore + snapshot browser.** Snapshot timeline UI, one-click restore into a user-provided empty database with progress, refuse-to-overwrite safety checks, audit log for all restore actions.
- **Week 5 -- Restore drills v1 + billing.** Scheduled drill job: restore latest snapshot into ephemeral scratch DB, table/rowcount verification, pass/fail history and dashboard badge. Stripe checkout, customer portal, webhook-driven plan enforcement (DB count + frequency).
- **Week 6 -- BYO bucket + hardening.** Bring-your-own S3/R2 target with credential verification; canary databases on Supabase/Neon/Railway exercised daily through the real pipeline; load test with a 20 GB+ database; failure-mode sweep (kill worker mid-upload, revoke DB credentials, expire bucket credentials) with correct alerts for each.

Acceptance criteria:

- [ ] A stranger can sign up, connect a Supabase database, and have a verified encrypted snapshot in offsite storage within 10 minutes without help
- [ ] Hourly and daily schedules fire within 60s of their slot for 7 consecutive days on canary databases; zero silent misses (every miss alerts)
- [ ] A snapshot of a 20 GB database backs up and restores successfully with constant worker memory (no disk spool)
- [ ] Restore drill runs green on all canary providers and a deliberately corrupted snapshot fails the drill loudly
- [ ] All three Stripe plans purchasable; downgrades enforce DB-count limits; webhook replay is idempotent
- [ ] Every snapshot object in storage is AES-256-GCM encrypted; plaintext data keys never persist; credentials never appear in logs (verified by log audit)
- [ ] Audit log captures every backup, restore, drill, and settings change with actor attribution

## Phase 2 -- Launch (Weeks 7-9)

Scope: go public, get the first 25 paying customers, survive contact with real databases.

- Marketing site: landing page with the restore-drill pitch, pricing page, docs (per-provider connection guides, security page describing the encryption model, "how to leave" data-export page)
- Compliance report v1: monthly PDF per org (backup success rate, retention adherence, drill evidence)
- SEO pages live: "supabase backup retention", "neon point-in-time recovery limits", "snaplet alternative", "pg_dump to s3" (4 pages minimum, honest content)
- Show HN launch + Supabase/Neon community presence per README go-to-market
- Marketplace submissions: Supabase integrations directory, Neon integrations, Railway template
- Operational readiness: status page, on-call alerting to founder phone for watchdog events, runbook for the top 5 failure modes

Acceptance criteria:

- [ ] 25 paying customers (any tier) and 60+ databases under management
- [ ] Show HN posted; at least one provider marketplace listing accepted
- [ ] 30 consecutive days with zero missed-and-unalerted backups across all customers
- [ ] First compliance PDFs generated and sent to Business-tier customers
- [ ] Median time from signup to first successful backup under 10 minutes (measured, not vibes)
- [ ] Support load sustainable: under 5 tickets/week, every data-affecting incident gets a public postmortem

## Phase 3 -- Growth (Months 3-9)

Scope: compound toward the $5k-$15k MRR band by widening the moat, not the surface area.

- Restore drills v2: Neon-branch-based scratch targets for large snapshots; schema-diff verification; per-table checksum sampling; customer-visible drill report pages (shareable, for security questionnaires)
- Slack + webhook alerting (Business tier)
- Tiered snapshot retention (keep hourly for 7 days, daily for 90, weekly for a year) to hold storage costs while extending retention headline
- PlanetScale Postgres and generic-Postgres polish; pg_dump version matrix automation as providers upgrade
- Annual billing push + BYO-bucket nudges for heavy-storage customers
- Content flywheel: monthly anonymized "state of Postgres backups" stats post; comparison pages vs. SimpleBackups and provider-native backups
- Evaluate (build only if pulled by paying customers): WAL-based continuous archiving for sub-hourly RPO, MySQL support, team SSO

Acceptance criteria:

- [ ] $5k MRR with monthly logo churn at or below 2%
- [ ] 90%+ of active databases have at least one passed restore drill in the trailing 30 days
- [ ] Managed-storage COGS under 10% of MRR (tiered retention + BYO adoption working)
- [ ] At least 3 organic signups/week attributable to SEO or marketplace listings
- [ ] Founder ops load: fewer than 2 pages/month outside working hours over a full quarter
- [ ] Documented decision (build / kill / defer) on WAL archiving and MySQL, based on customer pull, not roadmap momentum
