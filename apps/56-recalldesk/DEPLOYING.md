# Deploying RecallDesk

Two supported shapes. The domain logic is identical in both — every scheduled job
is a plain function in `src/server/jobs.ts`, and both shapes call the same
`runTick`. Pick one, or run both: they take the same `job_leases` row before doing
anything, so they cannot double-send.

| | **Vercel + Neon** | **Vercel + Neon + a worker host** |
|---|---|---|
| Always-on process | none | one (`npm run worker`) |
| Scheduler | `/api/cron/tick` | the worker loop, every 60s |
| Send latency | up to the cron interval | ~1 minute |
| Requires | **Vercel Pro** (Hobby cron runs once a day) | Vercel Hobby is fine |
| Extra cost | $0 | ~$5–10/mo (Fly, Railway, a VPS) |

## A deliberate deviation from ARCHITECTURE.md

`ARCHITECTURE.md` specifies BullMQ workers over Redis. The **jobs, their order and
their boundaries are exactly as specified** — `process-import`,
`recompute-overdue`, `run-campaign-step`, `send-touch`, `attribute-bookings`,
`build-call-queue`, `owner-report`, `process-stripe-event` — but the transport is a
tick rather than a queue, because a queue consumer needs a process to live in and
Vercel has none. Redis is therefore not required at all: mutual exclusion is a
`job_leases` row compared against SQL `now()`, which works in both shapes and has
one fewer service to hold a BAA with.

If you later want a real queue, `runTick` is the seam: replace its body with
enqueues and give each job its own worker. Nothing above it changes.

## 1. Neon

Create a project, then copy the **pooled** connection string — the host with
`-pooler` in it. The client already sets `prepare: false` (PgBouncer in transaction
mode cannot carry prepared statements between connections) and holds one connection
per serverless instance.

```bash
DATABASE_URL='postgres://user:pass@ep-xxx-pooler.region.aws.neon.tech/recalldesk?sslmode=require'
npm run db:migrate     # from your machine, against the same database
```

**Patient rosters are PHI.** Neon's BAA is on the Business plan; get it executed
before a real roster is imported, along with BAAs for Resend, Twilio, Cloudflare
and your host. `npm run db:seed` writes an entirely fictional demo practice if you
want to look around first.

## 2. Vercel

```bash
vercel link
vercel env add DATABASE_URL production          # the pooled Neon string
vercel env add SESSION_SECRET production        # openssl rand -base64 32
vercel env add BOOKING_TOKEN_SECRET production  # openssl rand -base64 32
vercel env add CRON_SECRET production           # openssl rand -hex 32
vercel env add APP_URL production                # https://your-domain
vercel env add NEXT_PUBLIC_APP_URL production    # https://your-domain
vercel env add RESEND_API_KEY production
vercel env add RESEND_WEBHOOK_SECRET production
vercel env add TWILIO_ACCOUNT_SID production
vercel env add TWILIO_AUTH_TOKEN production
vercel env add TWILIO_FROM_NUMBER production
vercel env add STRIPE_SECRET_KEY production
vercel env add STRIPE_WEBHOOK_SECRET production
vercel env add STRIPE_PRICE_CHAIRSIDE production
vercel env add STRIPE_PRICE_RECALL_ENGINE production
vercel env add STRIPE_PRICE_GROUP production
vercel deploy --prod
```

`vercel.json` registers the cron at `*/15 * * * *`, matching
ARCHITECTURE.md's "repeatable, every 15 min" for campaign steps. **Cron frequency
is a plan matter:** Hobby runs cron jobs once per day and a deployment with a
tighter schedule fails at deploy time, so this needs Pro. A once-a-day tick still
works — the overdue recompute, queue build and attribution are all daily anyway —
but a campaign's day-7 email would go out up to 24 hours late.

Because `CRON_SECRET` is set, Vercel sends it as `Authorization: Bearer …` and the
route returns 401 to anything else, **including to itself if you forget to set the
variable**. That is deliberate: an open tick endpoint sends email and SMS to
patients.

Verify it: `vercel crons ls`, then `vercel crons run /api/cron/tick`. The response
body reports what the tick did.

## 3. The worker shape (optional)

Any host with a process. It needs the same `DATABASE_URL` and secrets:

```bash
npm run worker
```

It ticks every 60 seconds, logs a PHI-free summary per tick, and drains the tick in
flight on `SIGTERM` so a deploy never severs a send half-way through. Running it
*and* the cron is safe.

## 4. Webhooks

| Provider | Endpoint | Events |
|---|---|---|
| Stripe | `/api/webhooks/stripe` | `checkout.session.completed`, `customer.subscription.*`, `invoice.payment_failed` |
| Resend | `/api/webhooks/resend` | `email.delivered`, `email.bounced`, `email.complained` |
| Twilio | `/api/webhooks/twilio` | Message status callbacks **and** inbound SMS |

Point Twilio's *inbound message* webhook at the same URL as its status callback.
Inbound `STOP` is honoured before the signature check — a request we cannot verify
that plainly says STOP is still a person asking not to be texted — while delivery
reports require a valid `X-Twilio-Signature`, so a forged one cannot suppress a
patient's number or fake a delivery.

## 5. Before the first real campaign

- `DRY_RUN=1` until you have watched a rehearsal: touches are recorded and logged,
  nothing is sent. Every screen says "Rehearsal mode" while it is on.
- 10DLC registration takes weeks. Until it clears, run email-only (Chairside).
- Set each location's timezone, sending window and hourly cap in Settings. Quiet
  hours are enforced in the *location's* clock, never the server's.
- Check the per-location `Touches per hour` cap against your Resend plan.
