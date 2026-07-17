# CoopClass

**Operations for homeschool co-ops — registration night without the folding-table chaos, and the compliance binder that keeps itself.**

## The enemy

Registration night at the folding tables: three volunteers, one shared
spreadsheet, families queueing for classes that filled an hour ago,
sibling discounts computed on a calculator, and a binder of background-
check expiry dates nobody has opened since fall. Homeschool co-ops
(50–500 families, volunteer-run) run real schools on tools built for
bake sales. CoopClass kills the folding table: catalog, capacity,
prerequisites, payments, and the compliance binder in one place a
volunteer administrator can actually run.

## Who pays

- Co-op directors/boards (the buyer — usually a parent volunteer).
- Weekly enrichment co-ops, classical communities, hybrid academies.
- Families interact through registration and the weekly digest; they
  never pay CoopClass directly.

## MVP feature list

1. **Class catalog** — terms, periods, rooms, teachers; classes with
   descriptions, grade bands, capacity, fees, and prerequisites.
2. **Registration windows** — opening times per family tier (returning
   families first is co-op law), live capacity, waitlists with position
   shown honestly.
3. **Family accounts** — parents, students with grade levels, emergency
   contacts; one registration flow for all siblings.
4. **Conflict-proof scheduling** — a student can't be in two rooms in
   one period; a room can't host two classes; the engine blocks at
   registration time, not on the first morning.
5. **Fees + sibling discounts** — per-class fees, family caps, sibling
   rules; one Stripe checkout per family per term; payment plans
   (deposit + monthly) supported.
6. **Background-check binder** — per-volunteer check records with
   expiry dates; the dashboard shows who lapses before term end; expiry
   chasing emails run themselves.
7. **Weekly digest** — enrolled-family email compiled per family:
   schedule changes, room moves, teacher notes, upcoming dates.
8. **Attendance-lite** — per-class roster check-off for the co-ops
   whose insurance requires it; exportable.
9. **Roster + room views** — per-period grid (who's where), per-class
   rosters with allergy/emergency flags for teachers.
10. **Exports** — every roster, ledger, and check record to CSV; the
    anti-lock-in promise.

## Pricing

| Plan | Price | For |
|---|---|---|
| **Gathering** | **$29/mo** | Up to 75 families. Catalog, registration, payments. |
| **Community** | **$59/mo** | Up to 250 families, waitlists, payment plans, digest. |
| **Academy** | **$99/mo** | Unlimited families, background-check binder, attendance, priority support. |

Billed to the co-op (most pass it through as a small family fee).
Summer-off pricing: co-ops pause June–August at $9/mo, keeping data.

## Competitive landscape

Co-ops today run on a patchwork: Homeschool-Life and Homeschool Manager
(dated interfaces, feature-everything sprawl), Jackrabbit Class (built
for dance studios, priced per-student in ways that sting volunteer
budgets), or raw Google Forms + spreadsheets. None treat the
registration-night rush, sibling pricing, and the background-check
binder as the product's spine. CoopClass's wedge is being shaped
exactly for the volunteer administrator: opinionated defaults, one
screen per job, and a compliance binder the insurance audit can read.

## Landing page

- **Hero device:** "Registration night without the folding-table
  chaos." — a registration clock hits 7:00pm, three family cards flow
  through the same class list simultaneously, capacities tick down
  8/12 → 11/12, one class fills and flips its waitlist on, and the
  Hernandez family's four siblings land in four conflict-free periods
  with the sibling discount computing in the footer. Four beats, hold
  on the settled schedule.
- **The enemy, named:** the shared spreadsheet at the folding table.
- **Receipts:** a real conflict block ("Noah is already in Room 4 that
  period") and the discount math shown line by line (demo data,
  labeled).
- **One CTA phrase, verbatim everywhere:** **"Start free — 14 days"**.
