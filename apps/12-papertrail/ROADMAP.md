# PaperTrail Roadmap

## Phase 0 — Setup (week 0)
- Next.js + Postgres + Redis running locally; auth (magic link) works
- Stripe test-mode account + webhook forwarding wired

**Done when:** a user can sign up and create an empty draft document.

## Phase 1 — MVP (weeks 1–5)
- Proposal builder (blocks: heading/text/pricing table/terms) + public client view
- Accept flow with pricing snapshot → contract generation from template
- E-signature (typed/drawn) with audit trail + countersigned PDF
- Deposit invoice auto-creation on signature; Stripe payment links
- Late-payment reminder sequence; income dashboard (paid/outstanding/overdue)
- Free tier (3 docs/mo) + Solo plan billing

**Done when:** one real freelancer runs proposal→signature→deposit→final payment end-to-end with no manual glue.

## Phase 2 — Launch (weeks 6–9)
- Template gallery (10 polished proposal/contract templates per top verticals)
- Programmatic SEO template pages (the acquisition engine)
- Custom branding + sender domain; CSV tax export
- Product Hunt launch + freelance community seeding

**Done when:** 50 template pages indexed; first 25 paying customers; activation (signup→first doc sent) >30%.

## Phase 3 — Growth (months 3–6)
- Studio tier (seats, multi-brand); annual plans
- Stripe Connect platform fee (0.5–1%) on payment volume
- Recurring invoices + retainer agreements; Zapier integration
- Affiliate program for template creators (30% recurring)

**Done when:** $5k MRR; payment volume >$250k/mo; reminder-driven collections measurably reduce overdue balances for actives.
