# PaperTrail

**Proposals, contracts, and invoices for freelancers — one document chain, half of Bonsai's price.**

---

## The Problem

A freelancer closing a $4,000 project today juggles: a proposal in Google Docs or Canva, a contract from a template site (signed via a separate e-sign tool), an invoice from Wave or PayPal, and a spreadsheet to remember who owes what. Each handoff is retyped by hand, and each gap is where money leaks:

- Proposals that never become contracts because "I'll send the paperwork later"
- Work started on unsigned contracts (no deposit, no protection)
- Invoices sent late, followed up never — freelancers write off billable amounts every year simply from awkwardness about chasing payment

Existing all-in-ones solve this at the wrong price and weight. **Bonsai** starts at $25/mo and pushes an entire business-management suite. **HoneyBook** ($36+/mo) is built for service businesses with sales pipelines. **Wave** is free but invoice-only — no proposals, no contracts. The freelancer who sends 3–8 documents a month needs the *document chain*, not a business OS.

## Target User

- **Primary:** solo freelancers billing $2k–$15k/mo — designers, developers, writers, marketers, consultants — who send proposals and want deposits collected on signature.
- **Secondary:** micro-studios (2–3 people) needing multiple brands/templates and a shared income view.
- **Not targeting:** agencies with procurement/PO workflows, or invoice-only users who are well served free by Wave.

## Market & Profitability

- Freelancer-tools is a validated micro-SaaS niche with realistic **$5k–$40k MRR** outcomes; the buyer already pays for 2–3 tools this replaces.
- The wedge is price + focus: $12/mo undercuts Bonsai (~$25) and HoneyBook (~$36) while doing the one job that matters end-to-end.
- Payments attach revenue: with Stripe Connect, PaperTrail can take 0.5–1% on payment volume later — at $10k/mo average volume per active user, this eventually rivals subscription revenue.
- Churn risk is seasonal (freelancers pause), mitigated by annual plans and the archive being the system of record for taxes.

## Monetization

| Tier | Price | Limits |
|------|-------|--------|
| Free | $0 | 3 documents/mo, PaperTrail badge, 1 brand |
| Solo | $12/mo (or $99/yr) | Unlimited docs, custom branding, deposits, auto-reminders |
| Studio | $29/mo (or $290/yr) | 3 seats, multiple brands, team income dashboard, API |

Payment processing at cost initially (Stripe fees passed through); platform fee on payments is the Phase-3 lever.

## MVP Features

- [ ] Proposal builder: blocks (scope, pricing table with optional add-ons, terms), client-facing web view
- [ ] One-click **proposal → contract**: accepted scope/price flow into a contract template with e-signature (typed/drawn, IP + timestamp audit trail)
- [ ] One-click **contract → invoice**: deposit invoice auto-created on signature; balance invoice on completion
- [ ] Stripe payment links on invoices (card + ACH); partial payments/deposits
- [ ] Automatic late-payment reminders (gentle 3-step sequence, configurable)
- [ ] Income dashboard: paid / outstanding / overdue, tax-season CSV export
- [ ] Branding: logo, colors, custom sender domain on Solo+

## Differentiation

1. **The chain is the product.** Proposal, contract, and invoice are one linked object — acceptance data flows forward, nothing is retyped. Competitors treat these as three separate features.
2. **Deposit-on-signature default.** The moment a contract is signed, the deposit invoice is already in the client's inbox. This is the single highest-value automation for freelancers and it's on by default.
3. **Priced for the job** — $12/mo against Bonsai's $25+ suite pricing.

## Go-to-Market

- SEO: programmatic template pages ("freelance web design contract template", "consulting proposal template") — each template is a working PaperTrail doc, one click from being used. This is the primary channel; template searches have huge volume and clear intent.
- Communities: r/freelance, Indie Hackers, freelance Slack/Discord groups (value-first, not spam).
- Marketplaces: Notion/Gumroad template creators as affiliates (30% recurring).
- Product Hunt + "freelance stack" listicle placements.

## Competition

