# FleetSnap

**Driver vehicle inspection reports (DVIRs) and maintenance tracking for small fleets of 5-50 vehicles: drivers tap through a 90-second pre-trip with photo capture on their phones, defects open maintenance tickets automatically, every vehicle carries its full service history, and compliance exports are one tap -- so the clipboard on the dashboard finally retires.**

## The Problem

A landscaping company with twelve trucks runs a transportation operation and staffs it with nobody. Pre-trip inspections -- required by FMCSA regulation for CDL vehicles and demanded by every insurer after the first claim -- happen on a paper clipboard if they happen at all. The forms live in a glovebox until they're coffee-stained pulp. A driver writes "brakes soft" on Tuesday; the office never sees it; on Friday the truck is on the shoulder and the repair costs four figures plus a lost crew-day. When the DOT audit or the insurance adjuster asks for inspection records, the answer is a shoebox.

The software built for this problem is built for someone else. Telematics platforms (Samsara, Motive) bundle inspections into enterprise hardware contracts. Fleet-management suites price per vehicle and assume a fleet manager exists to operate them. The owner of a plumbing company with nine vans has no fleet manager -- the owner IS the fleet manager, from a phone, between jobs.

FleetSnap is DVIR and maintenance for exactly this fleet: a mobile-first PWA where the driver's pre-trip takes 90 seconds with photos, a defect becomes a maintenance ticket the moment it's tapped, service history and odometer-based reminders live per vehicle, and a compliance-ready PDF export answers the audit in minutes, not weekends.

## Target User

- **Primary:** owner-operated service fleets of 5-50 vehicles -- landscaping, plumbing, HVAC, electrical, local delivery, construction subs. The buyer is the owner or operations lead; the daily users are drivers and whoever books repairs.
- **Secondary:** small non-profit and municipal fleets (parks departments, meal delivery) with the same anatomy and even less staff.
- **Buyer profile:** an operator who has had, or fears, the roadside breakdown / failed audit / denied claim. Motivated by uptime, insurance posture, and never re-typing a paper form.
- **Not a target (yet):** long-haul trucking (ELD/HOS territory), fleets already on telematics-bundled inspections, or fleets over ~50 vehicles with dedicated fleet managers.

## Market & Profitability

- **The incumbent anchor is per-vehicle pricing.** Fleetio -- the category's software benchmark -- runs about **$4-10 per vehicle per month on annual plans with a 5-vehicle minimum** ([fleetio.com/pricing](https://www.fleetio.com/pricing)), which means a 30-vehicle fleet is doing per-seat math every time it grows. Whip Around, the inspection-first competitor, sells **tiered per-asset plans (with an unlimited-asset flat option) and leans on demos rather than public prices** ([whiparound.com](https://whiparound.com/alternatives-fleetio/)). FleetSnap's flat tiers ($99/$199/$299 by fleet size) remove the per-vehicle meter entirely -- a price the owner can approve without a spreadsheet.
- **The real anchor is a breakdown.** One preventable roadside failure costs a tow, a repair at emergency rates, and a crew-day of lost revenue -- routinely $1,500-3,000 for a service fleet. One insurance claim denied for missing inspection records costs far more. $199/mo against a 20-truck operation is invisible.
- **Compliance is a ratchet, not a fad.** FMCSA's DVIR requirement (49 CFR 396.11) applies to CDL vehicles, and insurers increasingly demand documented inspection programs for any commercial fleet -- the segment's paper habit is a liability someone eventually forces them to fix.
- **Realistic ceiling:** $25k-$90k MRR over 2-3 years (roughly 150-500 fleets at ~$175 blended ARPU). Churn is dampened by accumulated records: service history, defect trails, and compliance archives are the fleet's institutional memory.
- **Margins:** photo storage and SMS are the variable costs; gross margin >90%.

## Monetization & Pricing

Flat tiers by fleet size -- no per-vehicle meter, no per-seat math. Driver seats are always unlimited and free (charging per driver punishes exactly the compliance the product exists to create).

| Plan | Price | Vehicles | Includes |
|---|---|---|---|
| **Crew** | $99/mo | up to 15 | Pre/post-trip inspections with photo capture, defect-to-ticket automation, service history per vehicle, odometer-based reminders, FMCSA-format PDF exports |
| **Fleet** | $199/mo | up to 30 | Everything in Crew + custom inspection templates per vehicle class, work-order assignment + vendor notes, cost tracking per vehicle, scheduled compliance report emails |
| **Depot** | $299/mo | up to 50 | Everything in Fleet + multi-yard grouping, CSV/API export, priority support |

