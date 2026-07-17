# CoopClass Roadmap

## Phase 0 — Foundations

- Domain, Resend verification, Neon + Upstash projects.
- Stripe: SaaS products for three plans + summer-pause price; Connect
  (Standard) application for co-op fee accounts.

## Milestone 1 — MVP (weeks 1–4): registration works

1. Auth (director/admin/teacher/parent), co-op settings (discount
   rules, tiers), families + students.
2. Terms, periods, rooms, classes; the schedule grid with teacher/room
   conflict checks.
3. Registration windows + the portal: per-student catalog, the
   enrollment transaction (window/capacity/grade/prereq/period/room
   checks, atomic), waitlists with honest positions.
4. Invoices: line-by-line build with sibling discount rows, one Stripe
   Checkout per family on the co-op's Connect account.
5. Billing (CoopClass's own): trial, three plans, portal,
   webhook-driven state.
6. Landing page per MARKETING_PLAYBOOK.md with the registration-night
   device.

Exit criteria: two families race for the last seat — exactly one wins,
the other gets waitlist #1 with the reason named; a four-sibling family
checks out with visible discount lines; `typecheck`/`build`/`lint`
green.

## Milestone 2 — v1 (weeks 5–8): the running term

- Waitlist promotion with claim links; drop/refund handling.
- Payment plans (subscription schedules); family balance views.
- The binder: volunteer checks, expiry statuses, chasing emails.
- Weekly digest compilation + send ledger; teacher notes input.

## Milestone 3 — polish (weeks 9–12)

- Attendance-lite with exports; roster printing.
- Summer-pause plan state; term rollover (clone catalog forward).
- Family tier automation (returning = enrolled last term).

## Growth (quarter 2+)

- Teacher payout splits (co-ops that pay teachers per head).
- Document uploads on binder rows (stored check PDFs).
- Multi-campus co-ops; sibling ordering rules per state norms.
