# DuesDesk

**Operations for small HOAs, clubs, and leagues: dues invoicing with autopay, a real member roster, a violations and requests log with photo threads, and announcements that actually reach people -- so the volunteer treasurer stops chasing 40 checks a quarter.**

## The Problem

Most community associations are run by volunteers. The treasurer of a 60-home HOA -- an unpaid neighbor with a day job -- spends evenings mailing dues letters, matching paper checks to a spreadsheet, chasing the eleven households that always pay late, and forwarding complaint emails about the fence on Maple Street to a Gmail thread nobody can find later. The secretary keeps the roster in Excel; announcements go out through a BCC list that's missing a third of the street. Every board turnover, the whole apparatus is re-invented from whatever files the last volunteer remembers to hand over.

Professional management companies solve this at $10-25 per door per month plus contracts small associations can't justify. The software incumbents (AppFolio, Buildium, Vantaca) are built *for those management companies*, not for a self-managed board. So the actual stack for a small HOA, swim club, or rec league in 2026 is: Excel + a checkbook + Gmail + a Facebook group nobody agreed to join.

DuesDesk is the self-managed board's back office: dues invoicing with Stripe autopay, a roster that survives board turnover, a violations/requests log where every issue is a numbered thread with photos, and announcements delivered by email and SMS with delivery you can see.

## Target User

