# LensCRM

**The all-in-one CRM for photographers: lead capture, booking, contracts, invoicing, and client galleries in one $24/mo tool.**

---

## The Problem

A working photographer today runs their business across five or more disconnected tools:

- A **lead form** on their website (Squarespace form, Typeform, or a raw contact page)
- A **scheduler** (Calendly, Acuity) that knows nothing about the lead
- A **contract tool** (HelloSign, or worse, PDFs emailed back and forth)
- An **invoicing tool** (Wave, QuickBooks, PayPal invoices) that doesn't tie payments to sessions
- A **gallery/proofing platform** (Pixieset, Pic-Time, ShootProof) with its own client list

Every handoff between tools is manual: re-typing the client's email into the contract, remembering to send the invoice after the contract is signed, remembering to send the gallery link three weeks after the shoot. Photographers are artists first and admins reluctantly; dropped handoffs cost them bookings and make them look unprofessional to clients paying $3,000+ for a wedding.

The two dominant "solutions" both fall short:

- **HoneyBook** ($36+/mo) is a horizontal client-flow tool for all "independents" -- coaches, designers, event planners. It has no galleries, no proofing, no concept of a shoot type. Photographers still pay for Pixieset on top, landing at $60-80/mo total.
- **Pixieset** nails galleries but its Studio Manager CRM is an afterthought bolted onto a gallery product -- weak pipeline, weak automations, no real workflow engine.

Nobody owns the full lead-to-gallery lifecycle at a price a solo shooter accepts.

## Target User

- **Primary:** Solo photographers earning $20k-$150k/yr from photography -- wedding, portrait, family, newborn, and boudoir shooters who book 15-80 sessions a year and currently duct-tape 4-6 tools together.
- **Secondary:** Small studios (2-5 shooters) that need shared calendars, team seats, and per-shooter booking pages -- wedding studios and commercial/product studios.
- **Explicitly not targeting (at MVP):** large volume operations (school/sports photography), stock photographers, and hobbyists with zero paid sessions. Hobbyists churn; we filter for people with revenue.

The buyer is the photographer themselves. Purchase decisions are made in an evening, often triggered by a dropped lead or a Facebook group recommendation. There is no procurement, no sales call -- this is a self-serve, credit-card SaaS.

## Market & Profitability

Realistic framing, no hype:

- Vertical CRMs consistently outperform generic ones on conversion and retention because the product speaks the buyer's language (sessions, not "projects"; galleries, not "deliverables"). This pattern holds across verticals (Jobber for field services, Boulevard for salons) and is why Studio Ninja and Sprout Studio exist at all.
- The US alone has roughly 100k+ full-time professional photographers and several times that many part-time paid shooters. We do not need a large share: **$5k-$50k MRR is the realistic band** for this product. At a $30 blended ARPU, $50k MRR is ~1,650 paying accounts -- attainable but a multi-year grind in a crowded market, not a rocket ship.
- **Photographers are price-sensitive but consolidation-motivated.** They will not pay $80/mo for a CRM. They *will* pay $24-40/mo to cancel three other subscriptions totaling $60+. The pitch is a net monthly savings, not a new expense.
- **Seasonality matters.** Wedding photography books January-March (engagement season) and shoots May-October. Expect signup spikes in Q1, elevated churn risk in November-January when wedding shooters review expenses. Mitigations: annual plans discounted ~2 months free, and an off-season "archive mode" downgrade instead of cancellation. Family/portrait shooters (fall mini-session season) partially offset the curve.
- Gross margin is the one structural watch-item: galleries mean storage costs that scale with usage, not with seats. See "Key Risks" and ARCHITECTURE.md cost model. Storage quotas per tier exist to protect margin, not to upsell.

## Monetization & Pricing

Monthly subscription, self-serve, 14-day free trial (no credit card), annual = 10 months' price.

| | Solo -- $24/mo | Studio -- $40/mo | Pro -- $60/mo |
|---|---|---|---|
| Active clients | 100 | 500 | Unlimited |
| Gallery storage | 100 GB | 500 GB | 2 TB |
| Lead forms | 3 | 10 | Unlimited |
| Booking types | 3 | 10 | Unlimited |
| Email automations | 5 active | 20 active | Unlimited |
| Workflow templates | Included | Included | Included + custom builder |
| Team seats | 1 | 3 | 8 |
| Contract e-sign | Unlimited | Unlimited | Unlimited |
| Invoicing & deposits | Stripe fees only | Stripe fees only | Stripe fees only |
| Custom domain for galleries/booking | -- | Yes | Yes |
| Priority support | -- | -- | Yes |

