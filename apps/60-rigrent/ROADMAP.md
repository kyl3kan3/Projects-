# RigRent Roadmap

## Phase 0 — Foundations

- Domain, Resend verification, Neon + Upstash + R2 projects.
- Stripe: Billing products for the three plans; Connect (Standard)
  application for operator deposit accounts.

## Milestone 1 — MVP (weeks 1–4): the availability spine

1. Auth, account settings (deposit defaults, tax, fee schedules),
   customers.
2. Inventory: items, owned counts, categories, damage fee schedules,
   maintenance holds; the availability query with tests around
   date-overlap edge cases (same-day turnarounds especially).
3. Quote builder with live gauges and the overbooked block; quote →
   send email.
4. Customer page `/q/[token]`: accept, signature + initials, doc hash;
   deposit hold (manual-capture PI on the operator's Connect account);
   confirmed orders count against availability.
5. Order lifecycle: out → returned; clean-return hold release.
6. Billing: trial, three plans, portal, webhook-driven state.
7. Landing page per MARKETING_PLAYBOOK.md with the gauge device.

Exit criteria: two overlapping quotes for the same 40 chairs — the
second blocks with the first's order number; a clean return releases
its hold untouched; `typecheck`/`build`/`lint` green.

## Milestone 2 — v1 (weeks 5–8): trucks and damage

- Delivery/pickup runs: stop ordering, per-truck load lists, run-sheet
  PDFs, driver check-off with out-photos.
- Return check-in with steppers + in-photos; damage claims from fee
  schedules; partial deposit capture with photo evidence; waive path.
- Hold re-authorization for long rentals; overdue-return reminders.
- Serial tracking (units) and per-unit maintenance.

## Milestone 3 — polish (weeks 9–12)

- Calendar week/month with run overlays.
- Customer history + damage history; tax-exempt handling on quotes.
- CSV import for inventory; export everything (anti-lock-in).

## Growth (quarter 2+)

- Public storefront catalog with request-to-book (no live checkout —
  quotes stay human-approved).
- QuickBooks export; multi-location inventory pools.
- Seasonal pricing rules (peak-Saturday rates).
