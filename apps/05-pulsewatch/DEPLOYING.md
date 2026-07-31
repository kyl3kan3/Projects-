# Deploying PulseWatch

Two supported shapes. The domain logic is identical in both — which one you get
is decided by whether `REDIS_URL` is set, so you can start with the first and
grow into the second without a rewrite.

| | **Vercel + Neon** | **Vercel + Neon + Fly + Upstash** |
|---|---|---|
| Always-on processes | none | scheduler + 3 probes |
| Redis | not needed | Upstash |
| Check regions | 1 | 3, with quorum before alerting |
| Extra cost over Vercel + Neon | $0 | ~$10–20/mo |
| Requires | **Vercel Pro** | Vercel Pro |

The second is what `ARCHITECTURE.md` specifies and what the pricing table's
"3 regions" row promises. **See the honest caveat at the bottom before shipping
the first one as-is.**

---

## Shape 1 — Vercel + Neon (no Redis, no workers)

One cron-triggered function does everything the three worker processes do: run
due checks inline, sweep heartbeats, and send alerts. See
`src/app/api/cron/tick/route.ts`.

### 1. Neon

Create a project at [neon.tech], then copy the **pooled** connection string —
the host with `-pooler` in it. The app sets `prepare: false`, which the pooled
endpoint requires (PgBouncer in transaction mode cannot carry prepared
statements between connections), and holds a single connection per function
instance so warm instances can't exhaust your connection ceiling.

```bash
DATABASE_URL='postgres://user:pass@ep-xxx-pooler.region.aws.neon.tech/pulsewatch?sslmode=require'
```

Run the migration once from your machine, against the same database:

```bash
npm run db:migrate
```

### 2. Vercel

```bash
vercel link
vercel env add DATABASE_URL production          # the pooled Neon string
vercel env add AUTH_SECRET production           # openssl rand -hex 32
vercel env add CRON_SECRET production           # openssl rand -hex 32
vercel env add NEXT_PUBLIC_APP_URL production   # https://your-domain
vercel env add STRIPE_SECRET_KEY production
vercel env add STRIPE_WEBHOOK_SECRET production
vercel env add STRIPE_PRICE_SOLO production
vercel env add STRIPE_PRICE_TEAM production
vercel env add RESEND_API_KEY production
vercel deploy --prod
```

`vercel.json` already registers the cron:

```json
{ "crons": [{ "path": "/api/cron/tick", "schedule": "* * * * *" }] }
```

Cron jobs only become active on **production** deployments, so the `--prod` flag
matters. Because `CRON_SECRET` is set, Vercel sends it as
`Authorization: Bearer …`, and the route returns 401 to anything else — including
to itself if you forget to set the variable, which is deliberate. An unprotected
tick endpoint is a free denial-of-service against every target you monitor.

Verify it: `vercel crons ls`, then `vercel crons run /api/cron/tick`. The
response body reports what the tick did.

### 3. Stripe

Point a webhook at `https://your-domain/api/webhooks/stripe` for
`checkout.session.completed` and the three `customer.subscription.*` events, and
put its signing secret in `STRIPE_WEBHOOK_SECRET`.

### 4. Optional: split the public hostnames

Both default to `NEXT_PUBLIC_APP_URL`, which is fine to launch with. Splitting
them is the reason they exist as separate variables:

```bash
NEXT_PUBLIC_PING_BASE_URL=https://ping.your-domain     # heartbeat ingest
NEXT_PUBLIC_STATUS_BASE_URL=https://status.your-domain # public status pages
```

A status page hosted on the same deployment as the dashboard goes down with the
dashboard, which is the worst possible moment for it to be unavailable.

### Tuning the tick

| Variable | Default | Notes |
|---|---|---|
| `CRON_CONCURRENCY` | 12 | Concurrent checks per tick. IO-bound. |
| `CRON_MAX_PER_TICK` | 300 | Monitors claimed per tick. |
| `CRON_TICK_BUDGET_MS` | 50000 | Stop starting new checks after this. |

Vercel's default function duration is 300s (up to 800s on Pro), so the 50s
budget is deliberately conservative. Anything not started is left with
`next_due_at` in the past and picked up by the next tick — nothing is lost, and
the response reports `checksDeferred` so you can see it happening.

---

## Shape 2 — add the probe fleet

Set `REDIS_URL` and the app switches: the cron tick is no longer needed, and the
three processes take over. Deploy them anywhere that runs a long-lived Node
process; `ARCHITECTURE.md` explains why Fly.io is the default choice.

```bash
npm run worker:scheduler   # one instance, any region
npm run worker:probe       # one per region, PROBE_REGION=iad|fra|sin
npm run worker:alerts      # one instance
PROBE_REGIONS=iad,fra,sin  # on the scheduler and the web app
```

Remove the `crons` block from `vercel.json` when you do, or the tick will race
the scheduler for the same monitors. (It cannot double-page — the notification
unique index prevents that — but it will double-check targets.)

---

## The caveat worth reading before you ship

**Vercel Pro is required, not optional.** Hobby runs cron jobs **once per day**,
and a deployment whose schedule is more frequent than that fails at deploy time.
A monitoring product on a daily check interval is not a monitoring product.

**Shape 1 checks from one region, and the pricing table promises three.** The
README sells "regions per check: 3" on Solo and Team, and names a single-region
false positive as the product's existential risk. On Vercel-only you get one
vantage point, so a monitor goes down after N *consecutive* failures instead of N
*concurrent regions* — a weaker guarantee that the code implements correctly and
honestly, but it is not what the pricing table says.

Pick one before launch:

1. **Run shape 2.** Keeps the pricing table true. ~$10–20/mo and three more
   processes to operate.
2. **Amend the pricing table** to drop the regions row, and raise the default
   `failureThreshold` so a single region has to fail more times before it pages
   anyone.

Shipping shape 1 with the current pricing page would be selling something the
deployment cannot do.
