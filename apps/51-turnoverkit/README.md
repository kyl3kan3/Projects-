# TurnoverKit

**Short-term-rental turnover operations for hosts with 2-20 units: iCal sync from Airbnb/VRBO auto-schedules cleaners between stays, cleaners work photo-verified room-by-room checklists on their phones, damage and lost items get logged with photos, consumables get tracked per unit -- and the host sees every door's turnover status before the next guest lands.**

## The Problem

A host with six short-term rentals runs a small logistics company and doesn't know it. Every booking change on Airbnb or VRBO silently moves a cleaning window; the host relays it by text. The cleaner says "done" and the host takes it on faith -- until a guest checks into a unit with a stripped bed, or leaves a 3-star review over a hair in the shower that a photo would have caught. Damage discovered two guests later can't be claimed against anyone. Nobody knows which unit is down to its last two toilet-paper rolls until a guest messages at 9pm.

The tools at the ends of the market don't fit. Enterprise operations platforms (Breezeway) are priced and designed for property managers running 50-500 doors. Cleaner-marketplace tools (Turno) solve scheduling but treat quality verification, damage evidence, and restock as afterthoughts. So the actual stack for a 6-unit host in 2026 is: the Airbnb calendar + a group text with two cleaners + trust.

TurnoverKit is the operations layer for exactly this host: calendars sync themselves into a turnover schedule, every turnover is a photo-verified room-by-room checklist the cleaner works on their phone, every problem becomes a timestamped photo record, and the dashboard answers the only question that matters at 2pm on changeover day: **is every unit guest-ready before check-in?**

## Target User

- **Primary:** independent short-term-rental hosts and hosting couples with 2-20 units on Airbnb/VRBO -- large enough that turnovers collide, too small for enterprise ops platforms. The buyer is the host; the daily users are the host plus 1-6 cleaners.
- **Secondary:** small co-hosting operators managing units for owner clients (the photo record doubles as client reporting), and boutique cabin/cottage operators with direct bookings (any iCal feed works).
- **Buyer profile:** self-managing operator who fields the "is the cabin clean?" anxiety personally. Motivated by review scores, damage-claim evidence windows, and never driving 40 minutes to check a unit.
- **Not a target (yet):** professional property-management companies (Breezeway's market), hotels, or cleaner-side marketplaces (we don't source cleaners; hosts bring their own).

## Market & Profitability

