# TipTally

**Tip pooling for restaurants — the pool no one argues about, because every server can see the math.**

## The enemy

The manager's midnight spreadsheet and the shift-drink argument it
causes. Pooled houses split tips by points, roles, and hours — and the
math lives in a spreadsheet one manager understands, computed after
close, disputed at the next shift ("why did I get less than Dana?").
Errors compound into payroll corrections; opacity curdles into
turnover; and tip-pooling law (who may participate, tip-credit rules)
is one bad Google search away from a wage claim. TipTally kills the
midnight spreadsheet: the rules are set once, the shift's numbers
import from the POS, every participant sees their own line computed,
and payroll gets a clean export.

## Who pays

- Independent full-service restaurants and small groups (1–10
  locations) running pooled or tip-share houses.
- The GM/owner buys; managers close shifts; staff view their
  transparency page.

## MVP feature list

1. **Pool rules engine** — points by role (server 10, bartender 8,
   busser 5…), hours-weighting on/off, multi-pool support (FOH pool +
   bar pool), tip-share percentages (e.g., 3% of food sales to
   bussers), effective-dated rule versions.
2. **Shift imports** — CSV from Toast/Square/Clover exports (tips by
   server, hours by employee); column mapping saved per source;
   manual entry fallback.
3. **The shift close** — manager reviews imported numbers, resolves
   flags (unmatched employees, missing clock-outs), closes the shift;
   the engine computes every participant's share.
4. **Shown math** — every share renders its full derivation: points ×
   hours → weight → percentage → dollars, line by line. The number is
   never a black box — this is the product.
5. **Staff transparency page** — tokenized link per employee: their
   shifts, their shares, the math for each; no login.
6. **Dispute window** — staff can flag a share within 48h with a note;
   flags queue for the manager with the math attached; resolutions
   logged.
7. **Payroll export** — per-period CSV in Gusto/ADP/Paychex import
   formats (tips as earnings codes); period lock after export.
8. **Compliance notes** — plain-language state notes surfaced where
   relevant ("In your state, managers may not participate in the
   pool"; tip-credit vs. full-minimum states) — written guidance, not
   legal advice, sourced and dated.
9. **Rule change history** — every rule version effective-dated and
   archived; past shifts always recompute against the rules of their
   day.
10. **Exports** — everything CSV; the anti-lock-in promise.

## Pricing

| Plan | Price | For |
|---|---|---|
| **House** | **$49/mo** | 1 location, 2 pools, unlimited staff. |
| **Group** | **$89/mo** | Up to 3 locations, dispute workflow, payroll formats. |
| **Hospitality** | **$129/mo** | Up to 10 locations, rule libraries, priority support. |

14-day free trial, no card. Per-location pricing that undercuts
payroll-suite add-ons.

## Competitive landscape

Tip-management exists mostly as payout rails: Kickfin and Tipsee move
money to debit cards instantly (charging per-transaction), 7shifts and
Toast bundle basic tip-out inside scheduling/POS suites. The
computation-and-transparency layer — rules, shown math, disputes,
effective-dated history — is an afterthought everywhere. TipTally's
wedge: it doesn't move money (no money-transmitter burden, works with
any payroll); it makes the split correct and visible, which is the
part staff actually fight about.

## Landing page

- **Hero device:** "The tip pool no one argues about." — a shift's
  numbers import ($1,842 pool), the rules apply visibly (points ×
  hours cascading), four staff lines compute with their math expanded,
  and one server's transparency page renders on a phone with her
  derivation. Four beats, hold on the shown math.
- **The enemy, named:** the manager's midnight spreadsheet.
- **Receipts:** a real derivation line ("10 pts × 6.5h = 65 → 22.4% →
  $412.61") and a resolved dispute (demo data, labeled).
- **One CTA phrase, verbatim everywhere:** **"Start free — 14 days"**.