Notes:
- We take **no cut of client payments** -- photographers pay only Stripe's fees. This is a deliberate wedge against HoneyBook (which monetizes payments) and a trust signal in Facebook-group word of mouth.
- Storage overage: $2/mo per additional 50 GB rather than forcing an upgrade. Keeps Solo users who shoot a lot from churning.
- Unlimited e-sign on every tier because metering contracts feels punitive and costs us almost nothing.

## MVP Feature List

- [ ] Account signup, auth, single-photographer workspace
- [ ] Lead capture forms: hosted form page + embeddable snippet, custom fields per shoot type, spam protection
- [ ] Lead inbox and pipeline (inquiry -> consult -> booked -> completed), manual lead entry
- [ ] Clients: contact records, session history, notes
- [ ] Booking types (e.g. "90-min family session", "wedding consult call") with duration, price, deposit %, buffer times
- [ ] Availability rules (weekly hours, blackout dates, min notice) + public booking page per photographer (cal-style)
- [ ] Sessions/bookings: calendar view, reschedule, cancel, timezone handling
- [ ] Contract templates with merge fields (client name, session date, package, price)
- [ ] Contract e-sign: click-to-sign with drawn/typed signature, IP + timestamp audit trail, signed PDF snapshot emailed to both parties
- [ ] Invoices: line items, taxes, due dates; **deposit-first flow** (e.g. 30% retainer to confirm booking, balance auto-invoiced N days before session) via Stripe
- [ ] Stripe webhook handling: payment confirmation updates booking status automatically
- [ ] Client galleries: upload originals to S3-compatible storage, background resize/watermark, password-protected gallery pages
- [ ] Proofing: client hearts/selects images, selection sets visible to photographer, per-image comments
- [ ] Gallery delivery: download originals (per-tier limits), expiring links
- [ ] Email automations: trigger-based sends (booking confirmed, shoot reminder T-48h, gallery delivered, gallery expiring soon) via Resend
- [ ] Workflow templates per shoot type: wedding, newborn, family, commercial -- each pre-wires forms, contract template, deposit %, and automation sequence
- [ ] Billing: Stripe subscription for the SaaS itself, plan limits enforcement

Explicitly **not** in MVP: mobile app, print/product sales, sales tax automation, bookkeeping/expense tracking, AI culling, multi-language.

## Differentiation

1. **All-in-one including galleries, cheaper than the combo.** HoneyBook ($36+) + Pixieset paid plan ($10-24) is $46-60/mo for the workflow photographers actually need. LensCRM Solo is $24. The comparison is concrete and does the selling in every "what CRM do you use?" thread.
2. **Shoot-type workflow templates.** A wedding has a 12-month arc (retainer, engagement session, timeline questionnaire, final balance, sneak peek, full gallery). A newborn shoot books within a 2-week birth window and delivers in days. A commercial job needs usage-rights language in the contract and net-30 invoicing. Generic tools make you build all of this; LensCRM ships it pre-wired per shoot type, editable. This is the "made for me" moment in the first session of the trial.
3. **Deposit-first invoicing as a first-class flow.** Booking isn't confirmed until the retainer clears -- the calendar hold, contract, and deposit invoice are one atomic flow, not three tools glued together. This is the single most common failure point in photographers' current stacks.
4. **No payment skim.** Stripe fees only, stated loudly.

What we do *not* claim: better galleries than Pixieset (theirs are excellent; ours are good enough and integrated), or a broader feature set than Sprout Studio (theirs is broader and heavier; ours is faster to adopt).

## Go-to-Market Channels

Ordered by expected cost-effectiveness:

