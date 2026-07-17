# ChairFlow Roadmap

## Phase 0 — Foundations (pre-code)

- Stripe Connect Express platform application approved (test mode first);
  platform + Connect webhook endpoints registered.
- Twilio number purchased and 10DLC campaign registered (reminder/nudge
  use case — approval takes days; start immediately).
- Domain, Resend domain verification, Neon + Upstash projects.

## Milestone 1 — MVP (weeks 1–4): the protection loop

Build in this order; each step is shippable to test users.

1. **Stylist onboarding**: account, handle, services with durations/prices/
   deposit rules, working hours, policy editor (versioned; v1 active).
2. **Public booking page `/b/[handle]`**: real availability, service picker,
   name + phone contact step, the policy panel with agreement stamping,
   SetupIntent card save / deposit PaymentIntent on the stylist's Express
   account, confirmation + manage link.
3. **Day view**: today's appointments, the unmarked-appointment prompt
   (Completed / No-show / Late grace), one-tap waive.
4. **Fee capture**: `capture-fee` worker job — deposit-first, off-session
   charge per agreed policy version, dispute-ready metadata, failure
   surfacing with hosted retry link.
5. **Reminders**: 48h/2h email + SMS with manage links; message ledger.
6. **Protection ledger**: fees collected, deposits kept, waives — the
   "paid for itself" number on the dashboard.
7. **Billing**: 14-day trial, three plans via hosted checkout, customer
   portal, webhook-driven plan state.
8. **Landing page** per MARKETING_PLAYBOOK.md with the no-show device.

Exit criteria: a stylist can onboard, take a card-backed booking from a
phone, mark a no-show, and watch the fee land — all in Stripe test mode —
and `typecheck`/`build`/`lint` are green.

## Milestone 2 — v1 (weeks 5–8): the book that fills itself

- Cadence engine (nightly scan, median intervals, CSV history import).
- Rebooking nudges with one-tap tokenized booking, caps, quiet hours,
  global STOP; nudge receipts (`resulted_appointment_id`).
- Waitlist with atomic claim offers and 60-minute expiry.
- Google Calendar busy-block sync + ICS feeds (Book tier).
- Client cards: visit history, no-show count, notes.

## Milestone 3 — Shop tier (weeks 9–12)

- Shops, chairs, renter assignment; the front-door page `/s/[shop]`.
- Weekly rent rollover, payment links, mark-paid, late escalation; the
  chairs x weeks owner grid.
- Owner reporting: occupancy, rent collected, renter retention.

## Growth (quarter 2+)

- Platform fee on deposit/fee volume (the phase-2 revenue layer).
- Square/Toast POS import for service history cold starts.
- Multi-stylist availability search on shop front doors.
- Instagram DM auto-reply with the booking link (Meta review permitting).