Notes on the model:

- **14-day free trial, no card** -- the trial is engineered so the fleet's first photo-documented defect-to-repair loop closes in week one; that artifact sells the renewal.
- **Annual = 2 months free.** Fleets budget annually; the invoice lands as an operating line, not a subscription.
- **No free tier.** A 3-vehicle operation can live on paper; at 5+ vehicles the paper breaks, and $99 is below any argument the owner will have with themselves.

## MVP Feature List

- [ ] Auth + fleet workspace (Auth.js); vehicles with unit number, VIN, plate, class (truck/van/trailer/equipment), photo, status (active/in shop/retired)
- [ ] Driver roster: name + phone; drivers get tokenized links (SMS) to their inspection flow -- no app store, no password
- [ ] Inspection templates: per vehicle class, ordered item groups (walkaround, engine bay, in-cab, trailer); each item pass/fail/NA with photo required on fail; FMCSA-standard default template shipped
- [ ] Pre/post-trip inspection flow (PWA, phone-first): tap through items, photo capture on defects, odometer entry with sanity check against last reading, signature, offline-tolerant draft that syncs when coverage returns
- [ ] Defect -> ticket automation: any failed item opens a maintenance ticket with the photo, item, vehicle, and driver attached; critical defects (brakes, steering, lights, tires) flag the vehicle OUT OF SERVICE pending review
- [ ] Work orders: ticket triage (open / scheduled / in shop / resolved), vendor/shop note, cost entry, resolution closes the loop back to the originating defect and inspection
- [ ] Service history per vehicle: work orders + logged services (oil, tires, brakes) on one timeline with odometer stamps
- [ ] Odometer-based service reminders: per vehicle rules ("oil every 5,000 mi or 6 months"), computed from inspection odometer entries; due/overdue surfaced on the fleet board and in a weekly email
- [ ] Fleet board: every vehicle's tile -- last inspection, open defects, out-of-service flags, next service due
- [ ] Compliance exports: per-vehicle or fleet-wide DVIR PDF (FMCSA-format: vehicle, driver, date, items, defects, signatures, mechanic certification line) for any date range
- [ ] Billing (Stripe: three flat tiers, trial, vehicle-limit upgrade prompts)

Post-MVP (explicitly cut from v1): telematics/GPS integration, fuel cards and fuel tracking, ELD/HOS anything, parts inventory, purchase orders, driver scorecards, native app-store apps (the PWA is the app).

## Differentiation

1. **90 seconds, honestly.** The entire driver flow is engineered against a stopwatch: big tap targets, one screen per item group, photos only on failure, odometer as the single typed field. Incumbent inspection apps average minutes and feel like forms; FleetSnap feels like a walkaround.
2. **Flat pricing kills the per-vehicle meter.** Fleetio and Whip Around price per asset; FleetSnap prices like the owner budgets -- one number. Adding truck #16 is an upgrade prompt once, not a monthly tax forever.
3. **Defects become tickets by themselves.** The paper clipboard's fatal flaw is that "brakes soft" never travels. In FleetSnap the failed item IS the ticket -- photo attached, vehicle flagged, office notified before the driver leaves the yard.
4. **Drivers never install anything.** A tokenized SMS link opens the inspection PWA in the browser. Driver adoption friction is where fleet software dies; we remove it the way TurnoverKit removed cleaner accounts.
5. **The audit answer is one tap.** Every inspection is archived in FMCSA DVIR format with photos and signatures; the date-range PDF export turns the DOT audit or insurance request from a weekend into a download.

## Go-to-Market Channels

In priority order:

1. **SEO on compliance and breakdown pain:** "DVIR app," "pre trip inspection app," "vehicle inspection form PDF," "fleet maintenance spreadsheet," "DOT audit checklist." Free artifacts (printable FMCSA-format inspection form, fleet maintenance log template) as lead magnets in the product's own format.
2. **Trade communities:** landscaping and contractor Facebook groups, r/Landscaping business threads, r/Plumbing, LawnSite and similar forums -- where breakdown horror stories and "what do you use for maintenance?" threads recur weekly.
3. **Commercial insurance agents and brokers** who tell every fleet client to "document your inspections" -- a referral kit plus the compliance PDF earns the recommendation.
4. **Truck upfitters, commercial dealers, and independent repair shops** that touch small fleets at purchase and repair moments.
5. **Trade-association newsletters and podcasts** (NALP, PHCC locals) -- sponsorship-cheap at this stage.

