# VaultBack

One-click automated backups, point-in-time snapshots, and verified restore testing for hosted Postgres (Supabase, Neon, PlanetScale, Railway) -- with encrypted offsite copies to your own S3/R2 bucket.

## The Problem

Managed Postgres providers ship backups as a checkbox feature, and the checkbox lies to you in three ways:

1. **Short retention.** Supabase Free keeps 0 days of backups; Pro keeps 7. Neon's default history retention is measured in hours-to-days depending on plan. Railway snapshots are best-effort. If you discover a bad migration or a data-deleting bug 10 days after it happened, the provider cannot help you.
2. **No offsite copy.** Your backups live inside the same provider account (and often the same region) as your database. If your account is suspended, compromised, or billing-locked, your backups vanish with your data. Provider outage means backup outage.
3. **No restore verification.** Nobody knows their backups work until the day they need them. A backup that has never been restored is a hypothesis, not a backup. Provider dashboards show a green checkmark; they do not show "we restored this dump into a scratch database last Tuesday and the row counts matched."

Indie devs and small teams know all of this. They also know the fix is a pg_dump cron job, an S3 bucket, encryption, retention pruning, alerting on silent failures, and periodic restore tests -- roughly a week of undifferentiated plumbing that then becomes an unowned liability. Most teams write half of it, or none of it, and hope.

VaultBack is that plumbing as a product: connect a database in one click, get scheduled encrypted dumps streamed offsite, and -- the part nobody builds themselves -- automated restore drills that prove the backups actually restore.

## Target User

- **Indie hackers and solo founders** running production Postgres on Supabase or Neon for a revenue-generating app. They cannot afford to lose customer data and cannot afford a DevOps hire.
- **Small startup teams (2-10 engineers)** on managed Postgres who have a "we should really set up proper backups" ticket that has been open for six months.
- **Agencies and freelancers** who operate many small client databases across several provider accounts and want one pane of glass plus a compliance artifact to hand clients.
- Secondary: teams pursuing SOC 2 or answering enterprise security questionnaires who need documented backup + restore-test evidence ("do you test your backups?" is a standard question; almost nobody can answer yes with proof).

Not the target: large enterprises with DBA teams, self-hosted Postgres shops with existing pgBackRest/WAL-G pipelines, or anyone needing continuous WAL archiving with sub-minute RPO (we are snapshot-based; hourly is our floor at launch).

## Market & Profitability

This is a validated micro-SaaS niche, not a venture-scale market, and the plan should say so honestly.

- **Realistic ceiling: $5k-$15k MRR.** Comparable single-purpose backup SaaS products (SimpleBackups, DBacked before it went quiet, various WordPress-era backup tools) plateau in this band. At a $25 blended ARPU, $10k MRR is ~400 paying customers -- achievable for a focused product in the Supabase/Neon ecosystem, which has hundreds of thousands of active projects.
- **Near-zero churn once installed.** Backups are an insurance product. The cost of switching or cancelling is "reintroduce the risk you just paid to eliminate," and the product touches nothing in the customer's request path, so there is no performance or migration pressure to leave. Expect monthly logo churn in the 1-2% range after the first invoice, far below typical SMB SaaS (5-7%). This makes small MRR numbers compound reliably.
- **It pays for itself in the customer's head.** One averted data-loss incident is worth years of subscription fees; customers do this math themselves, which keeps price sensitivity low at the $15-$49 range.
- **A market gap just opened.** Snaplet (the best-known DX tool in the Postgres snapshot space) sunset its product, orphaning users and search traffic. SimpleBackups is solid but broad (servers, sites, every database, every cloud) and priced for a wider buyer; DBacked is effectively unmaintained. Nobody owns "backups for the Supabase/Neon generation" right now.
- **Cost structure supports high margin.** Storage is the only COGS that scales with usage, compression is 5-10x on typical row data, and bring-your-own-bucket customers carry their own storage bill. Gross margins of 85%+ are realistic (see ARCHITECTURE.md cost table).

What this is **not**: a hypergrowth story. TAM is capped by the number of small teams on managed Postgres who both care and will pay. The bet is a durable, low-churn $5k-$15k MRR product run by one person, not a rocket.

## Monetization & Pricing

Monthly subscription via Stripe. Tiers gate database count and backup frequency -- the two axes that map cleanly to customer seriousness.

