# ListingLoop

**Transaction coordination for real-estate agents and TCs — every deadline on the contract, on one line, with the reminders already sent.**

## The enemy

The critical date that lived only in the contract PDF. A residential
deal carries a dozen deadlines — inspection objection, appraisal,
loan commitment, HOA docs, final walkthrough, closing — each derived
from the contract date by rules everyone recomputes by hand. Agents
run them from memory and sticky notes; TCs run fifteen deals from a
spreadsheet that doesn't know Saturdays exist. One missed objection
deadline is an earnest-money story nobody forgets. ListingLoop kills
the sticky note: the contract's dates become a computed timeline the
moment the deal opens, and every party gets reminded before every
date without anyone remembering anything.

## Who pays

- Transaction coordinators (independent TCs running 10–60 files).
- Producing agents and small teams who self-coordinate.
- Brokerage ops managers standardizing checklists across agents.

## MVP feature list

1. **Deal file** — property, parties (buyer/seller/agents/lender/
   title), contract dates, price, commission basis; status pipeline
   (active → pending items → clear to close → closed / terminated).
2. **Checklist templates** — per contract type (listing, buyer,
   dual, lease): tasks with owners, document requirements, and
   date rules.
3. **Critical-date engine** — dates derived from anchor dates by rule
   ("inspection objection = contract + 10 days, business days,
   holidays observed"); editing an anchor recomputes the chain with a
   diff preview before saving.
4. **Reminder fan-out** — each critical date notifies its owning
   parties (T-7/3/1, email; the agent chooses who sees what);
   exactly-once per date per offset.
5. **Document collection** — named placeholders per checklist
   ("Signed disclosure", "EMD receipt"); tokenized upload links for
   parties; version history; completeness bar per deal.
6. **Timeline view** — the deal as one horizontal line: every date, 
   met/upcoming/at-risk, the today marker; the whole pipeline as
   stacked lines on the TC dashboard.
7. **Commission tracker** — per-deal commission math (rate splits,
   referral fees, TC fee), pipeline totals by month of expected
   close.
8. **Party portal-lite** — tokenized read view for clients: what's
   done, what's next, what we need from you (upload link inline).
9. **Deal notes + activity log** — who did what when; the file's
   memory.
10. **Exports** — full file export (docs + checklist + dates) as a
    closing packet zip; anti-lock-in.

## Pricing

| Plan | Price | For |
|---|---|---|
| **Solo** | **$39/mo** | Up to 10 active deals. |
| **Desk** | **$69/mo** | Up to 30 active deals, templates, party portal. |
| **Office** | **$99/mo** | Unlimited deals, 5 users, commission reports. |

14-day free trial, no card. Per-company pricing; closed deals never
count against limits.

## Competitive landscape

Brokerage-mandated platforms (Dotloop, SkySlope, Transaction Desk)
own e-signature and compliance archiving but are famously joyless at
the coordination layer — dates live in form fields, not engines, and
TCs still run the real timeline in spreadsheets. TC-specific tools
(Open To Close, ListedKit) validate the niche with heavier setup
curves. ListingLoop's wedge is the critical-date engine with
business-day/holiday rules and diff-preview recompute — the piece
everyone recomputes by hand — wrapped in software an independent TC
can self-serve in an afternoon.

## Landing page

- **Hero device:** "Every deadline on the contract, on one line." — a
  contract date types in, the timeline unfurls left to right with
  eleven derived dates snapping into place, the inspection-objection
  date shifts as the anchor edits (diff ghosting), and the T-3
  reminder fires to three parties. Four beats, hold on the full
  timeline.
- **The enemy, named:** the critical date that lived only in the
  contract PDF.
- **Receipts:** a real recompute diff ("Appraisal moved May 2 → May 6
  — 2 holidays observed") and a reminder ledger row (demo data,
  labeled).
- **One CTA phrase, verbatim everywhere:** **"Start free — 14 days"**.