## Competition

| Competitor | Pricing | Weaknesses |
|---|---|---|
| **Fleetio** | ~$4-10/vehicle/mo (annual), 5-vehicle minimum ([fleetio.com/pricing](https://www.fleetio.com/pricing)) | The category benchmark -- validates the segment. Full fleet-management suite: deep, but assumes an operator; small fleets pay for modules they never open. Per-vehicle pricing meters growth. |
| **Whip Around** | Tiered per-asset plans; unlimited-asset flat option; demo-led ([whiparound.com](https://whiparound.com/alternatives-fleetio/)) | Inspection-first and closest in spirit. Demo-led sales and per-asset tiers add friction for a 9-van plumber; maintenance side is thinner than its inspection side. |
| **Samsara / Motive** | Enterprise telematics contracts, per-vehicle + hardware | Inspections bundled into GPS/ELD platforms; contract minimums and hardware installs are wrong-sized for owner-operated fleets. |
| **Simply Fleet / FleetRabbit and budget apps** | ~$2-5/vehicle/mo tiers | Cheap per-vehicle tools; thin defect-to-ticket automation, weak compliance exports, little US-format DVIR rigor. |
| **The paper clipboard** | Free | The real competitor. Beaten the first time a defect photo becomes a ticket before the truck leaves the yard, and the first audit answered with a PDF instead of a shoebox. |

## Landing Page (message architecture)

- **Enemy:** the clipboard -- the inspection that gets pencil-whipped, lost in a glovebox, and can't testify when the brakes fail or the auditor calls.
- **One sentence:** every truck inspected in 90 seconds, every defect a ticket, every record one tap from the auditor.
- **The device (used relentlessly -- hero, pricing, OG image, emails):** **"The pre-trip that takes 90 seconds, not a clipboard."** Rendered as a stopwatch running beside the inspection flow: items ticking, one photo landing on a failed item, the ticket opening itself, ROADWORTHY stamping at 1:28.
- **Hero:** the machine running -- a driver's thumb tapping through the walkaround, a cracked-mirror photo landing, the maintenance ticket appearing on the office board in the same beat. Claim above it: "Inspected. Ticketed. On the road." De-risk line: "No card required."
- **The math:** one roadside breakdown ($1,500-3,000 with the lost crew-day) vs $199/mo; the per-vehicle meter at 30 vehicles vs one flat number; the DOT audit weekend vs a download.
- **Objection killer:** "My drivers won't use an app" -- they don't install one. A text-message link opens the walkaround; the first pre-trip is the training.
- **Receipts (Law 5, never fabricated):** our own dogfooded inspections on our own vehicles, clearly framed, until permissioned fleet case studies exist.
- **One CTA phrase, verbatim everywhere** (hero / post-proof / post-pricing / sticky mobile bar): **"Start free — 14 days"**.

## Key Risks

1. **Driver compliance is the adoption cliff.** If drivers pencil-whip taps the way they pencil-whipped paper, the records are theater. Mitigation: photo requirements on failures, odometer sanity checks, timestamps + geolocation stamps (transparent to the fleet), and a flow genuinely faster than paper -- speed is the compliance strategy.
2. **"Compliance-ready" is a legal claim.** DVIR formats and retention rules are regulated (49 CFR 396.11) and vary by vehicle class. Mitigation: ship the FMCSA-standard template verbatim, state plainly which vehicles the rule covers, never market legal advice; the export mirrors the paper form auditors already accept.
3. **Incumbents bundle downmarket.** Fleetio or Whip Around could chase the flat-price small fleet. Mitigation: stay the 90-second, flat-price, zero-install product; win on driver-flow craft and the defect-to-ticket loop; avoid suite bloat.
4. **Offline reality.** Yards and job sites have dead zones; a lost inspection destroys trust permanently. Mitigation: offline-first drafts in the PWA (local persistence, background sync), explicit "synced" confirmation, never a silent drop.
5. **Photo storage costs.** Mitigation: client-side compression before signed PUTs, retention tiers per plan, R2's zero-egress pricing.
