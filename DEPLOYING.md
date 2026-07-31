# Deploying — Vercel + Neon

The portfolio targets **Vercel** for hosting and **Neon** for Postgres. This page
records what that choice implies so each app doesn't have to rediscover it. An
app with its own `DEPLOYING.md` has app-specific steps on top of this.

## Neon

Use the **pooled** connection string — the host with `-pooler` in it. Two
settings are not optional:

```ts
postgres(env.databaseUrl, {
  // Every warm serverless instance keeps its own pool, so a generous max
  // multiplies into Neon's connection ceiling. Long-lived workers get a pool.
  max: process.env.VERCEL ? 1 : 10,
  idle_timeout: process.env.VERCEL ? 20 : undefined,
  // Required by the pooled endpoint: PgBouncer in transaction mode cannot carry
  // prepared statements across connections.
  prepare: false,
});
```

Every app in this repo that talks to Postgres already does this. Migrations run
from your machine against the same database (`npm run db:migrate`), not from a
function — a build step that migrates is a build step that can half-migrate.

## Vercel

Next.js apps deploy zero-config; `vercel deploy --prod` is the whole story for
most of them. Two things regularly bite:

**Cron frequency is a plan matter.** Hobby runs cron jobs **once per day**, and a
deployment with a more frequent schedule fails at deploy time. Anything that
needs to happen on a schedule more often than daily needs **Pro**. Per-project
cron limits were lifted to 100 on all plans in January 2026, but the frequency
floor on Hobby was not.

**Always-on processes don't exist.** Vercel functions are invoked; they do not
run. Any app in this portfolio whose `ARCHITECTURE.md` calls for a worker,
scheduler, or queue consumer needs one of:

1. **A cron-triggered route** that does the work inline, bounded by a time
   budget so it finishes well inside the function duration (default 300s, up to
   800s on Pro). Works when the work is periodic and divisible.
2. **A separate host** for the long-lived process — Fly.io, Railway, a VPS —
   with Vercel serving only the web tier.

`apps/05-pulsewatch` implements both and switches on whether `REDIS_URL` is set;
see its `DEPLOYING.md` for the pattern, including how to keep the two from
racing.

**Protect cron routes.** Set `CRON_SECRET` and Vercel sends it as
`Authorization: Bearer …`. Reject anything else, and reject when the variable is
missing rather than defaulting to open — a cron route usually does the most
expensive thing in the app.

## Which apps need more than Vercel + Neon

Read the app's `ARCHITECTURE.md`, but as a guide:

| Shape | Vercel + Neon enough? |
|---|---|
| Web SaaS, request/response only | Yes |
| Periodic background work | Yes, via a cron route on Pro |
| Continuous or sub-minute background work | No — needs a worker host |
| Long media/AI jobs past the duration cap | No — needs a worker host |
| Redis-backed queues (BullMQ) | Needs Upstash, plus a consumer somewhere |
| Expo mobile apps | Not applicable; EAS builds, Vercel can host the companion API |
| Tauri desktop | Not applicable; ships as a signed binary |

Apps declaring `bullmq`/`ioredis` are the ones to look at first — they assume a
consumer process exists.

## Before you point a domain at anything

- Migrations applied to the production database.
- `AUTH_SECRET` generated per environment, never shared with preview.
- Stripe webhook pointed at the deployed URL, with its signing secret set.
- `CRON_SECRET` set, and `vercel crons ls` showing what you expect.
- A smoke test that signs up, does the app's core action, and reads it back.
