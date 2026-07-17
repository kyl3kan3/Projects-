# ListingLoop Roadmap

## Phase 0 — Foundations

- Domain, Resend verification, Neon + Upstash + R2, Stripe products.
- Holiday calendar data: US federal + the launch states' observed
  holidays, loaded as versioned rows.
- Three starter templates (listing / buyer / dual) with real date
  rules reviewed against a state contract form.

## Milestone 1 — MVP (weeks 1–4): the timeline works

1. Auth, account settings (state, reminder offsets), users.
2. Templates with the date-rule builder (rule sentences).
3. Deals + parties; instantiation (tasks + computed critical dates);
   the timeline render with derivations on hover.
4. The date engine as a pure module with exhaustive tests (business
   days, weekend rolls, holiday observance, month boundaries).
5. Anchor-edit diff preview → apply → recompute ledger; reminder
   resets for unsent offsets only.
6. Reminder fan-out with the exactly-once ledger + per-party digest
   coalescing.
7. Billing: trial, three plans, portal, webhook-driven state.
8. Landing page per MARKETING_PLAYBOOK.md with the unfurl device.

Exit criteria: a buyer-side deal opens with 11 computed dates; moving
the contract date previews and applies a correct diff (holiday case
asserted); T-3 reminders fire exactly once; `typecheck`/`build`/
`lint` green.

## Milestone 2 — v1 (weeks 5–8)

- Document placeholders, party upload links, versioning,
  completeness bar.
- Party portal read view.
- Commission math + pipeline totals.
- Activity log everywhere; at-risk rail.

## Milestone 3 — polish (weeks 9–12)

- Closing packet zips (docs + checklist + timeline PDF).
- Multi-user roles; per-agent views for TCs serving many agents.
- ICS feed of critical dates (calendar subscriptions).

## Growth (quarter 2+)

- Contract PDF date extraction (parse the anchor dates in, human-
  confirmed).
- State-form template packs; brokerage template sharing.
- SkySlope/Dotloop document sync (pull final docs into the file).
