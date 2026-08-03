# CertShield

**Certificate-of-insurance tracking for property managers and GCs — expired COIs caught before the claim, not after.**

## The enemy

The COI folder that was current in March. Property managers and general
contractors are contractually required to hold valid insurance
certificates for every vendor and sub on every property and project —
and the folder is always stale: certificates expire mid-engagement,
coverage limits quietly don't meet requirements, additional-insured
endorsements are missing, and nobody finds out until there's a claim
and the indemnity chain fails. Chasing renewals is a spreadsheet, an
inbox, and hope. CertShield kills the stale folder: every certificate
parsed into structured coverage, checked against the requirement it
must meet, and chased automatically before it lapses.

## Who pays

- Property management companies (50–5,000 doors) holding vendor COIs.
- General contractors holding subcontractor COIs per project.
- The daily user is the compliance coordinator/office admin; the buyer
  is the ops principal who signs the insurance addendum.

## MVP feature list

1. **Vendor registry** — vendors/subs with contacts, trades, and the
   properties/projects they touch.
2. **Requirement templates** — per vendor type or contract: required
   lines (GL, auto, umbrella, workers' comp), minimum limits,
   additional-insured + waiver-of-subrogation flags, endorsement
   requirements.
3. **Vendor upload portal** — a tokenized link where the vendor (or
   their agent) uploads the ACORD 25 PDF; no vendor accounts.
4. **COI parsing** — extraction worker reads the ACORD form: carrier,
   policy numbers, effective/expiry dates, each coverage line's limits,
   AI/WOS checkboxes; low-confidence fields flagged for human review,
   never silently accepted.
5. **Compliance engine** — parsed coverage vs. the vendor's requirement
   template → compliant / deficient (each deficiency named: "GL each-
   occurrence $500k < required $1M") / expiring / expired.
6. **Chasing sequences** — automatic renewal requests at T-30/14/7/1
   before expiry and after lapse, to vendor + their agent, escalating
   tone; stops the moment a compliant replacement lands.
7. **Compliance dashboard** — per property/project: who's compliant,
   who's deficient and why, who lapses this month; portfolio rollup.
8. **Hold-harmless awareness** — non-compliant vendors flagged on work
   orders (a webhook/CSV hook for the PM system in v1, not a deep
   integration).
9. **Audit exports** — per property/project binder: every current
   certificate PDF + the compliance matrix, one click, audit-ready.
10. **Billing** — three plans by vendor count, trial, portal.

## Pricing

| Plan | Price | For |
|---|---|---|
| **Ledger** | **$99/mo** | Up to 100 vendors, 2 users. |
| **Portfolio** | **$199/mo** | Up to 400 vendors, 5 users, API/CSV hooks. |
| **Enterprise** | **$299/mo** | Unlimited vendors, SSO-ready, priority support. |

14-day free trial, no card. Per-company pricing (not per-certificate) —
the incumbent per-cert pricing punishes exactly the growth CertShield
wants to ride.

## Competitive landscape

The category exists and validates the pain: myCOI, Jones, bcs, and TrustLayer
sell COI tracking to enterprises, typically with services-heavy
onboarding, per-certificate pricing, and sales-led contracts. Insurance
agencies offer "we'll track it" as a courtesy that dies at renewal
time. CertShield's wedge is self-serve product for the mid-market PM/GC:
sign up Tuesday, import vendors Wednesday, compliant-or-chasing by
Friday — with parsing confidence shown honestly and a price the office
admin can put on a card.

## Landing page

- **Hero device:** "Expired COIs caught before the claim." — an ACORD
  form drops in, parses into coverage rows (verdicts rendered as
  plain text, not icons), one row flags deficient in the named
  sentence, the chasing sequence fires T-30 → T-14, and a compliant
  replacement lands as the badge flips. Four beats, hold on the
  compliant matrix.
- **The enemy, named:** the COI folder that was current in March.
- **Receipts:** a real deficiency sentence and a chasing timeline (demo
  data, labeled).
- **One CTA phrase, verbatim everywhere:** **"Start free — 14 days"**.

## Setup

Node 20 or newer, a Postgres database, and nothing else required.

```bash
npm install
cp .env.example .env          # fill DATABASE_URL, SESSION_SECRET, LINK_TOKEN_SECRET
npm run db:migrate            # reads .env itself
npm run db:seed               # optional: a demo portfolio with real certificate PDFs
npm run dev                   # http://localhost:3062
```

Only three variables are required. Everything else degrades honestly, and
**Settings → "How this deployment is wired"** states in the UI which way each one
went — a compliance tool that has quietly stopped sending email is worse than one
that says so:

| Unset | What happens instead |
|---|---|
| `ANTHROPIC_API_KEY` | Certificates are read by the built-in ACORD 25 grammar (`src/lib/acord.ts`). It handles text PDFs, reports per-field confidence honestly, and fails rather than guessing on a scan. |
| `R2_*` | Certificate PDFs are stored as bytes in Postgres. Nothing is ever lost either way. |
| `RESEND_API_KEY` (or `DRY_RUN=1`) | Chases are computed and written to the ledger, then logged instead of sent. Exactly-once behaviour is identical. |
| `STRIPE_*` | The billing screen lists the plans without a checkout button. |
| `REDIS_URL` | Parsing runs inline on upload and `GET /api/cron/tick` does the nightly pass. With Redis, `npm run worker` drains the queues instead. |

`npm run db:seed` creates a demo portfolio — three properties, eight vendors, and a
certificate file in every state the product handles (compliant, expiring,
deficient, expired, awaiting review, a parse that failed, and a vendor with nothing
on file). Sign in as `dana@harborridge.example` / `harborridge2026`. It refuses to
run against a database that holds any other organisation.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `npm start` | The app on port 3062 |
| `npm run worker` | The BullMQ worker: parse, evaluate, chase, binder, Stripe. Requires `REDIS_URL`. |
| `npm test` | The domain suite: the compliance engine, the chasing ladder, the ACORD grammar, the model path, dates and money |
| `npm run typecheck` / `npm run build` | `tsc --noEmit` / production build |
| `npm run db:generate` / `db:migrate` / `db:seed` | Drizzle migrations and demo data |

### Deployment

Vercel + Neon + Upstash + R2. Use Neon's **pooled** connection string. `vercel.json`
registers one daily cron on `/api/cron/tick`, which is the whole scheduler on Hobby;
the tick is written to be correct at any frequency, so a worker running it every ten
minutes and a cron running it once a day both behave.
