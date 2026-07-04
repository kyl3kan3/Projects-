# GrantGrid

**Grant pipeline for small nonprofits: curated discovery with fit scoring, a deadline calendar, an application workspace with a reusable answer library, and award reminders — so a two-person team runs grants like a development office.**

## The Problem

A small nonprofit's grant program is one overworked ED or program director, a bookmarked list of funder sites, and a spreadsheet named `GRANTS 2026 FINAL v3`. The failure modes repeat everywhere:

1. **Discovery is random.** New funders are found by gossip and Google; the org applies to long-shot national foundations while the community foundation two towns over goes unnoticed.
2. **Deadlines slip.** LOI dates, full-application dates, and report dates live in three inboxes. A missed report deadline quietly disqualifies the org from renewal — the cheapest money in fundraising.
3. **Every application starts from zero.** Mission statement, program descriptions, budget tables, board list, EIN, 501(c)(3) letter — retyped and re-hunted for every single funder portal.
4. **Institutional memory walks out the door.** When the ED leaves, the entire grants history — who funded what, what was promised, what worked — leaves too.

The enterprise tools that solve this are priced for organizations with a development *department*. The orgs that need it most — the ~$100k-$3M budget nonprofits — are priced out and living in the spreadsheet.

## Target User

- **Primary:** small US nonprofits ($100k-$3M annual budget) with grant revenue and no dedicated grants manager — the ED, a program director, or a part-time development person runs the pipeline.
- **Secondary:** freelance grant writers and consultants managing pipelines for 3-10 client orgs (a natural multi-org plan later).
- **Buyer profile:** mission-driven, budget-anxious, allergic to enterprise sales calls. Buys self-serve when the price reads like a utility bill, cancels tools that don't visibly pay for themselves. One won $10k grant justifies a decade of GrantGrid.
- **Not a target (yet):** universities, hospitals, grantmakers (the other side of the table), government-grant-heavy orgs needing grants.gov compliance workflows.

## Market & Profitability

