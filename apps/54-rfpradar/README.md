# RFPRadar

**RFP and tender discovery plus a response workspace for agencies and B2B services firms: ingest workers poll SAM.gov and state procurement portals against your keyword profiles, relevance scoring surfaces the tenders worth reading, a deadline calendar keeps every date honest, go/no-go scorecards kill bad pursuits early, and a reusable answer library turns the next proposal from a blank page into an assembly.**

## The Problem

A 20-person IT services firm wins government and enterprise work through RFPs -- and finds them by accident. The relevant tender sits on a state procurement portal the firm didn't know existed, discovered eleven days into a twenty-day window via a partner's forward. The team then burns a week rewriting the same company boilerplate, past-performance blurbs, and team bios it wrote last quarter, because those live in seventeen old proposal PDFs on someone's drive. Half the pursuits should never have started: no incumbent intel, wrong contract vehicle, price-shaped evaluation -- but nobody asked the go/no-go questions until the sunk cost answered them.

The tooling splits around firms like this. Enterprise market-intelligence platforms (Deltek's GovWin IQ) cost more than a junior hire. Enterprise RFP-response suites (Loopio, Responsive) are priced for proposal teams of ten. The free option -- SAM.gov's own search plus a bookmark folder of state portals -- technically works and practically doesn't: no unified feed, no relevance filter, no memory.

RFPRadar is the small firm's capture desk: keyword profiles run against federal and state feeds every morning, scored matches with visible reasons, one deadline calendar across every pursuit, a five-question scorecard before anyone writes a word, and an answer library where the boilerplate, bios, and past answers live once and get reused forever.

## Target User

- **Primary:** agencies and B2B services firms of 5-50 people that respond to public-sector and enterprise RFPs -- IT services, engineering, marketing/creative, consulting, facilities, staffing. The buyer is a partner/BD lead; the users are the 2-10 people who touch proposals.
- **Secondary:** grant-adjacent consultancies and government-contracting newcomers priced out of GovWin.
- **Buyer profile:** someone who has lost a winnable tender to late discovery, and who can name the proposal they wrote from scratch twice. Motivated by pipeline coverage and by never rewriting the security-compliance answer again.
- **Not a target (yet):** large capture teams needing competitive intelligence (incumbent spend, agency budgets -- GovWin's moat), federal primes with dedicated proposal centers, or construction-bid takeoff workflows.

## Market & Profitability

- **The enterprise anchors are extreme.** Deltek's GovWin IQ -- the discovery incumbent -- has no public pricing, but reported buyer data through 2026 puts annual subscriptions at **roughly $13,000-$119,000, averaging around $29,000/year** ([civiciq.com](https://civiciq.com/blog/govwin-iq-pricing-2026), [fed-spend.com](https://fed-spend.com/blog/govwin-iq-pricing-2026-deltek-cost-alternatives)). On the response side, Loopio is quote-priced with a **median around $22,786/year and a typical range of $11,682-$55,704** ([sparrowgenie.com](https://www.sparrowgenie.com/blog/loopio-pricing), [vendr.com](https://www.vendr.com/buyer-guides/loopio)). A firm paying $199/mo for both jobs-to-be-done is paying ~1% of the incumbent stack.
- **The real anchor is one missed tender.** A single winnable RFP discovered too late is five or six figures of lost revenue; one doomed pursuit that a scorecard would have killed is a wasted proposal-week (~$5-15k of senior time). Both happen to the target firm every quarter.
- **The feeds are public and improving.** SAM.gov exposes opportunities via a documented public API, and most states run open procurement portals -- the raw material is free; the product is filtration, scoring, deadlines, and memory.
- **Realistic ceiling:** $25k-$100k MRR over 2-4 years (roughly 150-550 firms at ~$180 blended ARPU). Churn is dampened by the answer library: the firm's proposal memory lives here, and leaving means scattering it back into PDFs.
- **Margins:** ingestion compute and storage are the variable costs; gross margin >90%.

## Monetization & Pricing

Priced by seats in tiers -- the honest axis for a collaboration product. Every tier includes all discovery feeds; nobody pays extra to see a tender.

| Plan | Price | Seats | Includes |
|---|---|---|---|
| **Scout** | $99/mo | 2 | Keyword profiles, federal (SAM.gov) + state portal feeds, scored matches with reasons, deadline calendar + ICS feed, email/Slack morning scan |
| **Pursuit** | $199/mo | 5 | Everything in Scout + response workspace, answer library with staleness flags, go/no-go scorecards, pursuit stages + owner assignments |
| **Capture** | $299/mo | 10 | Everything in Pursuit + multi-profile portfolios, win/loss records + reporting, API/CSV export, priority support |

Notes on the model:

- **14-day free trial, no card** -- the trial is engineered so the first "we'd have missed this" match lands during it; that match closes the sale.
- **Annual = 2 months free**, aligned to firms' BD budget cycles.
- **No free tier.** The morning scan costs real ingestion compute per profile; $99 filters for firms with a real pipeline. The lead magnet (below) is the free taste.

## MVP Feature List

- [ ] Auth + firm workspace (Auth.js); seats with roles (admin/member), seat-limit enforcement per tier
- [ ] Keyword profiles: NAICS/PSC codes, keywords + negative keywords, agencies/states of interest, contract-size band; multiple profiles on Capture
- [ ] Ingestion workers: SAM.gov opportunities API polling (documented public API) + state portal connectors (launch set: 5 states via RSS/HTML/CSV feeds), normalized into one opportunities store, deduped by source + external id, re-poll detecting amendments and date changes
- [ ] Relevance scoring: profile x opportunity -> 0-100 with visible per-factor reasons (keyword hits, NAICS match, agency history, size band); no score without reasons; below-threshold matches suppressed, never deleted
- [ ] The morning scan: per-firm digest at 6am local -- new matches, changed deadlines, expiring pursuits -- by email and Slack webhook
- [ ] Deadline calendar: every date per opportunity/pursuit (questions due, proposal due, oral presentations); ICS feed per firm; T-7/T-3/T-1 reminders
- [ ] Go/no-go scorecards: configurable criteria (incumbent present? vehicle accessible? price-shaped? capacity? relationship?) scored 1-5 with a weighted verdict and a recorded decision -- the "no" is a first-class outcome
- [ ] Response workspace: pursuit stages (watching -> go/no-go -> drafting -> submitted -> won/lost), requirement checklist per RFP, owner + due-date per item
- [ ] Answer library: reusable blocks (boilerplate, past answers, team bios, past-performance blurbs) with tags, versioning, and staleness flags (>12 months unreviewed); link-and-snapshot into pursuits so library edits never rewrite submitted history
- [ ] Win/loss recording on close: outcome, value, debrief note -- feeding the library ("winning answer" flags) and reporting
- [ ] Billing (Stripe: three seat tiers, trial, seat-limit upgrade prompts)

Post-MVP (explicitly cut from v1): competitive intelligence (incumbent spend, agency budget forecasts -- GovWin's moat), AI proposal drafting, all-50-states coverage at launch (5 states + federal, expanding by demand), Canadian/EU portals, capture CRM features (contacts, call logs), teaming-partner marketplace.

## Differentiation

1. **Discovery and response in one $199 tool.** The incumbents split the job: GovWin finds (at $29k/yr average), Loopio assembles (at $22k/yr median). The 20-person firm needs both at 1% of that, and the data agrees -- the segment simply goes untooled.
2. **Scores with visible reasons.** Every match shows why ("NAICS 541512 exact · 'managed detection' in scope · Virginia · $250k-$1M band"). Black-box relevance dies at the second bad match; auditable relevance earns the morning-scan habit.
3. **The scorecard makes "no" cheap.** Nobody else in the segment treats go/no-go as a product surface. Recording the no -- with reasons, in ten minutes -- is the highest-ROI feature in proposal economics, and it produces the firm's first honest win-rate denominator.
4. **The library outlives every proposal.** Link-and-snapshot semantics (borrowed from proposal-team practice) mean submitted pursuits are immutable history while the library keeps improving. Staleness flags keep bios and certs from quietly rotting.
5. **Honest feeds, honestly aged.** Every opportunity shows its source and fetch time; portal outages surface as loud per-source status, never silent staleness -- the trust posture the portfolio's monitoring products share.

## Go-to-Market Channels

In priority order:

1. **SEO on the discovery moment:** "find government RFPs," "SAM.gov alternative," "state RFP search," "GovWin IQ pricing" (the sticker-shock query is the segment's front door), "go no go decision template," "RFP response template."
2. **The free lead magnet:** paste your NAICS + keywords -> five scored live tenders by email, no account -- the morning scan demonstrating itself once.
3. **Gov-contracting newcomer communities:** APTAC/PTAC advisor networks (now APEX Accelerators), r/GovernmentContracting, LinkedIn govcon creators, SBA programs -- where "how do I even find RFPs?" is asked daily.
4. **Agency/services communities:** agency-owner groups (Bureau of Digital, agency Slacks), consulting newsletters -- the enterprise-RFP half of the market.
5. **Referral loop via the scorecard:** the shared go/no-go PDF carries the mark; partners and teaming primes see it in every joint pursuit.

## Competition

| Competitor | Pricing | Weaknesses |
|---|---|---|
| **Deltek GovWin IQ** | No public pricing; reported ~$13k-$119k/yr, avg ~$29k ([civiciq.com](https://civiciq.com/blog/govwin-iq-pricing-2026)) | The discovery gold standard with analyst intel -- and priced like it. Sales-led, annual contracts, onboarding fees; the 20-person firm is not the customer. |
| **Loopio / Responsive** | Quote-based; Loopio median ~$22.8k/yr ([sparrowgenie.com](https://www.sparrowgenie.com/blog/loopio-pricing)) | Response-side only (no discovery); enterprise content-ops depth the small firm never uses; per-seat quotes start above the segment's whole budget. |
| **GovTribe / HigherGov / BidPrime etc.** | ~$40-500/mo tiers | Discovery-focused federal-data tools; thin-to-absent response workspace, no scorecards or answer library; federal-first with weaker state coverage. |
| **SAM.gov + state portals + spreadsheet** | Free | The real competitor. Beaten by the first 6am match the firm would have missed, and by the library that ends boilerplate archaeology. |

## Landing Page (message architecture)

- **Enemy:** the tender that got away -- found on day eleven of twenty, or never.
- **One sentence:** every relevant tender found at 6am, scored with reasons, and answered from a library instead of a blank page.
- **The device (used relentlessly -- hero, pricing, OG image, emails):** **"The tender you'd have missed, found at 6am."** Rendered as the morning scan assembling: the scan line stamping "3,412 notices scanned · 6:02 AM," one match sliding out with its fit score counting up and reasons unfolding, the deadline chip landing on the calendar.
- **Hero:** the machine running -- notices streaming past, the filter catching one, the score composing itself factor by factor. Claim above it: "Found at 6am. Scored by 6:01." De-risk line: "No card required."
- **The math:** one missed winnable tender (five figures minimum) vs $99/mo; GovWin's ~$29k/yr average + Loopio's ~$22k/yr median vs $199/mo for both jobs; one killed doomed pursuit = a proposal-week returned.
- **Objection killer:** "Another feed to ignore" -- the scan shows its reasons and its restraint: below-threshold matches are suppressed, and a no-new-matches morning says so in one line. Relevance you can audit is relevance you can trust.
- **Receipts (Law 5, never fabricated):** live scored matches from the public SAM.gov feed with real notice ids and timestamps, clearly framed -- the product's own output, never invented logos or win rates.
- **One CTA phrase, verbatim everywhere** (hero / post-proof / post-pricing / sticky mobile bar): **"Start free — 14 days"**.

## Key Risks

1. **State portal fragility.** Fifty different portals, formats, and terms of use; feeds break and formats drift. Mitigation: launch with federal (documented API) + 5 states chosen for feed quality; per-source health status surfaced honestly; connector framework designed for cheap additions; respect each portal's robots/ToS -- public-notice data is public by statute, and politeness keeps access durable.
2. **Relevance quality is the product.** Bad scores kill the 6am habit in a week. Mitigation: reasons-first scoring (auditable), negative keywords, per-firm threshold tuning, a one-tap "not relevant -- why?" loop feeding profile suggestions; measured precision on design-partner firms before launch.
3. **GovWin/HigherGov move downmarket.** Mitigation: the wedge is the combined discovery + scorecard + library at a self-serve price; enterprise vendors' sales economics resist $199/mo; win the segment's communities before they look down.
4. **Answer-library trust.** Firms hesitate to centralize proposal content. Mitigation: link-and-snapshot immutability, per-block permissions, export-everything-anytime (the anti-lock-in promise is the lock-in), SOC2 on the growth-phase roadmap.
5. **Seasonal/cyclical pipelines.** Government fiscal-year rhythms concentrate RFP volume. Mitigation: annual pricing aligned to BD budgets; the library and win/loss history keep value alive between cycles; enterprise-RFP coverage smooths the curve.
