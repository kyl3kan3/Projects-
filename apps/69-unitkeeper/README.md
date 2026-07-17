# UnitKeeper

**Management for small self-storage facilities — the unit map that runs itself, autopay that collects itself, and the lien clock that never miscounts.**

## The enemy

The index-card box behind the counter and the lien deadline computed
on a napkin. Single-owner storage facilities (50–400 units) run on
paper maps, cash-ledger notebooks, and gate codes in a spiral pad —
and the one process with real legal teeth, the lien sale, runs on
memory: statutory notice sequences, waiting periods, and publication
requirements that vary by state and void the sale (or worse) when
botched. The big-facility software (priced for REITs) is overkill;
the notebook is underkill. UnitKeeper kills both: a live unit map, 
autopay with a late ladder, and a lien timeline engine that counts
the days a court would count.

## Who pays

- Independent self-storage owners (50–400 units, often one facility,
  often one person).
- Small operators with 2–3 facilities; property managers running
  storage as a sideline.
- Tenants interact through move-in links and payment receipts.

## MVP feature list

1. **The unit map** — a drawable facility grid (rows of units with
   sizes); statuses at a glance: vacant / occupied / overdue /
   lien-stage / maintenance; click-through to the unit's file.
2. **Move-in flow** — from vacant unit: tenant info, rate, e-sign
   lease (state-appropriate self-storage lease template with the
   owner's terms), card/ACH on file, gate code issued, prorated
   first payment — ten minutes to a occupied unit.
3. **Autopay + late ladder** — monthly autopay on the saved method;
   failures walk the configured ladder (retry, late fee at day X,
   overlock flag at day Y) with every step logged and every fee on
   the tenant's ledger.
4. **The lien timeline engine** — per state: the statutory sequence
   (default notice → waiting period → published notice → sale date)
   computed from the delinquency date, each step with its legal
   citation, generated notices (certified-mail-ready PDFs), and
   hard stops ("do not proceed — the waiting period ends June 12").
5. **Tenant ledger** — every charge, payment, fee, and credit per
   unit; balance-forward statements; the paper trail a lien sale
   requires.
6. **Gate codes** — per-tenant codes tracked (issue/revoke on
   move-in/out/overlock); export for common keypad systems (CSV);
   no hardware integration in v1, stated honestly.
7. **Move-out flow** — final balance, prorate/refund math, unit back
   to vacant with a make-ready checklist.
8. **Occupancy + revenue view** — plain numbers: occupancy by size,
   monthly revenue, delinquency total; no dashboard theater.
9. **Rate management** — street rates by size, existing-tenant rate
   changes with required-notice letters generated.
10. **Exports** — everything CSV; the lien file (all notices +
    ledger) as one PDF packet per unit.

## Pricing

| Plan | Price | For |
|---|---|---|
| **Keeper** | **$59/mo** | Up to 100 units. Map, move-ins, autopay. |
| **Yard** | **$99/mo** | Up to 250 units, lien engine, gate exports. |
| **Depot** | **$149/mo** | Up to 400 units + multi-facility, priority support. |

14-day free trial, no card. Tenant payments ride the owner's own
Stripe account.

## Competitive landscape

The category leaders (SiteLink, storEDGE, Easy Storage Solutions,
Storable's stack) price and design for multi-facility operators and
REITs, with onboarding calls and contracts; newer entrants (Stora,
Storeganise) target unmanned facilities with per-unit pricing that
scales badly past 100 units. The wedge: flat pricing a single-owner
can predict, a ten-minute move-in, and the lien timeline engine with
citations and hard stops — the feature the notebook can never do and
the incumbents bury in modules.

## Landing page

- **Hero device:** "The lien clock that runs itself." — the unit map
  breathes (one unit flips overdue at day 6), the late ladder steps
  fire (fee, overlock flag), the lien timeline unrolls with statutory
  steps and the certified-mail notice generating, and the hard stop
  renders ("Sale eligible June 28 — not before"). Four beats, hold on
  the timeline.
- **The enemy, named:** the lien deadline computed on a napkin.
- **Receipts:** a real generated notice (demo data, labeled) and the
  citation line under each timeline step.
- **One CTA phrase, verbatim everywhere:** **"Start free — 14 days"**.