| Competitor | Price | Weakness we exploit |
|------------|-------|---------------------|
| Bonsai | $25–$79/mo | Bloated suite; price; freelancers use 20% of it |
| HoneyBook | $36+/mo | Built for pipelines/meetings, heavy onboarding |
| Wave | Free | Invoices only — no proposals, contracts, or e-sign chain |
| PandaDoc | $19+/seat | Docs/e-sign only, no invoicing or freelancer workflow |

## Key Risks

- **Free-tool gravity:** Wave/PayPal invoicing is free; the paid pitch must lead with proposals + contracts + deposits, not invoicing.
- **E-sign legal surface:** ESIGN/eIDAS compliance needs care (audit trail, consent, retention) — scoped in ARCHITECTURE.md.
- **Seasonality churn:** freelancers pause subscriptions between projects; annual plans and the tax-record lock-in are the counters.
- **Platform risk on payments:** Stripe account health is existential once payments attach; follow Connect best practices from day one.

---

## Setup

Requires Node 20+, a Postgres database, and nothing else. Redis, S3 and a
headless browser are **not** needed — see "Implementation notes" below.

```bash
npm install
cp .env.example .env            # then fill in the values described below
npm run db:migrate              # applies drizzle/ to the database in DATABASE_URL
npm run dev                     # http://localhost:3000
```

`DATABASE_URL` and `AUTH_SECRET` are the only variables the app cannot start
without. Everything else degrades honestly:

| Variable | Needed for | Without it |
|---|---|---|
| `DATABASE_URL` | everything | the app cannot start |
| `AUTH_SECRET` | session cookies | sign-in fails; generate 32 random bytes per environment |
| `RESEND_API_KEY`, `EMAIL_FROM` | emailing documents and reminders | documents are still created and their client links work; every send is logged on the timeline as undelivered |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | card/ACH payment on invoices, and PaperTrail's own subscription | the billing screen says payments are not configured; freelancers can still record payments received by bank transfer |
| `STRIPE_PRICE_SOLO`, `STRIPE_PRICE_STUDIO` | upgrading | upgrade buttons report the missing price |
| `CRON_SECRET` | the automatic reminder sweep | `/api/cron/reminders` returns 503 and refuses to run rather than defaulting to open |
| `NEXT_PUBLIC_APP_URL` | the client links inside emails | defaults to `http://localhost:3000` |

Then:

```bash
npm run typecheck
npm test                        # node:test via tsx — money, dates, tokens, reminders, plans
npm run build
```

**Stripe webhook.** Point it at `POST /api/webhooks/stripe` and subscribe to
`checkout.session.completed`, `payment_intent.succeeded`, and
`customer.subscription.created|updated|deleted`. Locally:
`stripe listen --forward-to localhost:3000/api/webhooks/stripe`. The webhook is
the only thing that changes a plan or credits an invoice, and it verifies the
signature before doing either.

**Reminders.** `vercel.json` schedules `GET /api/cron/reminders` daily at 09:00
UTC; Vercel sends `Authorization: Bearer $CRON_SECRET`. Run it by hand with:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/reminders
```

It is safe to run repeatedly: each notice in the three-step sequence can only be
sent once, and the sequence stops the moment an invoice's balance reaches zero.

## Implementation notes

Three things in `ARCHITECTURE.md` are implemented differently, on purpose. The
deployment target is Vercel + Neon (see the repository's `DEPLOYING.md`), which
has no always-on process and no local disk:

- **PDFs.** Instead of a Puppeteer worker rendering to S3, the client-facing
  document has a print stylesheet and a "Print or save as PDF" button. It is the
  same markup, so the printed copy — audit trail included — cannot drift from the
  web copy, and there is no browser binary to ship or bucket to secure.
- **Queue.** The reminder sequence is a cron-triggered route with a time budget
  rather than BullMQ on Redis. The job is day-granular, which is exactly what a
  once-a-day cron can serve.
- **Logos.** A brand stores a hosted logo URL rather than an uploaded object, so
  there is no S3 bucket in the MVP.

Auth is email + password (scrypt + a signed JWT cookie), not the magic link in
`ROADMAP.md` Phase 0: it is the same number of screens, works with no mail
provider configured, and keeps the sign-in link out of the same inbox as the
documents.