- **Primary:** self-managed homeowners associations and condo boards of 20-300 units -- the segment too small for professional management. The buyer is the treasurer or board president; the users are 3-7 volunteer board members.
- **Secondary:** swim/tennis/social clubs, youth sports leagues, civic associations -- same anatomy: members, dues, issues, announcements.
- **Buyer profile:** a volunteer who inherited a shoebox of records and a delinquency list. Motivated by hours returned and by defensibility ("show me where the board handled this fairly").
- **Not a target (yet):** professional management companies (AppFolio's market), associations needing full fund accounting/reserves management, or non-US payment rails.

## Market & Profitability

- **The base is huge and structurally underserved.** The Foundation for Community Association Research counts **~373,000 community associations in the US housing 78.1 million residents** -- nearly 1 in 4 Americans ([foundation.caionline.org](https://foundation.caionline.org/publications/factbook/statistical-review/), [natlawreview.com](https://natlawreview.com/press-releases/us-surpasses-373000-community-associations-housing-model-reaches-new-heights)). Industry estimates consistently put a large share of these -- especially small ones -- as self-managed, precisely the segment no incumbent designs for.
- **The alternative sets the anchor.** Professional management at $10-25/door/month means a 60-unit association weighs DuesDesk's $99/mo against $600-1,500/mo -- or against unpaid volunteer evenings. Both comparisons are easy.
- **Payments create a second revenue line:** dues flow through Stripe, and a modest platform fee on card/ACH volume (transparently passed or absorbed) scales with adoption without raising the subscription.
- **Realistic ceiling:** **$25k-$120k MRR** over 2-4 years (roughly 300-1,300 associations at ~$90 blended ARPU, plus payments margin). Churn is structurally low: the roster, ledger, and issue history are the association's institutional memory -- leaving means re-inventing it.
- **Margins:** email/SMS and storage are the variable costs; gross margin >90% on subscription revenue.

## Monetization & Pricing

Priced by member/unit count -- the honest scale axis. Board seats are always unlimited and free (volunteer boards rotate; per-seat pricing punishes governance).

| Plan | Price | Members/units | Includes |
|---|---|---|---|
| **Block** | $49/mo | up to 75 | Dues invoicing + autopay (card/ACH), member roster + household portal links, violations/requests log with photo threads, email announcements, delinquency view |
| **Neighborhood** | $99/mo | up to 200 | Everything in Block + SMS announcements, late-fee rules + payment plans, document library (bylaws, minutes), board roles/permissions, exports |
| **Community** | $199/mo | up to 500 | Everything in Neighborhood + multiple properties/sub-associations, API export, priority support |

Notes on the model:

- **Payment processing:** Stripe fees passed through at cost (ACH strongly nudged: ~$0.80 capped vs ~2.9% cards); an optional ~0.5% platform fee on card volume is the phase-2 revenue line once value is proven.
- **Annual = 2 months free**, aligned to HOA budget cycles (boards approve annual budgets; monthly line items get questioned).
- **No free tier.** An association's ledger should not live on an abandonable free plan; the $49 floor is a rounding error against any alternative.

## Setup

Requires Node 20+ and a Postgres database.

```bash
cp .env.example .env.local          # fill in DATABASE_URL, AUTH_SECRET,
                                    # PORTAL_TOKEN_SECRET, CRON_SECRET
npm install
npm run db:migrate                  # creates every table
npm run dev                         # http://localhost:3038
```

Open `/signup`, name the association, and the dues screen walks you through the
three setup steps in order: import the roster from a CSV, connect the
association's Stripe account, create the first assessment.

`DRY_RUN=1` is the default and it matters. Every email and text is logged instead
of sent and no card is charged, so you can rehearse a whole quarter — invoice run,
reminder ladder, announcements — against your real roster without a single message
leaving the building. Set `DRY_RUN=0` only when you mean it.

**Scheduled work.** One cron-triggered route, `/api/cron/tick`, does the invoice
runs, late fees, autopay charges and reminder ladder. It is protected by
`CRON_SECRET` and refuses to run when that is unset. `vercel.json` schedules it
daily, which is the right granularity for a product measured in days; every step
is idempotent, so firing it twice changes nothing and firing it late only delays.

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3038/api/cron/tick
```

**Without Stripe.** Set no Stripe keys and the association still works as a
ledger: invoices, paper-check recording, partial payments, late fees, aging
buckets, reminders, the issue log, announcements and documents. The member portal
says plainly that online payment is not switched on rather than offering a button
that fails.

**Without Cloudflare R2.** Issue photos and documents are written to
`LOCAL_STORAGE_DIR` and served from `/api/files` behind short-lived signed URLs,
which is the same contract R2's presigned GETs give. Use R2 in production: a
serverless filesystem is not persistent.

## MVP Feature List

- [x] Auth + association setup; board members with roles (president/treasurer/secretary/member)
- [x] Roster: households/members with units, contact info, mailing addresses, CSV import; join/leave history that survives board turnover
- [x] Member portal links: signed, no-password links (magic-link step-up before a payment method is stored) where a household sees its balance, pays, and files requests
- [x] Dues engine: assessment schedules (annual/quarterly/monthly, per-unit amounts), invoice generation, proration notes, one-off special assessments
- [x] Stripe payments: card + ACH via hosted checkout; autopay enrollment (saved payment method, charged on the due date); paper-check recording for the holdouts
- [x] Delinquency view: aging buckets (current/30/60/90+), automatic reminder sequence (gentle -> firm, board-configurable), late-fee application per policy
- [x] Violations/requests log: numbered issues (violation | maintenance request | architectural request), photo threads, status (open/in progress/resolved/closed), member-visible vs board-only notes, fair-process timeline
- [x] Announcements: compose once, deliver by email (all plans) and SMS (Neighborhood+) with per-message delivery status; recipients managed by roster segment
- [x] Document library: bylaws, CC&Rs, minutes, budgets -- versioned uploads with member visibility flags
- [x] Board dashboard: collected vs expected this period, delinquency total, open issues count, recent activity
- [x] Billing for DuesDesk itself (Stripe Billing, three tiers)

Two notes on how the built version differs from the line items above. Auth is
scrypt password hashing plus a signed JWT session cookie (`jose`), matching the
portfolio convention in the reference apps, rather than Auth.js — the session
shape is the same and an OAuth provider slots in beside it. Dues are charged as
**direct** charges on each association's connected account rather than destination
charges, because that is the only arrangement in which association money never
passes through a DuesDesk balance, which is the invariant ARCHITECTURE.md is
actually protecting.

Post-MVP (explicitly cut from v1): full fund accounting/reserves, vendor management + work orders, ballots/elections, ACH dues *payouts* to association-owned accounts beyond standard Stripe payouts, amenity reservations, national-association reporting packs.

## Differentiation

1. **Built for volunteers, not management companies.** AppFolio/Buildium/Vantaca sell to professional managers running hundreds of associations; their UX assumes a trained operator. DuesDesk assumes a treasurer with 45 minutes on a Tuesday night. Setup is an afternoon, not an implementation.
2. **Autopay kills the check-chase.** The wedge feature: once 70% of households are on ACH autopay, the treasurer's quarterly evening disappears. Everything in onboarding drives autopay enrollment (the portal link's first screen is "set up autopay").
3. **The issue log is institutional memory.** Violations handled in Gmail threads are legal exposure and neighbor drama; numbered issues with photo evidence, timestamps, and a fair-process timeline protect the board and outlive its members. Nobody else in the segment treats this as a first-class record.
4. **Board turnover is a feature scenario.** Role handoff, complete history, zero knowledge in anyone's inbox. "The next treasurer inherits a working system" is copy and architecture at once.
5. **Members never need accounts.** Portal links (magic-link secured) mean grandma pays her dues without creating a password. Member adoption friction is where community software dies; DuesDesk removes it.

## Go-to-Market Channels

In priority order:

1. **SEO on volunteer-treasurer pain.** "HOA dues collection," "self-managed HOA software," "HOA treasurer spreadsheet template," "HOA violation letter template," "swim club dues." High-intent, evergreen, weak incumbent content at the small end. Free templates (violation letters, budget spreadsheet, dues letter) as lead magnets.
2. **The board-turnover moment.** New-treasurer content ("just became HOA treasurer? read this") catches the exact week the pain peaks; annual-meeting season (Q4-Q1) is the campaign window.
3. **Communities where board volunteers already gather:** r/HOA, r/fuckHOA (genuinely -- it's full of board members venting), Nextdoor conversations, CAI-adjacent forums for small associations.
4. **Accountants and community-association attorneys** who advise small boards and are asked "what software should we use?" -- a referral kit and a clean books-export earns the recommendation.
5. **League/club networks:** youth sports governing bodies and swim-league directories reach thousands of volunteer-run organizations with the same anatomy.

## Competition

| Competitor | Pricing | Weaknesses |
|---|---|---|
| **AppFolio / Vantaca / CINC** | Enterprise, per-door, sales-led | Built and priced for management companies; a self-managed 60-unit board can't even get a demo. |
| **Buildium** | ~$58-375/mo | Property-management DNA (leases, tenants); HOA mode is an afterthought; complexity overwhelms volunteers. |
| **HOALife / HOA Express / ISN etc.** | ~$30-100/mo | Point tools: websites or violation-scan apps; none combine dues autopay + roster + issues + comms as one system of record. |
| **PayHOA** | ~$49-249/mo | The closest competitor -- validates the segment. Weaknesses: aging UX, weak issue/violation threading, upsell-heavy packaging; beatable on craft, autopay-first onboarding, and the fair-process log. |
| **TownSq** | Per-door, tied to Associa | Distribution tied to a management giant; not for self-managed boards. |
| **Excel + checkbook + Gmail** | Free | The real competitor. Beaten by the autopay enrollment moment ("the checks stopped") and by turnover-proof records. |

## Key Risks

1. **Volunteer sales cycles are slow and committee-shaped.** A board must vote. Mitigation: pilot-friendly onboarding (import the roster, run one quarter of dues), a "for board packets" one-page PDF the champion can circulate, and pricing under most boards' no-vote discretionary thresholds.
2. **Payments compliance and fund handling.** Association money must never touch our balance sheet. Mitigation: Stripe Connect (destination charges to the association's own Stripe account), no custodial flows, clear payout statements the treasurer can reconcile against the bank.
3. **PayHOA and adjacent incumbents respond.** The segment is validated, so competition is real. Mitigation: win on craft (the volunteer-grade UX bar), autopay-first onboarding, and the issue-log wedge nobody else takes seriously; avoid feature-race bloat that would erode the simplicity advantage.
4. **Legal sensitivity of violation records.** Violation processes are governed by state statutes and CC&Rs; bad tooling could embarrass a board. Mitigation: the log records and timelines -- it never auto-generates legal notices in v1; templates ship with plain "review your governing documents / counsel" language.
5. **SMS compliance (TCPA).** Announcements by SMS require consent management. Mitigation: per-member SMS opt-in state, STOP handling, 10DLC registration budgeted in Phase 0, email as the always-available fallback.
6. **Seasonal engagement.** Dues cycles are quarterly/annual; boards may only log in monthly. Mitigation: the issue log and announcements create weekly touch; monthly board digest emails ("collected $4,850 · 3 open issues") keep the value visible between cycles.
