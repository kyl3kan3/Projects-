# RigRent

**Inventory and bookings for party & equipment rental businesses — availability that can't double-book, deposits that actually hold, and condition photos on both ends of every rental.**

## The enemy

The whiteboard that promised the same 40 chairs to two Saturdays. Small
rental operators (tents, tables, AV, bounce houses, tools) quote from
memory, track inventory on a whiteboard, and find out about the
double-booking when the second truck is loading. Damage arguments run
on recollection, deposits are paper checks nobody cashes, and the
delivery schedule is a group text. RigRent kills the whiteboard: one
quantity-tracked calendar the quotes read from, so a double-booking is
structurally impossible.

## Who pays

- Party rental companies (tents/tables/chairs/linens/AV), 1–10 staff.
- Equipment rental yards (light construction, landscaping tools).
- Event-production side businesses renting their own gear between gigs.

## MVP feature list

1. **Quantity-tracked inventory** — items with owned counts, per-unit
   serials optional, maintenance holds; availability = owned − booked −
   holds for any date range.
2. **Availability-aware quotes** — build a quote for a date window; every
   line shows live availability for THAT window; overbooked lines block
   with the conflicting order named.
3. **Quote → order → contract** — one object through its life: draft
   quote, sent, accepted (e-sign with initials on damage terms),
   confirmed order.
4. **Stripe deposit holds** — card authorization (manual-capture
   PaymentIntent) for the security deposit at acceptance; captured only
   on documented damage, released automatically on clean return.
5. **Delivery & pickup runs** — orders grouped into dated runs with stop
   order, load lists per truck (what leaves the warehouse), and driver
   check-off.
6. **Condition photo pairs** — out-photos at load/delivery, in-photos at
   return, attached per item line; the damage claim is the diff between
   photo pairs, not a memory contest.
7. **Return + damage flow** — check-in each line (clean / damaged /
   missing); damage lines price from the item's fee schedule and draw on
   the held deposit with photos attached to the charge.
8. **Customer records** — contact, tax-exempt flag, order history,
   damage history.
9. **Calendar** — month/week of orders and runs; the busiest-Saturday
   view the whole shop plans around.
10. **Billing** — RigRent's own three plans, trial, portal.

## Pricing

| Plan | Price | For |
|---|---|---|
| **Yard** | **$79/mo** | 1 location, 2 users, unlimited orders. |
| **Fleet** | **$129/mo** | 5 users, delivery runs, damage claims. |
| **Pro** | **$199/mo** | Unlimited users, serials, maintenance holds, priority support. |

14-day free trial, no card. Deposits ride the operator's own Stripe
account — customer money never touches RigRent.

## Setup

```bash
cp .env.example .env.local          # fill in DATABASE_URL and the two secrets
npm install
npm run db:migrate                  # uses the DIRECT (non-pooled) Neon string
npm run db:seed                     # optional: a full demo yard, see below
npm run dev                         # http://localhost:3060
```

Three variables are enough to boot: `DATABASE_URL`, `SESSION_SECRET` and
`LINK_TOKEN_SECRET`. Everything else degrades honestly and the app says
which mode it is in — with no Stripe key deposit holds are **simulated**
and labelled as simulated on every screen that shows one; with no R2
credentials photos and PDFs go to the local filesystem; with no Resend key
email is logged. `npm run db:seed` builds *Whitcomb Party Rentals*: eight
real items with real counts, six customers, and orders at every stage —
including two confirmed for the same Saturday, which is what makes a third
quote for the same chairs block with the first one's order number.

Seeded sign-in: `dale@whitcombrentals.com` / `yardyard1` (owner),
`ray@whitcombrentals.com` (driver), `nita@whitcombrentals.com` (staff).

### Background work

The nightly pass re-authorises deposit holds that would lapse mid-rental and
sends the return-reminder ladder. It runs two ways, from the same functions:

```bash
npm run worker      # BullMQ, when REDIS_URL is set (needs a host to run on)
```

…or, with no Redis, `GET /api/cron/tick` with
`Authorization: Bearer $CRON_SECRET` — the Vercel shape, since Vercel has no
always-on process. The route **refuses to run when `CRON_SECRET` is unset**
rather than defaulting to open. `vercel.json` schedules it daily; the ladder
is day-grained, so that is enough on Hobby.

### Checks

```bash
npm run typecheck
npm test            # 139 unit tests over the domain logic
npm run craft        # the 14 design/defect rules a type-checker cannot see
npm run build
```

## Competitive landscape

The incumbent stack is either legacy desktop rental software (Point of
Rental, Alert, priced and shaped for large yards with onboarding
contracts) or generic booking tools (Booqable, Goodshuffle Pro) that do
quotes well but treat deposits, condition photos, and truck runs as
afterthoughts. RigRent's wedge is the operational back half of the
rental: the authorization-hold deposit flow, photo-pair damage evidence,
and load lists — the parts that stop the Saturday from going sideways.

## Landing page

- **Hero device:** "Double-booked never again." — a quote line for
  "40 × white folding chair" types in, the availability bar for that
  Saturday fills 32/40, the quantity ticks to 48, and the line blocks
  with the conflicting order named — then resolves at 40 and the quote
  confirms. Four beats, hold on the confirmed order.
- **The enemy, named:** the whiteboard that promised the same 40 chairs
  to two Saturdays.
- **Receipts:** a real availability calculation and a damage claim with
  its photo pair (demo data, labeled).
- **One CTA phrase, verbatim everywhere:** **"Start free — 14 days"**.