1. **Photography Facebook groups.** Groups like "Wedding Photographers Community" and regional shooter groups (tens of thousands of members each) run daily "what do you use for contracts/CRM?" threads. Play: genuine participation + founder answers, not ads. Recruit 10-20 group-active photographers as free early users who answer those threads honestly.
2. **Reddit:** r/WeddingPhotography and r/photography. Same threads recur weekly. Participate as a builder ("I'm building this, here's a free year for feedback"), never astroturf -- these communities detect and punish it.
3. **YouTube photography educators / affiliates.** Channels teaching "how to run a photography business" (Taylor Jackson, Katelyn James-style educators, and dozens of mid-size channels) monetize via affiliate deals. Offer 30% recurring for 12 months. This is exactly how HoneyBook and Pixieset grew; the channel is proven, we compete on payout and product fit.
4. **SEO on high-intent keywords:** "HoneyBook alternative", "HoneyBook alternative for photographers", "Studio Ninja vs", "photography contract template", "wedding photography contract template", "photography invoice template". The template keywords feed the lead-magnet play below.
5. **Template lead magnets.** Free downloadable contract templates, pricing-guide templates, and client questionnaires (email-gated). Photographers hunt for these constantly; each download is a warm trial prospect who has already seen our contract editor.
6. **PPA / WPPI communities.** Professional Photographers of America (~30k members) and WPPI (the Vegas trade show) for credibility: a booth is expensive but a speaking slot or member discount partnership is not. Year-2 play, not launch play.

## Competition

| Competitor | Price | Strengths | Weaknesses we exploit |
|---|---|---|---|
| **HoneyBook** | ~$36+/mo (frequent first-year discounts) | Polished, well-funded, strong brand, payments built in | Generic (not photography-specific), **no galleries/proofing**, monetizes payments, price climbs after year-1 discount |
| **Studio Ninja** | ~$25-30/mo | Photography-specific, liked by users, good workflows | No native galleries (integrates out), aging UI, slower development since acquisition |
| **Pixieset (Suite)** | Free-$40+/mo across products | Best-in-class galleries, huge install base | CRM (Studio Manager) is shallow: weak pipeline, weak automations; full suite pricing adds up |
| **Iris Works** | ~$25-35/mo | Simple, photography-specific | Thin feature set, no galleries, small team, limited automation depth |
| **Dubsado** | ~$20-40/mo | Extremely flexible forms/workflows, loyal users | Generic, notorious learning curve ("takes a weekend to set up"), no galleries |
| **Sprout Studio** | ~$29-79/mo | Broadest all-in-one (incl. galleries, ordering) | Expensive at parity tiers, heavyweight/cluttered, slower onboarding |

Read of the field: the all-in-one *concept* is validated (Sprout Studio) but nobody delivers it at the $24 price point with modern UX and shoot-type templates. Our position: **Sprout's scope, Studio Ninja's focus, below HoneyBook's price.**

## Key Risks

1. **Crowded market with an entrenched, funded leader.** HoneyBook has raised nine figures and owns the "client flow" mindshare. Mitigation: never fight them head-on for "independents"; win the photographer-specific comparison threads where their genericness is a visible weakness. If they ship galleries, our moat narrows to templates + price -- watch for it.
2. **Gallery storage costs.** Storage is our only usage-scaled cost and photographers upload aggressively (a wedding is 50-100 GB of RAW... which we must refuse: JPEG-only delivery, quotas per tier, R2/S3 at ~$0.015/GB). A Solo user at full 100 GB quota costs ~$1.50/mo in storage against $24 revenue -- fine; the risk is quota-free growth or RAW support creeping in. See cost model in ARCHITECTURE.md.
3. **E-sign legal validity.** Click-to-sign is broadly enforceable under ESIGN/UETA (US) and eIDAS (EU) *if* we implement intent-to-sign, consent to electronic business, association of signature with record, and tamper-evident audit trails correctly. Cutting corners here creates real legal exposure for customers. Mitigation: audit-trail design reviewed by counsel before launch; store signed-document hashes; do not market it as "notarized" or overstate validity.
4. **Churn from hobbyists and seasonality.** Trial users with no paying clients churn within 90 days no matter what we build. Mitigations: qualify at onboarding ("how many paid sessions this year?"), aim marketing at working photographers, push annual billing, offer off-season archive mode instead of cancellation. Target: <4% monthly logo churn on annualized basis by month 12; if it runs above 6% the model does not work and we need to know early.
5. **Breadth trap.** Six features at MVP means six ways to be mediocre. Mitigation: ROADMAP.md sequences CRM+booking+invoicing to a high bar before galleries; templates make the breadth feel curated rather than sprawling.
