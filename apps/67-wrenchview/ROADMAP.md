# WrenchView Roadmap

## Phase 0 — Foundations

- Domain, Resend verification, Neon + Upstash + R2, Stripe products.
- Twilio number + 10DLC registration (report links — start
  immediately, approval takes days).
- Two reference templates (25-point courtesy, brake special) with
  canned phrases reviewed by a working advisor.

## Milestone 1 — MVP (weeks 1–4): bay → link → approval

1. Auth (owner/advisor/tech), shop settings, devices (tablet
   tokens), customers + vehicles.
2. Templates with groups/items/canned phrases.
3. The bay flow: verdict rail, photos (presign + process-media),
   measurements, notes, progress, tech_done handoff.
4. Findings review + estimate lines; the Send panel.
5. The customer report `/r/[token]`: urgency groups, per-line
   Approve/Decline, approvals trail (ip/UA/timestamp), read
   receipts.
6. The advisor board with the state machine + waiting flags.
7. Billing: trial, three flat plans, portal, webhooks.
8. Landing page per MARKETING_PLAYBOOK.md with the graphite-to-paper
   device.

Exit criteria: a full inspection tapped on a tablet-sized viewport,
sent by SMS (DRY_RUN prints the link), opened, two lines approved
one declined, the trail recorded; `typecheck`/`build`/`lint` green.

## Milestone 2 — v1 (weeks 5–8)

- Vehicle history + "still open" declined flags.
- Declined-work follow-ups (30/90) with exactly-once ledger.
- DVI PDF for the RO jacket.
- Videos (60s cap) with poster frames.

## Milestone 3 — polish (weeks 9–12)

- Template sharing between locations (Garage Group).
- Spanish-language customer reports (per-customer toggle).
- Board analytics: approval rate by advisor/finding type (plain
  tables).

## Growth (quarter 2+)

- SMS two-way ("reply YES to approve all recommended").
- Parts-lookup integrations (PartsTech) for the estimate builder.
- Shop-management bridges (Tekmetric/Mitchell RO import).
