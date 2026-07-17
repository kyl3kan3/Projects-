# DispatchDeck

**The back office for owner-operator truckers — every load booked, delivered, invoiced, and factored before you park for the night.**

## The enemy

The milk crate of rate confirmations riding shotgun. Owner-operators run
$200k+ businesses from a cab: loads live in text threads, rate cons in a
camera roll, IFTA miles in a diary they reconstruct every quarter, and
invoices go out days late with the wrong paperwork attached — which is
exactly when factoring companies bounce them. The job pays by the mile;
the admin is unpaid overtime at a truck stop table. DispatchDeck kills
the milk crate: one load record from booked to paid, with the paperwork
packet assembled the moment the BOL is photographed.

## Who pays

- Owner-operators with their own authority (1 truck), running dry van,
  reefer, or flatbed spot freight.
- Micro-fleets (2–5 trucks) where a spouse or one dispatcher runs the
  office.
- The buyer is the driver-owner; the daily user is the driver in the cab
  and whoever does the books on Sunday.

## MVP feature list

1. **Load lifecycle** — booked → dispatched → at shipper → in transit →
   delivered → invoiced → paid, advanced from the cab in two taps; every
   load carries broker, lane, miles, rate, and accessorials.
2. **Rate-con intake** — forward the broker's email or snap the PDF; the
   parse worker drafts the load record (broker, rate, pickup/delivery,
   reference numbers) for one-tap confirmation. Parse fails honest: the
   PDF is attached either way and the load can be typed in 60 seconds.
3. **POD capture** — photograph the signed BOL at the receiver; it lands
   on the load, stamped and named properly.
4. **Invoice packets** — one tap renders invoice + rate con + BOL into a
   single PDF packet, emailed to the broker or the factoring company;
   packet completeness is checked before send (the bounce-killer).
5. **Factoring workflow** — per-load "factored" flag, schedule-of-
   accounts CSV export matching Triumph/RTS/OTR column formats, advance
   and reserve tracked against settlement.
6. **Detention clock** — arrived/loaded timestamps from the cab start a
   detention timer; past the free window it drafts the accessorial line
   at the load's per-hour rate with the timestamps as evidence.
7. **IFTA miles and fuel** — per-jurisdiction miles from odometer entries
   at state crossings (or leg entries), fuel receipts photographed and
   totaled per state; quarterly IFTA summary export.
8. **Settlement view** — the week's loads with revenue, fuel, factoring
   fees, and dispatch percentage; the honest per-mile number every
   owner-operator argues about.
9. **Broker book** — brokers with MC numbers, payment terms, contact,
   and history (average days-to-pay, computed from real payments only).
10. **Multi-truck** — micro-fleet plan adds trucks and drivers; the
    dispatcher sees the board, drivers see their own loads.

## Pricing

| Plan | Price | For |
|---|---|---|
| **Solo** | **$49/mo** | 1 truck. Loads, packets, detention, IFTA. |
| **Team** | **$99/mo** | Up to 3 trucks, dispatcher seat, factoring exports. |
| **Fleet** | **$149/mo** | Up to 5 trucks, driver seats, settlement reports per truck. |

14-day free trial, no card. Cancel-anytime; every record exports to CSV
and PDF — the anti-lock-in promise is on the pricing page.

## Competitive landscape

TMS software for small carriers clusters in two camps: full fleet TMS
(McLeod, Truckbase, Axon) priced and shaped for 10+ trucks with
dispatcher teams, and bookkeeping-first tools (TruckingOffice, Rigbooks,
TruckLogics) that treat the load as a ledger row, not a live object in
the cab. Factoring companies give away portals that only work with their
own factoring. DispatchDeck's wedge is the cab-first load lifecycle with
the paperwork packet as the product's spine: the phone in the cab is the
office. Nobody in the small-carrier camp does rate-con-to-packet in one
motion with detention evidence attached.

## Landing page

- **Hero device:** "The load delivered, invoiced, and factored by
  dinner." — a load card advances booked → delivered as timestamps
  stamp in, the BOL photo drops on, the packet PDF assembles page by
  page, and the status flips INVOICED with the factoring line beneath.
  Four beats, hold on the packet.
- **The enemy, named:** the milk crate of rate cons riding shotgun.
- **Receipts:** the packet-completeness check and a real detention line
  drafted from timestamps (marked as demo data — never fabricated
  customer numbers).
- **One CTA phrase, verbatim everywhere:** **"Start free — 14 days"**.