- **The audience is enormous and underserved.** There are [~1.8-1.9 million registered nonprofits in the US](https://learning.candid.org/number-of-nonprofits-in-us/272665), the overwhelming majority small; nonprofit tech is a classic low-competition vertical — big enough to build in, unglamorous enough that funded startups skip it.
- **The money being chased is real and growing:** [US charitable giving hit $592.5B in 2024, with foundation grantmaking topping $100B for the third straight year](https://givingusa.org/giving-usa-2025-u-s-charitable-giving-grew-to-592-50-billion-in-2024-lifted-by-stock-market-gains/).
- **The category is proven and priced high above us:** grant management software is a [$2.6B market growing ~11%/yr](https://www.mordorintelligence.com/industry-reports/grant-management-software-market), and the seeker-side leader [Instrumentl starts at $299/mo](https://www.instrumentl.com/pricing) — a price umbrella that leaves the entire sub-$3M-budget segment exposed.
- **Category economics:** a curated dataset + workflow SaaS at 85-90% gross margin. Churn risk is seasonal (grant cycles), but the answer library and grants history create real switching costs — the product becomes the org's institutional memory. Realistic outcome: **$15k-$75k MRR** (200-800 orgs at ~$80-95 blended ARPU) over 2-4 years.

## Monetization & Pricing

Priced per organization (not per seat — small teams share logins anyway; fighting it is hostile). Tiered by pipeline size and discovery depth.

| Plan | Price | Fit | Includes |
|---|---|---|---|
| **Seed** | $59/mo | getting organized | Pipeline + deadline calendar, answer library, award/report reminders, 25 tracked grants, 3 users |
| **Grow** | $99/mo | actively applying | Everything in Seed + curated discovery feed with fit scoring, unlimited tracked grants, application workspace, 10 users |
| **Field** | $199/mo | consultants & multi-program orgs | Everything in Grow + 3 organizations, shared answer libraries, CSV/board-report exports, priority support |

14-day free trial; annual = 2 months free (nonprofits budget annually — push it). Discounted "micro" pricing decision (sub-$100k orgs) deferred until support costs are known.

## MVP Feature List

- [ ] Grant pipeline board: stages (Researching -> LOI -> Applying -> Submitted -> Awarded/Declined -> Reporting), amounts, owners, notes
- [ ] Deadline calendar: LOI, application, report, and renewal dates per grant; week/month views; ICS feed subscription
- [ ] Reminder engine: email nudges at T-14/T-7/T-1 for every dated obligation, including post-award report dates (the renewal-saver)
- [ ] Curated grant discovery: structured database of foundation + corporate + community funders (seeded from IRS 990/990-PF data + manual curation), filterable by geography, cause area, and grant size
- [ ] Fit scoring: 0-100 per funder against the org's profile (geography match, cause alignment, typical grant size vs ask, funds-new-grantees signal), always shown with its reasons — never a black box
- [ ] Organization profile: mission, programs, budget band, service geography, EIN — feeds fit scoring and the answer library
- [ ] Answer library: reusable blocks (mission boilerplate short/long, program descriptions, budget tables, board list, key attachments like the 501(c)(3) letter) with copy-with-one-click and per-block "last updated" staleness flags
- [ ] Application workspace: per-grant checklist of required materials mapped to answer-library blocks; draft answers assembled per funder
- [ ] Award tracking: amount, restrictions, report schedule auto-added to the calendar
- [ ] Billing (Stripe, three plans, trial)

Post-MVP (explicitly cut from v1): AI answer drafting, grants.gov/federal workflows, funder CRM emails, document e-signature, board portal, Instrumentl-style funder financial deep-dives.

## Differentiation

1. **Priced for the org the market abandoned.** $59-199/mo against Instrumentl's $299+ entry. The wedge is not a lighter product philosophy — it's the same jobs (find, track, reuse, remember) without the enterprise research bells.
2. **Fit scoring with reasons.** Every score decomposes into visible factors ("Funds youth programs in Ohio: yes · Typical grant $5-25k: matches your ask · New grantees: 38% of recent awards"). Trustable beats impressive in this audience.
3. **The answer library is the moat.** Discovery gets them in; the library of polished, versioned, staleness-flagged answers is why they never leave. Competitors treat reuse as a nice-to-have; here it is a headline feature.
4. **Reporting deadlines are first-class.** Most tools stop at "Submitted." GrantGrid treats the post-award report date as the most valuable reminder in the product — renewals are the cheapest grant dollars that exist.
5. **Built for the two-person shop.** No seats to count, no admin console, no training webinar required. Set up in an afternoon.

## Go-to-Market Channels

1. **SEO on practitioner keywords:** "grant tracking spreadsheet template," "grants for small nonprofits in [state]," "grant calendar template," "how to find foundation grants." The spreadsheet-template queries are the exact moment of pain; free templates as lead magnets that upsell the tool.
2. **State nonprofit associations:** most US states have one, with newsletters, webinars, and member-discount programs hungry for member value. Cheap sponsorships, precise audience.
3. **Grant-writer communities:** Facebook groups, r/nonprofit, r/grantwriting, Grant Professionals Association chapters; freelance grant writers are both users (Field tier) and a referral channel (20% recurring).
4. **The free fit-check:** paste your mission + state, get 5 plausible funders with fit reasons, emailed. Converts the "is there money out there for us?" curiosity moment.
5. **Content partnerships:** guest posts and webinars with fiscal sponsors, nonprofit accountants, and capacity-building consultancies who advise exactly this segment.

## Competition

| Competitor | Pricing | Weaknesses |
|---|---|---|
| **Instrumentl** | $299-999+/mo | The category leader and the price umbrella. Excellent research depth small orgs don't need at a price they can't pay. |
| **GrantStation / Foundation Directory (Candid)** | ~$199-$2k+/yr | Databases, not pipelines: search then export to your spreadsheet. Dated UX; no workspace, reminders, or answer reuse. |
| **Submittable / SurveyMonkey Apply** | Enterprise | Grantmaker-side tools; irrelevant to seekers but absorb the category's search traffic. |
| **Grant-writing AI tools (Grantable, etc.)** | ~$20-100/mo | Drafting-only; no discovery, pipeline, or reporting spine. Complementary more than competitive — a future integration. |
| **The spreadsheet + Google Calendar** | Free | The real incumbent. Beaten by missed-deadline stories, the fit-scored discovery feed, and the answer library's time math (hours per application, visibly saved). |

## Key Risks

1. **Data curation is a grind.** The discovery database's quality *is* the product's credibility; 990 data is stale and messy, and funder websites change. Mitigation: start narrow and deep (3-5 states or 2-3 cause areas at launch), show data freshness on every record, in-app "report a change" loop, and a curation pipeline that mixes automated 990 ingestion with human review hours budgeted weekly.
2. **Seasonal engagement -> churn.** Orgs between grant cycles stop logging in. Mitigation: the calendar + report reminders keep firing year-round (post-award is the off-cycle hook), monthly "pipeline health" digest, and annual billing pushed hard.
3. **Instrumentl moves down-market.** They could ship a $99 tier tomorrow. Mitigation: stay structurally cheaper (curated-not-exhaustive data), own the small-org brand and the state-association channel, and keep the answer library ahead — it's workflow, not data, and harder to bolt on credibly.
4. **Fit scores create liability for trust.** A bad recommendation wastes a small org's scarcest resource. Mitigation: reasons always shown, conservative confidence bands, "long shot" labeling, and no score at all when profile data is too thin.
5. **Nonprofit price sensitivity + support load.** This buyer emails support before reading docs. Mitigation: self-serve onboarding with real sample data, a plain-English help center, and community office hours instead of 1:1 calls.
