# UnitKeeper Roadmap

## Phase 0 — Foundations

- Domain, Resend verification, Neon + Upstash + R2, Stripe products;
  Connect (Standard) application for owner rent accounts.
- Lien-rule content for the launch states (start with TX/FL/CA),
  statute-reviewed, cited, and dated; the state lease templates.

## Milestone 1 — MVP (weeks 1–4): map → move-in → money

1. Owner auth + settings (late ladder), facilities, the map editor
   (rows/sizes/positions) and the map view with status fills.
2. Tenants + move-in flow: lease render + tokenized sign (hash),
   card/ACH setup on Connect, prorated first charge, gate code,
   occupied flip.
3. The append-only ledger with running balances; receipts.
4. Autopay runs + the late ladder (exactly-once per step, payment
   reverses); the delinquency board.
5. Billing (UnitKeeper's own): trial, three plans, portal, webhooks.
6. Landing page per MARKETING_PLAYBOOK.md with the map-to-rail
   device.

Exit criteria: a unit moves in end to end in a test run (lease
signed + hashed, charge in test mode, code issued); a simulated
failure walks the ladder on schedule and a payment reverses it;
`typecheck`/`build`/`lint` green.

## Milestone 2 — v1 (weeks 5–8): the lien engine

- lien_rules data + the pure timeline engine with citation rendering
  and hard stops (the date math test suite is the centerpiece).
- Lien cases: open from the board, generate notices (PDF), mark sent
  with tracking, resolve on payment, the packet export.
- Overlock gate-code state + keypad CSV exports.
- Move-out flow with prorate/refund math and make-ready checklist.

## Milestone 3 — polish (weeks 9–12)

- Rate management with notice letters and effective-dating.
- Statements; occupancy/revenue view; multi-facility (Depot).
- Manual-mode lien checklist for states without reviewed rules.

## Growth (quarter 2+)

- More state rule packs (editorial cadence, reviewed and dated).
- Gate-hardware integrations (PTI/DoorKing APIs) — v1 honesty ends.
- Online sale-listing helpers (where statutes permit online auction
  platforms).
