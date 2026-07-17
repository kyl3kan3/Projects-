# DispatchDeck Roadmap

## Phase 0 — Foundations

- Domain, Resend domain + inbound parse subdomain, Neon + Upstash + R2
  projects, Stripe products for the three plans.
- Ten rate cons from real brokers (public samples) as the parser's test
  fixtures.

## Milestone 1 — MVP (weeks 1–4): the load spine

1. Auth (owner/dispatcher/driver), carrier settings, trucks, brokers.
2. Loads + stops CRUD with the status lifecycle and the cab card —
   stamps, thread, POD photo upload (R2 presign).
3. Rate-con intake: inbound address + upload → parse worker → draft
   review → one-tap load creation.
4. Detention clock: arrived timestamps, free-window config,
   auto-drafted accessorial lines with evidence.
5. Invoice + packet: numbering, pdf-lib packet merge with completeness
   check, Resend send, paid marking.
6. Billing: trial, three plans, portal, webhook-driven state.
7. Landing page per MARKETING_PLAYBOOK.md with the load-card device.

Exit criteria: forward a real rate con, confirm the draft, run the load
from the cab to delivered with a POD, send a complete packet, mark it
paid — with `typecheck`/`build`/`lint` green.

## Milestone 2 — v1 (weeks 5–8): the money layer

- Factoring exports (Triumph/RTS/OTR CSV formats), advance/settlement
  payments, factored-load reconciliation view.
- IFTA: jurisdiction legs, fuel receipts, quarter summary export.
- Settlement week view with per-mile math.
- Broker days-to-pay rollups and terms surfacing at invoice time.

## Milestone 3 — micro-fleet (weeks 9–12)

- Team/Fleet plans: multiple trucks, driver seats, per-truck settlement.
- Dispatcher board with driver assignment.
- Document search and per-broker packet preferences.

## Growth (quarter 2+)

- Load-board paste-in (DAT/Truckstop text → draft load).
- QuickBooks export; ELD mileage import (Samsara/Motive APIs) to replace
  manual state-line odometer entries.
- Broker credit signals (public MC data) beside the book's own
  days-to-pay history.