- **The segment is large and self-managed.** The small-portfolio host is the bulk of the STR market by operator count, and the incumbent tooling splits around them: Turno anchors the low end at roughly **$8/property/month (about $6 on annual)** with a free single-property plan ([turno.com/pricing](https://turno.com/pricing/)), while Breezeway's operations platform starts around **$19.99/unit/month with volume discounts at 5+ properties** and is sold toward professional managers ([breezeway.io/breezeway-pricing](https://www.breezeway.io/breezeway-pricing)).
- **The anchor isn't software -- it's one bad turnover.** One cleanliness-driven bad review suppresses a listing's ranking and nightly rate; one unclaimable damage incident can cost more than a year of TurnoverKit's top tier. $39/mo against a 10-unit operation grossing $25-40k/mo is a rounding error.
- **Realistic ceiling:** $20k-$80k MRR over 2-3 years (roughly 600-2,200 hosts at ~$35 blended ARPU). Churn is dampened by accumulated records: the photo history, damage log, and per-unit restock baselines are the host's operating memory.
- **Margins:** photo storage is the main variable cost (R2 at pennies per unit-month); gross margin >90%.

## Monetization & Pricing

Priced by unit count -- the honest scale axis. Cleaner seats are always unlimited and free (charging per cleaner punishes exactly the coordination the product exists to create).

| Plan | Price | Units | Includes |
|---|---|---|---|
| **Solo** | $19/mo | up to 5 | iCal sync (Airbnb/VRBO/direct), auto-scheduled turnovers, photo-verified checklists, cleaner phone links, damage/lost-item log, host dashboard |
| **Host** | $39/mo | up to 12 | Everything in Solo + restock tracking with low-stock alerts, checklist templates per unit type, cleaner performance history, guest-ready reports (shareable PDF) |
| **Operator** | $59/mo | up to 20 | Everything in Host + multi-property groups, owner-client report exports, priority support |

Notes on the model:

- **14-day free trial, no card** -- the trial is engineered so the host's first photo-verified turnover happens in week one; that artifact closes the sale.
- **Annual = 2 months free.** Hosts think in seasons; annual billing lands before peak season.
- **No free tier.** A single-unit host is Turno's free market, not ours; the 2+ unit host with colliding turnovers is where the pain starts and $19 is below any argument.

## MVP Feature List

- [ ] Auth + host workspace (Auth.js); units with address, access notes, photos
- [ ] iCal ingestion: per-unit feed URLs (Airbnb/VRBO/anything), 15-minute sync worker, booking diff detection (new/moved/cancelled stays)
- [ ] Turnover auto-scheduling: a checkout-to-checkin gap becomes a turnover with a working window; changes re-flow automatically and notify the assigned cleaner
- [ ] Cleaner assignment: default cleaner per unit, per-turnover override, cleaner notified by SMS/email with a tokenized job link (no app install, no password)
- [ ] Photo-verified checklists: room-by-room templates (bedroom, bath, kitchen, exterior), each room requiring N verification photos; progress saves offline-tolerantly on the cleaner's phone
- [ ] Damage & lost-item log: cleaner or host files an entry with photos, unit, turnover, and category (damage | lost item | maintenance); entries are timestamped and exportable for platform claims
- [ ] Restock tracking: consumables per unit (TP, soap, coffee, linens) with par levels; cleaner taps counts at the end of each turnover; low-stock alerts to the host
- [ ] Host dashboard: today's board -- every unit's next check-in, turnover status (scheduled / in progress / verified / blocked), and the photo strip per completed turnover
- [ ] Turnover record: immutable completed-turnover page (photos, checklist, times, cleaner, issues filed) -- the "photographed clean" artifact
- [ ] Billing (Stripe: three tiers by unit count, trial, upgrade prompts at unit limits)

Post-MVP (explicitly cut from v1): cleaner marketplace/sourcing, dynamic cleaner payouts, guest messaging, smart-lock integrations, PMS (channel manager) API integrations beyond iCal, inspection scoring/AI photo grading.

## Differentiation

1. **Verification, not just scheduling.** Turno schedules cleaners; TurnoverKit proves the clean. The photo-verified room record is the product's spine -- every turnover produces evidence a host can act on (reviews, claims, cleaner coaching).
2. **Sized and priced for 2-20 units.** Breezeway assumes an ops team and per-door enterprise pricing; TurnoverKit assumes one host on a phone between school pickups. Setup is an afternoon: paste iCal URLs, pick a cleaner, done.
3. **Cleaners never install anything.** Tokenized job links open a phone-first checklist in the browser. Cleaner adoption friction is where turnover software dies; we remove it the way DuesDesk removed member accounts.
4. **The damage log is claim-grade.** Timestamped, photo-attached, tied to a specific turnover and stay window -- exactly what Airbnb's resolution process asks for and what a group text can never reconstruct.
5. **Restock is tied to the turnover, not a separate app.** Counts happen where the cleaner already is; par levels turn "we're out of coffee" guest messages into a Tuesday alert instead.

## Go-to-Market Channels

In priority order:

1. **SEO on host operations pain:** "airbnb cleaning checklist," "airbnb turnover schedule template," "str cleaning checklist pdf," "airbnb damage claim evidence." Free artifacts (printable room-by-room checklist, damage-claim evidence template) as lead magnets that demonstrate the product's own format.
2. **Host communities:** r/airbnb_hosts, r/ShortTermRentals, Facebook host groups, local STR alliance groups -- where "my cleaner said it was done" horror stories are a weekly genre.
3. **STR podcasts and YouTube hosts** (the self-managing-host content economy is large and sponsorship-cheap at this stage).
4. **Cleaner-led referral:** cleaners who like the checklist format bring their other host clients; the job link footer is the loop.
5. **Co-host networks and STR bookkeeping/CPA adjacents** who advise small hosts on operations.

## Competition

| Competitor | Pricing | Weaknesses |
|---|---|---|
| **Turno (TurnoverBnB)** | ~$8/property/mo (~$6 annual); free for one property ([turno.com/pricing](https://turno.com/pricing/)) | The scheduling incumbent and marketplace -- validates auto-scheduling from iCal. Weak on verification: checklists and photos exist but are not the spine; no restock pars; damage flow is thin. Beatable on proof-of-clean craft. |
| **Breezeway** | Operations from ~$19.99/unit/mo, volume discounts 5+ ([breezeway.io/breezeway-pricing](https://www.breezeway.io/breezeway-pricing)) | Excellent and enterprise-shaped: sales-led onboarding, add-on pricing (messaging, guides), designed for professional PM teams. A 6-unit host is not who it's for. |
| **Properly / ResortCleaning / Operto Teams** | Varies, PM-oriented | Remote-inspection and PM-team tools; setup burden and pricing aimed above the self-managing host. |
| **The group text + Airbnb calendar** | Free | The real competitor. Beaten the first time a booking moves and the schedule re-flows itself, and the first time a photo record settles a "was it clean?" dispute. |

## Landing Page (message architecture)

- **Enemy:** taking "it's done" on faith -- the unverifiable turnover between two guests.
- **One sentence:** every unit photographed clean, scheduled automatically, before the next guest lands.
- **The device (used relentlessly -- hero, pricing, OG image, emails):** **"The turnover photographed clean before the next guest lands."** Rendered as a completed turnover record assembling itself: the photo strip filling room by room, the checklist ticking, the unit's board tile flipping to VERIFIED with the next check-in time beneath it.
- **Hero:** the machine running -- a booking moves on the Airbnb calendar, the turnover re-flows, the cleaner's photos land, the tile flips to VERIFIED. Claim above it: "Photographed clean. Every unit. Every turnover." De-risk line: "No card required."
- **The math:** one cleanliness-driven bad review vs $39/mo; one unclaimable damage incident vs a year of the top tier; the 40-minute drive to check a unit vs opening the board.
- **Objection killer:** "My cleaners won't use an app" -- they don't install one. A text-message link opens the checklist; the first photo is the onboarding.
- **Receipts (Law 5, never fabricated):** our own dogfooded turnover records, clearly framed ("From our own 3-unit test portfolio"), until permissioned host case studies exist.
- **One CTA phrase, verbatim everywhere** (hero / post-proof / post-pricing / sticky mobile bar): **"Start free — 14 days"**.

## Key Risks

1. **iCal is a blunt instrument.** Feeds lag (Airbnb refreshes intermittently) and carry no guest details. Mitigation: sync every 15 minutes, surface feed-age honestly per unit ("calendar as of 12 min ago"), design flows to need only stay boundaries; PMS API integrations are the growth-phase answer.
2. **Cleaner compliance is the adoption cliff.** If cleaners skip photos, the product's promise dies. Mitigation: room gating (can't complete a room without its photos), checklist UX faster than texting "done," and cleaner history that makes good work visible to the host.
3. **Turno moves upmarket into verification.** Mitigation: stay the verification-first product; win on the turnover record artifact and host-side dashboard craft; avoid competing on cleaner marketplace.
4. **Photo storage costs and abuse.** Mitigation: client-side compression before signed PUTs, per-plan storage policy, R2's zero-egress pricing.
5. **Seasonality churn.** Vacation-market hosts may pause off-season. Mitigation: annual pricing landing pre-season, cheap Solo tier to park on, records-retention framing (cancelling deletes nothing for 12 months, but leaving means losing the operating memory).
