# Deploying VaultBack

The portfolio targets **Vercel + Neon**; the root `DEPLOYING.md` covers what that
implies generally. This page is the VaultBack-specific part, and it exists mostly
to record three decisions that differ from `ARCHITECTURE.md` and why.

## The two shapes

VaultBack's background work — dump, encrypt, upload, drill, prune — is one
function, `runTick()` in `src/lib/tick.ts`. Two things call it:

**Serverless (default).** `/api/cron/tick`, protected by `CRON_SECRET`, bounded
by `CRON_TICK_BUDGET_MS` (50s by default, well inside Vercel's 300s cap). It
claims what is due, runs what fits, and leaves the rest queued in Postgres for
the next tick. Nothing to operate.

**Worker (optional).** `npm run worker` runs the same tick on a loop with no
duration ceiling, for databases whose dump does not finish inside a serverless
invocation. Deploy it on Railway or Fly with the same environment.

They are safe to run at the same time. Work is claimed with a conditional
`UPDATE ... WHERE next_run_at <= now()`, so whichever process gets there first
wins and the other sees nothing to do; the unique index on
`(policy_id, scheduled_for)` is the second guard.

**Cron frequency is a plan matter.** `vercel.json` asks for every 5 minutes,
which needs **Pro** — Hobby runs cron once per day and a more frequent schedule
fails at deploy time. Once a day is enough for daily backup policies and useless
for hourly ones. Any external scheduler that can hit the URL with the bearer
token works equally well.

## Three deliberate deviations from ARCHITECTURE.md

**1. No BullMQ, no Redis.** The queue is `backup_jobs` rows in Postgres. Job
state has to live there regardless, because the dashboard reads it — so adding
Redis would create a second source of truth for "is this job running", which is
exactly the inconsistency that makes a backup product lie to its customers.
Claiming is a conditional UPDATE, which Postgres does correctly under
concurrency. Redis becomes the right call if this ever needs cross-process rate
limiting or delayed retries with jitter; `bullmq` and `ioredis` stay declared in
`package.json` for that day, and nothing imports them today.

**2. Plain SQL dumps, not `pg_dump --format=custom`.** Custom format is a binary
archive only `pg_restore` can read. That would put a required binary on the
restore path — which Vercel does not have — and would stop VaultBack from
verifying a restore in process, which is the product's entire headline. Snapshots
are gzipped plain SQL inside a documented AES-256-GCM envelope, so a restore is a
statement executor and a customer with bucket access can recover without us. The
cost is no `pg_restore --list` and no parallel restore.

There are two dump engines behind one interface (`src/lib/dump.ts`):

| Engine | When | Notes |
|---|---|---|
| `pg_dump` | the binary exists and is at least as new as the source server | `--format=plain --inserts --rows-per-insert=500 --no-owner --no-privileges`, streamed from stdout |
| `vaultback-sql` | no `pg_dump`, or `pg_dump` older than the server | Pure TypeScript, reads the catalogs directly. Covers extensions, schemas, enums, domains, sequences, functions, tables, data, constraints, indexes, views, RLS policies and triggers |

The second engine is not a fallback so much as the serverless path: Vercel has no
Postgres client binaries, and pg_dump refuses to dump from a server newer than
itself, so a provider's Postgres upgrade would otherwise silently end a
customer's backups (`ARCHITECTURE.md` risk 2).

**3. `BACKUP_MASTER_KEY` instead of AWS KMS.** The envelope-encryption seam is
identical: a per-snapshot AES-256-GCM data key, wrapped, with only the wrapped
copy persisted. Moving to KMS replaces `generateDataKey` and `unwrapDataKey` in
`src/lib/crypto.ts` and nothing else.

## Storage

`storage_targets` rows are either `managed` (credentials from env) or BYO S3/R2
(credentials encrypted with `CREDENTIALS_KEY`). One S3-compatible client covers
both; R2 needs its endpoint and path-style addressing, which the driver sets when
an endpoint is present.

With no managed bucket configured, development writes to `LOCAL_STORAGE_DIR` —
gzipped and encrypted exactly as in production, only the transport differs. That
driver refuses to run when `VERCEL` is set, because a backup written to an
ephemeral filesystem is not a backup.

Uploads are multipart, 8 MB parts, written straight from the encrypt stream. A
failure aborts the upload so orphaned parts are not billed. Objects smaller than
one part take a single PUT.

## Restore drills need a Postgres server you own

`SCRATCH_POSTGRES_URL` must point at a server VaultBack controls, with rights to
`CREATE DATABASE` and `DROP DATABASE`. Each drill creates a database, restores
into it, verifies row counts, and drops it with `WITH (FORCE)` in a `finally`.
Never point this at a customer's database. Neon branches are the Phase 2 upgrade
for large snapshots (`ROADMAP.md`).

## Before pointing a domain at anything

- `npm run db:migrate` against the production database, from your machine.
- `AUTH_SECRET`, `BACKUP_MASTER_KEY` and `CREDENTIALS_KEY` generated per
  environment. Keep `BACKUP_MASTER_KEY` backed up outside the database.
- `CRON_SECRET` set, and `vercel crons ls` showing the schedule you expect.
- Stripe webhook pointed at `/api/webhooks/stripe` with its signing secret set.
- The managed bucket verified from the Settings → Storage screen, which writes
  and deletes a probe object rather than just listing.
- A smoke test: sign up, connect a database, wait for the checksum, then run a
  drill by hand and confirm it passes.

## The failure this product must never have

The scheduler silently stopping. VaultBack detects it from the inside — a slot
that passed more than 15 minutes ago raises `backup.missed`, emails the
organization's alert address once per missed slot, and advances to the next slot
rather than replaying a backlog into the customer's database. That covers a
crashed worker or a paused cron.

It cannot cover the whole app being down, because a dead app sends no alerts.
Point an external uptime monitor at a URL on this deployment, and keep
`RESEND_API_KEY` set in production — with no key, alerts are logged and nothing
leaves the building.
