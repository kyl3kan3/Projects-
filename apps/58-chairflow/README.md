# ChairFlow

**Booking and no-show protection for chair-renting stylists and barbers: a personal booking page with card-on-file deposits that convert to no-show fees under the stylist's own policy, rebooking nudges timed to each client's real cadence, and chair-rent split tracking for the shop owner.**

## The Problem

A chair-renting stylist is a one-person business with a landlord and no receptionist. Every no-show is not a statistic — it's an unpaid hour with rent still running. And no-shows are endemic: hair stylists average around 13% no-show rates and barbers around 10%, with pen-and-paper shops seeing up to 20% ([Goldie](https://heygoldie.com/tools/no-show-cost-calculator), [WaitQ](https://waitq.app/blog/barbershop-statistics)). At $40-80 of service revenue per missed appointment — $60-120 counting lost tips, rebooks, and retail — a stylist doing 40 appointments a week is quietly donating hundreds of dollars a month to people who didn't show up ([Squire](https://getsquire.com/business-edge/real-cost-of-no-shows)).

The defense is known and proven — card on file, a deposit at booking, a clearly stated fee policy; deposits reduce no-shows by 60-80% when implemented properly ([DaySpark](https://dayspark.com/blog/hair-salon-no-show-reduction-playbook)). But the tools make it awkward: marketplace apps (Booksy, StyleSeat) own the client relationship and tax it; suite software (GlossGenius, Squire) bundles POS, marketing, and payroll the solo renter doesn't want; and the fee moment itself — charging a regular who flaked — is socially radioactive without a policy page to point to.

The second leak is quieter: the client who used to come every four weeks and is now at week seven. No receptionist notices. Nobody texts them. Booth renters lose more clients to drift than to competitors.

ChairFlow is the solo renter's protection layer: a booking page that enforces *their* policy politely and automatically, a cadence engine that nudges each client back on *their* rhythm, and a rent-split ledger so the stylist and the shop owner both see the same math.

## Target User

- **Primary:** chair/booth-renting stylists and barbers in the US — independent operators inside someone else's shop, 25-60 appointments/week, paid by their own clients, paying weekly chair rent. The buyer is the stylist, on their phone, between clients.
- **Secondary:** small shop owners (3-12 chairs) who rent to independents and want the rent ledger and a shared front door; suite-renting estheticians and nail techs with the same anatomy.
- **Buyer profile:** already runs their book through Instagram DMs plus a scheduling app they resent. Buys the first time ChairFlow charges a no-show fee they didn't have to ask for.
- **Not a target (yet):** commission salons with employed staff, multi-location chains, marketplace-dependent stylists who want discovery/lead-gen (we protect an existing book; we don't promise new clients).

## Market & Profitability

- **The category is huge, self-serve, and priced in public.** [GlossGenius starts at $24/mo](https://www.goodcall.com/appointment-scheduling-software/glossgenius-vs-booksy), [Booksy runs $29.99/mo plus $20 per additional team member](https://glossgenius.com/blog/booksy-price), and [Squire's plans run $30-150/mo for barbers](https://www.goodcall.com/appointment-scheduling-software/booksy-vs-squire). Hundreds of thousands of US independents already pay in exactly ChairFlow's $19-49 band.
- **No-show math sells itself.** At ~10-13% no-show rates and $40-80 per miss, one protected appointment per month covers the subscription; shops using reminder + deposit tooling protected an average of $4,300+/mo in 2025 ([Goldie](https://heygoldie.com/tools/no-show-cost-calculator), [Zenoti](https://www.zenoti.com/thecheckin/no-show-revenue-calculator)). ChairFlow's dashboard shows "fees collected + deposits kept" as a running total — the subscription justifying itself in mono digits.
- **Payments create the second line:** deposits and no-show fees flow through Stripe on the stylist's own account; standard processing plus a modest platform fee on card volume (phase 2, transparently disclosed) scales with adoption without touching the subscription price.
- **Realistic ceiling:** **$25k-$120k MRR** over 2-4 years (1,000-4,000 stylists at ~$30 blended ARPU, plus payments margin). Churn pressure is real at the low end (independents churn); countered by the booking page owning the client list, the cadence data compounding, and the rent ledger binding the shop.
- **Margins:** SMS is the main variable cost; >85% gross margin at the $19 floor.

## Monetization & Pricing

Priced for a solo operator's wallet; the shop plan is the multi-chair umbrella.

| Plan | Price | Includes |
|---|---|---|
| **Chair** | $19/mo | Personal booking page, services + durations + prices, card-on-file deposits, no-show/late-cancel fee policy engine, appointment reminders (email + SMS), the protection ledger |
| **Book** | $29/mo | Everything in Chair + cadence-based rebooking nudges, client notes + history, waitlist for freed slots, Google/Apple calendar sync, custom policy page branding |
| **Shop** | $49/mo per shop (up to 12 chairs; each renter needs Chair+) | Shop booking front door (pick your stylist), chair-rent split ledger (weekly rent, paid/unpaid, history), shop-level no-show analytics, owner dashboard |

14-day free trial, no card. Deposits/fees process on the stylist's own Stripe (Connect Express) at standard rates. Annual = 2 months free.

## MVP Feature List

- [ ] Auth + stylist onboarding (Auth.js): services (name, duration, price, deposit rule), working hours, chair location
- [ ] The personal booking page (`chairflow.app/b/handle`): mobile-first, client picks service + time from real availability, no client account required
- [ ] Card-on-file + deposits (Stripe Connect Express): SetupIntent saves the card; per-service deposit rules (none / flat $ / percent) charged or held at booking per the stylist's policy
- [ ] The policy engine: per-stylist cancellation window (e.g. 24h) and fee schedule (late cancel %, no-show %); policy text rendered on the booking page and in every confirmation — clients agree at booking, with timestamp recorded
- [ ] No-show/late-cancel flow: stylist marks the outcome (or auto-flag after end time); the fee charges the card on file per policy, deposit applied first; every charge references the agreed policy version; one-tap waive for grace
- [ ] The protection ledger: fees collected, deposits kept, waived charges — the running "the no-show that paid for itself" total on the dashboard
- [ ] Appointment lifecycle: confirmations + reminders (email + SMS at 48h/2h), reschedule/cancel links honoring the policy window automatically
- [ ] Cadence engine (Book tier): per client x service, median interval from history; when a client passes due date + grace, a rebooking nudge goes out with a one-tap booking link; nudges cap at 2 per cycle, quiet hours honored
- [ ] Client list: history, cadence, notes, card-on-file status, no-show record; CSV import (name, phone, email, last visit) to seed cadences
- [ ] Chair-rent split tracking (Shop tier): shop owner sets weekly rent per chair; renters' paid/unpaid ledger with Stripe payment links; both sides see the same history
- [ ] Waitlist: a cancelled slot offers itself to waitlisted clients for that service/day (first-tap wins)
- [ ] Billing for ChairFlow itself (Stripe, three tiers, trial)

Post-MVP (explicitly cut from v1): POS/checkout for services, retail/inventory, payroll/commissions, marketing campaigns/blasts, Google Reserve integration, marketplace discovery, multi-location shop chains, native apps (the web app is installable).

## Running it locally

```bash
cp .env.example .env.local          # fill in DATABASE_URL, AUTH_SECRET, LINK_TOKEN_SECRET
npm install
npm run db:migrate                  # creates the schema
npm run db:seed                     # optional: a demo chair with real-looking data
npm run dev                         # http://localhost:3058
```

The seed prints its logins. The stylist is `dee@foundrybarber.example`, the shop owner is
`ray@foundrybarber.example`, and the booking page is `/b/deecuts`.

Only `DATABASE_URL`, `AUTH_SECRET` and `LINK_TOKEN_SECRET` are needed to run. Without Stripe,
Resend or Twilio keys the app still works end to end: deposits, fees, texts and emails are
**recorded rather than sent or charged**, and every screen that shows one of those rows says so.
That is deliberate — a ledger that quietly counts imaginary money is worse than no ledger.

Background work (reminders, the cadence scan and its nudges, waitlist expiry and cascade, the
weekly rent rollover, applying persisted Stripe events) runs in two interchangeable shapes:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" localhost:3058/api/cron/tick   # Vercel-shaped
npm run worker                                                             # long-lived host
```

Both call the same `runTick`, and each step takes a `job_leases` row first, so running both at
once is safe rather than a double-send. The cron route **refuses every request when
`CRON_SECRET` is unset** rather than defaulting to open.

Checks:

```bash
npm run typecheck
npm test          # domain logic: policy maths, cadence, availability, plans, rent, CSV
npm run craft     # the design and defect rules a type-checker cannot see
npm run build
```

## Differentiation

1. **The policy is the product.** Competitors have deposit *settings*; ChairFlow has a policy *engine* — the stylist's rules rendered as a page clients agree to at booking, referenced on every charge, versioned when it changes. The awkward conversation is replaced by "it's the policy you agreed to when you booked" — which is the actual job to be done.
2. **Cadence nudges beat marketing blasts.** Every incumbent offers campaigns; almost none compute per-client rhythm. "Marcus books every 3 weeks and is at week 5" is a revenue alarm, not a newsletter — and it's built from data the booking page generates automatically.
3. **The client book belongs to the stylist.** Booksy and StyleSeat sit between stylists and their clients (and monetize that seat). ChairFlow is infrastructure: the stylist's handle, their clients, their card-on-file relationships, exportable any day.
4. **The rent ledger recruits the shop.** Chair rent is tracked in texts and crumpled envelopes everywhere. A shared paid/unpaid ledger is cheap to build, loved by owners, and turns one stylist adoption into a 8-chair shop adoption.
5. **Priced for one chair.** $19 against GlossGenius/Booksy/Squire bundles — the renter pays for protection, not for a POS they'll never use.

## Go-to-Market Channels

1. **Instagram/TikTok, where stylists live:** the booking page IS the marketing surface (every stylist shares their link in bio); short-form content on the fee moment ("watch the no-show pay for itself") is inherently viral in the trade.
2. **SEO on the pain:** "no show policy for hair stylists," "booth renter booking app," "charge no show fee salon," "chair rent tracker" — high intent, thin incumbent content at the renter end.
3. **The no-show calculator lead magnet:** appointments/week x rate x average ticket = "you lost ~$460 last month" -> "Claim your booking page."
4. **Shop-owner channel:** the free-to-view rent ledger demo for owners; one owner brings 6-12 renters (the Shop plan's built-in distribution).
5. **Comparison pages:** vs Booksy, vs GlossGenius, vs StyleSeat, vs "DMs + a note in your phone" — the last one is the honest anchor.

## Competition

| Competitor | Pricing | Weaknesses |
|---|---|---|
| **GlossGenius** | [From $24/mo](https://www.goodcall.com/appointment-scheduling-software/glossgenius-vs-booksy) | Polished suite; validates the price band. Solo-renter fit diluted by POS/marketing bundle; policy/fee flow is a setting, not a system; no rent ledger. |
| **Booksy** | [$29.99/mo + $20/team member](https://glossgenius.com/blog/booksy-price) | Marketplace DNA — owns the client relationship, pushes discovery; deposits exist but the client book isn't really the stylist's; per-seat pricing punishes shops. |
| **Squire** | [$30-150/mo](https://www.goodcall.com/appointment-scheduling-software/booksy-vs-squire) | Barbershop-suite focus (POS, payroll, brand sites) priced for shops, not renters; heavy for a single chair. |
| **StyleSeat** | Free + client booking fees | Monetizes the stylist's own clients with booking fees; stylists resent it publicly; no policy engine or rent tracking. |
| **Acuity/Square Appointments** | ~$0-30/mo | Generic schedulers: card-on-file possible but policy/fee flow is manual, cadence nonexistent, nothing trade-specific. |
| **DMs + a notes app** | Free | The real competitor. Beaten by the first automatically-collected no-show fee and the client who rebooked from a nudge. |

## Key Risks

1. **Fee disputes and chargebacks.** Charging saved cards for no-shows invites disputes. Mitigation: explicit policy agreement at booking (timestamped, versioned, stored), fee receipts that quote the agreed policy, Stripe's dispute evidence auto-assembled from that record, deposit-first structure (holding money beats charging later), and one-tap waive to keep grace easy.
2. **SMS compliance (TCPA).** Reminders and nudges are texts to consumers. Mitigation: booking-flow consent capture, STOP honored globally, quiet hours, nudge caps (2 per cycle), 10DLC registration in Phase 0.
3. **Stripe Connect onboarding friction.** Independents abandon KYC flows. Mitigation: Express onboarding (Stripe's lightest), booking page works before payouts are live (deposits activate when Connect completes), and progress nudges in onboarding.
4. **Incumbent response.** GlossGenius/Booksy can sharpen deposit flows. Mitigation: stay the renter's tool — policy engine depth, cadence intelligence, the rent ledger, and a price point the bundles can't chase without cannibalizing.
5. **Churn among independents.** Stylists change shops, go on leave, quit the trade. Mitigation: the client book + cadence history as the stored value (export any day, but why leave?), pause plan state, and the shop ledger making ChairFlow the shop's default for the next renter.
6. **Marketplace-envy.** Some stylists want lead-gen we don't do. Mitigation: honest positioning ("we protect your book; we don't sell you clients") and the Instagram-link-in-bio motion as the acquisition story.

## Landing Page

Message architecture per MARKETING_PLAYBOOK.md (in this folder):

- **Enemy:** the 2:00 that didn't show — the unpaid hour with the chair rent still running.
- **One sentence:** the whole page proves *"The no-show that paid for itself."*
- **The device:** the flipped slot. A day-strip calendar slot labeled "2:00 — Marcus, fade $45" flips to NO-SHOW... and then the fee line writes itself into the ledger beneath: "no-show fee · per policy agreed Jun 12 · +$22.50". The chair got paid anyway. Hero, pricing, and OG image all reuse the slot-flip-to-ledger-line moment.
- **Proof beats:** a real (dogfood/design-partner, permissioned) protection ledger month ("$212 in fees + deposits kept"); the policy page a client actually agrees to; a cadence nudge and the rebooking it produced.
- **Objection killer:** "Charging regulars feels harsh." -> You don't charge them; the policy they agreed to does. Show the agreement moment at booking + the one-tap waive for grace.
- **One CTA phrase, used verbatim everywhere (hero, post-proof, post-pricing, sticky mobile bar):** **"Claim your booking page"**. De-risk line: free 14 days, your handle reserved in 60 seconds.
