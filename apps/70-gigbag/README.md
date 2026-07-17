# GigBag

**Business tools for working musicians and bands — gig confirmed, deposit in, setlist shared, everyone paid their split.**

## The enemy

The gig that existed only in a DM thread. Working musicians run five-
figure side businesses from screenshots: the date discussed on
Instagram, the fee agreed by text, no contract, no deposit, the
setlist re-typed the night before, the stage plot a photo of a napkin,
and the split settled in the parking lot from a Venmo balance nobody
reconciles. One double-booked Saturday or one stiffed fee pays for a
year of software. GigBag kills the DM thread: inquiry → hold →
confirmed with a contract and deposit, the setlist and stage plot
shared from the same place, and every member's split recorded when
the money lands.

## Who pays

- Gigging musicians and band leaders (cover bands, wedding bands,
  jazz combos, DJs+live hybrids) playing 2–15 dates a month.
- The band leader buys; members join free; bookers interact through
  links.

## MVP feature list (mobile app + small server)

1. **Gig pipeline** — inquiry → hold → confirmed → played → paid;
   the calendar view that prevents double-booked Saturdays (holds
   visibly conflict).
2. **Gig sheet** — everything one screen: venue, times (load-in/
   sound-check/downbeat), fee, contact, dress, parking note, the
   setlist and stage plot attached.
3. **Contracts + deposits** — a booking agreement from the gig sheet
   (the band's terms), e-signed on the booker's phone, deposit
   collected via Stripe (the band's own account); confirmed only
   when signed + deposited — the pipeline enforces the discipline.
4. **Setlists** — songs with keys/tempos/durations; drag to build a
   set; total set time computes live; duplicate and tweak per gig;
   share as a clean link (the drummer's music stand view).
5. **Stage plots** — a simple builder (drag members/amps/monitors on
   a stage grid) + input list; shared as one link the sound tech
   opens ("what the venue asked for, without the napkin").
6. **Payout splits** — per-gig split rules (equal, weighted, leader
   cut, fixed sideman rates); when the fee lands, each member's
   share is computed and recorded; settle-up view shows who's owed
   what across gigs (recorded, not moved — Venmo stays, arguments
   go).
7. **Member roster** — the band + subs with instruments and rates;
   per-gig lineups.
8. **Booker links** — the public gig-request page (date checker
   shows real availability) and per-gig confirm/sign/pay links; no
   booker accounts.
9. **Free tier** — solo: unlimited gigs, setlists, stage plots.
   **GigBag Band** ($12/mo via RevenueCat): contracts + deposits,
   splits, shared band calendar, member seats.
10. **Exports** — gigs/splits CSV for tax season; the year summary.

## Pricing

Freemium via RevenueCat:
- **Free (Solo)** — gigs, setlists, stage plots, one player.
- **GigBag Band** — **$12/mo** per band: contracts + deposits,
  payout splits, member seats, the shared calendar.

The deposit rides the band's own Stripe account — GigBag never
touches gig money.

## Competitive landscape

Band-management incumbents skew legacy web (BandHelper, Bandzoogle's
booking add-ons) or enterprise-agency (Gigwell, Prism for venues/
agencies); setlist apps (OnSong, BandHelper) do charts, not business.
Nothing owns the phone-first inquiry-to-paid pipeline with contracts,
deposits, and splits in one place at a hobbyist-affordable price.
GigBag's wedge is that pipeline — the four moments (confirm, deposit,
setlist, split) that turn a band into a business.

## Landing page (web + App Store copy share the device)

- **Hero device:** "Gig confirmed, deposit in, setlist shared." — an
  inquiry card flips to HOLD on the calendar, the contract signs on
  the booker's phone with the deposit landing, the setlist assembles
  (total time computing), and the split lines record as PAID. Four
  beats, hold on the paid splits.
- **The enemy, named:** the gig that existed only in a DM thread.
- **Receipts:** a real conflict warning ("Sept 14 already holds The
  Fairmont") and a computed split line (demo data, labeled).
- **One CTA phrase, verbatim everywhere:** **"Get GigBag free"**.
