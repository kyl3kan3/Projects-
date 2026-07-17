# CertShield Roadmap

## Phase 0 — Foundations

- Domain, Resend verification + inbound address, Neon + Upstash + R2,
  Stripe products for three plans.
- Twenty sample ACORD 25s (public blank + filled samples) as parser
  fixtures.

## Milestone 1 — MVP (weeks 1–4): parse → verdict → chase

1. Auth, org settings, properties, vendors (+ CSV import), engagements.
2. Requirement templates with the line/flag editor.
3. Intake: vendor portal + inbound email → R2 → parse worker →
   review queue with confidence highlighting.
4. The compliance engine: deterministic evaluate() with named
   deficiency sentences; nightly re-evaluation; history.
5. The chasing ladder with the exactly-once ledger; stop-on-compliance.
6. Dashboard + vendor detail with chase timelines.
7. Billing: trial, three plans, portal, webhook-driven state.
8. Landing page per MARKETING_PLAYBOOK.md with the parse-verdict
   device.

Exit criteria: upload a sample ACORD → parsed → review-confirmed →
deficient with the correct sentence → template fixed → compliant seal;
the T-30 chase fires exactly once in a simulated cycle;
`typecheck`/`build`/`lint` green.

## Milestone 2 — v1 (weeks 5–8)

- Binder exports (matrix + PDFs).
- Template blast-radius preview; manual override with named exception
  (audit-logged).
- Deficiency letters as a distinct chase kind; agent CC handling.
- Portfolio filters, saved views, CSV exports everywhere.

## Milestone 3 — polish (weeks 9–12)

- Work-order webhook/CSV hook (flag non-compliant vendors outbound).
- Multi-entity orgs (regional portfolios); per-property requirement
  overrides.
- Endorsement-page capture (AI/WOS evidenced by endorsement, not just
  the checkbox).

## Growth (quarter 2+)

- PM-system integrations (AppFolio/Buildium exports first).
- Sub-tier tracking for GCs (sub-of-sub chains).
- Carrier verification (call-the-carrier workflow with logged
  attestations).