| | Hobby -- $15/mo | Startup -- $29/mo | Business -- $49/mo |
|---|---|---|---|
| Databases | 1 | 5 | Unlimited |
| Backup frequency | Daily | Hourly | Hourly |
| Retention | 30 days | 90 days | 1 year |
| Point-in-time snapshot browser | Yes | Yes | Yes |
| Offsite storage (our bucket) | Yes | Yes | Yes |
| Bring-your-own S3/R2 bucket | Yes | Yes | Yes |
| Envelope encryption (AES-256 + KMS) | Yes | Yes | Yes |
| Failure alerting (email) | Yes | Yes | Yes + Slack webhook |
| One-click restore to new database | Yes | Yes | Yes |
| Automated restore drills | -- | Monthly | Weekly |
| Compliance report (PDF, audit trail) | -- | -- | Yes |
| Team members | 1 | 3 | Unlimited |

Pricing logic:

- **$15 Hobby** is the "cheaper than the anxiety" tier for a single side-project-turned-real. It anchors against Supabase Pro's $25/mo: real backups cost less than the database plan.
- **$29 Startup** is the expected center of mass. Hourly frequency is the honest dividing line between "I'd be annoyed to lose a day" and "I'd lose customers if I lost an hour."
- **$49 Business** sells the two things only businesses ask for: proof (restore drills on a schedule, compliance PDF for security questionnaires) and unlimited scale for agencies. This tier costs almost nothing extra to serve and carries the margin.
- Annual billing at 2 months free from day one; insurance products suit annual commitment psychologically.

## MVP Feature List

- [ ] Email + GitHub OAuth sign-up (Auth.js), organization created on first login
- [ ] Connect a database via connection string with provider auto-detection (Supabase/Neon/PlanetScale/Railway/generic Postgres)
- [ ] Connection validation: reachability, permissions check, size estimate, TLS enforcement
- [ ] Backup policy editor: frequency (daily/hourly), retention window, schedule timezone
- [ ] Scheduler enqueuing backup jobs per policy (cron-style, drift-safe)
- [ ] Worker executing streaming pg_dump (custom format) piped to S3 multipart upload -- no local disk spool
- [ ] Envelope encryption: per-snapshot AES-256-GCM data key, wrapped by KMS master key
- [ ] Storage targets: VaultBack-managed bucket (default) and bring-your-own S3/R2 with credential validation
- [ ] Snapshot browser: list per database with timestamp, size, duration, integrity checksum
- [ ] One-click restore: restore a snapshot into a fresh database (customer-provided target connection string)
- [ ] Restore drills: scheduled restore into an ephemeral scratch Postgres, verify table counts + checksums, record pass/fail
- [ ] Failure alerting: email on backup failure, missed schedule, or drill failure (Resend)
- [ ] Stripe subscriptions: checkout, customer portal, webhook-driven plan enforcement (DB count + frequency limits)
- [ ] Dashboard home: per-database backup health at a glance (last success, next run, streak)
- [ ] Audit log of every backup, restore, drill, and settings change
- [ ] Compliance report v1: monthly PDF summarizing backup history and drill results per organization

Explicitly deferred past MVP: WAL-based continuous archiving, MySQL support, Slack alerts, multi-region storage replication, SSO.

## Differentiation

**1. Restore drills are the headline, not a footnote.** Every competitor sells "we take backups." We sell "your backups restored successfully last week, here is the evidence." Automated drills restore real snapshots into ephemeral databases and verify contents on a schedule. This reframes the category from backup tool to backup *assurance*, and it is genuinely hard to bolt on -- it requires the ephemeral-restore infrastructure to be a first-class citizen.

**2. Bring-your-own-bucket by default, on every tier.** Customers point VaultBack at their own S3 or R2 bucket and own their backups outright -- if VaultBack disappears tomorrow, their encrypted dumps are still sitting in their bucket with documented decryption instructions. This defuses the "why would I trust a small SaaS with my most critical data" objection that kills tools like this, and it inverts the vendor lock-in dynamic: we are easier to trust *because* we are easy to leave.

**3. The compliance report turns a cron job into a business document.** A monthly PDF -- backup success rate, retention adherence, drill results, encryption posture -- that a founder can attach to a SOC 2 evidence request or an enterprise security questionnaire. None of the competitors produce this. It also justifies the $49 tier almost by itself.

**4. Native to the new-stack providers.** SimpleBackups speaks "servers and cron jobs" to a sysadmin audience. We speak Supabase and Neon: provider auto-detection from the connection string, provider-specific docs, awareness of pooler vs. direct connections, and marketing that lives where these users live.

## Go-to-Market

Channel plan, most specific first:

1. **Supabase and Neon Discord/community presence.** Backup and retention questions come up weekly in both. Answer genuinely, maintain a free "Postgres backup checklist" resource, and be the person who wrote the definitive guide. These communities are small enough that a helpful recurring name gets known in a quarter.
2. **SEO comparison and problem pages.** Target high-intent, low-competition queries: "supabase backup retention", "supabase restore deleted data", "neon point in time recovery limits", "pg_dump to s3 cron", "snaplet alternative", "simplebackups vs". Each is a page with an honest answer plus VaultBack as the punchline. Snaplet's sunset traffic is claimable now.
3. **Show HN launch** framed around the engineering: "Show HN: I built automated restore testing for hosted Postgres" -- restore verification is a genuinely interesting technical angle that HN respects, and data-loss war stories dominate the comments of every backup thread, doing our marketing for us.
4. **r/Supabase, r/PostgreSQL, r/webdev** -- participate in every data-loss postmortem thread (there are many) with useful advice; product mention only where it fits.
5. **Integration marketplace listings.** Supabase integrations directory, Neon integrations page, Railway templates. These are permanent, high-intent placements that compound; being an early backup listing in young marketplaces is cheap positioning.
6. **Cold outreach to teams that just got burned.** People post their data-loss incidents publicly (Twitter/X, HN, Reddit) weekly. A genuinely sympathetic note with a free-tier offer converts at rates cold email never sees, because the pain is hours old. Distasteful if done badly; effective and even appreciated if done honestly.
7. **Content flywheel:** monthly "restore drill report" blog posts (aggregate, anonymized stats -- "37% of connected databases had never had a successful restore test before VaultBack") generate linkable data journalism in a space with no data.

## Competition

| Competitor | Pricing | Strengths | Weaknesses |
|---|---|---|---|
| SimpleBackups | ~$29-$290/mo, tiered | Mature, polished, broad coverage (servers, sites, MySQL/Postgres/Mongo, all clouds), BYO storage | Breadth dilutes focus; priced and positioned for sysadmins/agencies, not Supabase-era devs; no restore drills; entry tier expensive for one small DB |
| DBacked | Open-source + one-time/low-cost hosted | Developer-friendly, encryption baked in, simple | Effectively unmaintained; no restore verification; no provider awareness; trust issue for an insurance product with no active vendor |
| Snaplet | (sunset) | Owned the Postgres-snapshot developer mindshare; excellent DX | Shut down -- its users and search traffic are unowned; validates demand while removing the strongest brand |
| Provider built-in backups (Supabase/Neon/Railway) | Bundled in plan | Zero setup, integrated, trusted brand | Short retention, same-account blast radius, no offsite copy, no restore testing, weak or no export path; capabilities vary wildly by plan |
| DIY pg_dump + cron + S3 | ~$0 + engineer time | Free, fully controlled, no third party | Unowned once written; silent failure mode is the norm; no encryption/retention/verification unless built; costs a week now and a bad day later |

Positioning sentence: SimpleBackups is backups for people who manage servers; VaultBack is backup *assurance* for people who deliberately chose not to manage servers.

## Key Risks

1. **Providers ship better native backups.** Supabase or Neon could extend retention, add offsite export, or even add restore testing, compressing our value. Mitigation: offsite-to-YOUR-bucket and cross-provider coverage are structurally hard for a provider to match (they will not ship "export your data away from us" as a priority), and restore drills + compliance reporting sit above any single provider. This is the biggest risk and it is real; it caps the ceiling more than it threatens the floor.
2. **Provider API and connection-model changes.** Poolers (PgBouncer, Supavisor), IPv6 migrations, connection string format changes, or pg_dump version skew against provider Postgres versions can silently break backups -- the worst possible failure for this product. Mitigation: provider adapters isolated behind an interface, canary databases on every provider run through the real pipeline daily, and version-matrix testing of pg_dump against provider Postgres versions.
3. **Security breach blast radius.** We hold connection strings to hundreds of production databases; a compromise of VaultBack is a compromise of every customer. This is an existential, not operational, risk. Mitigation: envelope encryption with KMS for all snapshots, connection credentials encrypted at rest with a separate key, read-only backup roles documented and encouraged (enforced where providers allow), no plaintext credentials in logs or job payloads, and an honest SECURITY page. A breach ends the company; the architecture must assume it is being attacked.
4. **Single-founder ops burden of an insurance product.** Customers pay precisely so that failures are not silent -- which means the founder is the on-call rotation. A broken worker at 3 a.m. is a breach of the core promise. Mitigation: aggressive dead-man's-switch alerting (missed schedule pages the founder before the customer notices), idempotent retry-safe jobs, boring infrastructure choices, and honest status communication. Budget real emotional overhead for this; it is the tax on near-zero churn.
5. **Storage cost creep.** A few customers with 100 GB+ databases on hourly backups can invert unit economics on the managed-storage path. Mitigation: compression, retention enforcement, soft caps with overage pricing on managed storage, and nudging heavy users to BYO-bucket where they pay their own storage bill.

## Setup

You need Postgres and Node 20+. Nothing else is required to run the whole thing
locally: Stripe, Resend, GitHub OAuth and a real S3 bucket are all optional in
development, and the app says so on screen where a feature is unconfigured.

```bash
npm install
cp .env.example .env.local        # fill DATABASE_URL, AUTH_SECRET,
                                 # BACKUP_MASTER_KEY, CREDENTIALS_KEY, CRON_SECRET
npm run db:migrate               # creates the 13 tables
npm run dev                      # http://localhost:3006
```

Sign up, paste a Postgres connection string, and the first encrypted snapshot is
taken during the request. Backups after that are on a schedule, and schedules
need something to drive the tick:

```bash
# run one scheduler tick by hand (this is what Vercel Cron calls)
curl -H "Authorization: Bearer $CRON_SECRET" localhost:3006/api/cron/tick
```

In production that URL is a cron job; for databases too large to dump inside a
serverless function, run the same work as a long-lived process instead:

```bash
npm run worker                   # same tick, on a loop, no duration ceiling
```

Both shapes are safe to run together. See [DEPLOYING.md](./DEPLOYING.md).

A few things to know while developing:

- **With no S3 bucket configured**, snapshots are written under
  `.vaultback-storage` — still gzipped, still AES-256-GCM encrypted. That
  fallback refuses to run on Vercel.
- **Restore drills** create and drop a database on `SCRATCH_POSTGRES_URL`, which
  defaults to the server in `DATABASE_URL`. It must never point at a customer
  database.
- **Without `RESEND_API_KEY`** alert emails are logged rather than sent.
- **Without `STRIPE_SECRET_KEY`** the billing screen shows the plan ladder and
  hides the upgrade buttons.
- **Without GitHub OAuth credentials** the "Continue with GitHub" button is
  hidden and the OAuth routes return 404.
- `pg_dump` is used when it is installed and new enough for the source server;
  otherwise the built-in TypeScript dump engine runs. Force either with
  `VAULTBACK_DUMP_ENGINE=pg_dump|js`.

### Checks and tests

```bash
npm run typecheck    # tsc --noEmit
npm test             # unit tests (node:test via tsx, no extra dependencies)
npm run build        # production build
```

## Repository Layout

One package: the Next.js app, the cron route, and the worker share a single
`src/` tree. `ARCHITECTURE.md` has the data model and cost model; `DEPLOYING.md`
records where the build deliberately departs from it and why.

```
src/
  app/          Next.js App Router — marketing page, dashboard, API routes
    (app)/      signed-in screens: vault, restore, drills, settings
    (auth)/     sign up, sign in
    api/        cron tick, Stripe webhook, GitHub OAuth, compliance PDF
  db/           Drizzle schema + client (control-plane metadata only)
  lib/          domain logic:
                  dump.ts          two dump engines behind one interface
                  crypto.ts        envelope encryption + streaming AES-256-GCM
                  sqlsplit.ts      statement splitter the restore path depends on
                  restore-engine.ts apply + verify, shared by restores and drills
                  drills.ts        the headline feature
                  scheduler.ts     claim what is due, alert on what was missed
                  tick.ts          one unit of background work
  worker/       long-lived process that runs the same tick on a loop
  components/   UI, including the checksum-lock signature detail
```

Status: MVP implemented. Every item in the feature list above is built. What has
and has not been verified against real infrastructure is recorded honestly in the
build report rather than claimed here.
