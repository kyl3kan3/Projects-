# PermitPath

**Permit intelligence for contractors working across multiple jurisdictions. Know what every building department requires -- and hear about rule changes before they become a $2,000 fine and a stopped job.**

## The Problem

The US has no permitting system; it has thousands of them. Shovels' national permit dataset counts more than 10,000 distinct building-permit jurisdictions, and broader counts of authorities having jurisdiction run closer to 20,000 (Shovels.ai). Each one decides for itself which permits an HVAC changeout or a panel upgrade needs, what the submittal package looks like, what it costs, how long review takes -- and each one changes those rules whenever it likes, usually announced as a PDF buried three clicks deep on a municipal website.

A contractor working in one city memorizes the rules. A contractor working across twelve jurisdictions lives in permanent low-grade dread:

1. **Requirements lookup is oral tradition.** "Call the building department" is the industry-standard API. Answers vary by which plan reviewer picks up.
2. **Rule changes arrive as fines.** A jurisdiction quietly starts requiring a load calc with every changeout; the contractor finds out via a rejected submittal, or worse, a red tag on a finished job. A stop-work order idles a crew that still gets paid; a Honolulu study put the cost of each additional day of permit delay at roughly $100-130 per project, and that is for projects that were merely *slow*, not stopped (Hawaii DBEDT, 2025).
3. **Expiry is invisible until it isn't.** Permits lapse 180 days after last inspection. Contractor licenses, trade registrations, and business licenses expire on their own calendars. Nobody owns the spreadsheet that tracks all of it.
4. **Every estimator re-derives the same knowledge.** The requirements for "residential re-roof in Mesa" get re-researched hundreds of times a week across the industry, because the knowledge evaporates the moment each job closes.

The information exists. It is just fragmented across thousands of websites, PDFs, and front-desk phone calls, with no change log.

## Target User

- **Primary:** general and specialty contractors with 2-50 employees who pull permits in multiple jurisdictions -- HVAC, electrical, plumbing, roofing companies covering a metro area and its dozens of suburbs. Big enough to eat real fines, too small for a permitting department.
- **Secondary:** solar and EV-charger installers (permitting is a named line item in their unit economics -- NREL puts permitting, inspection, and interconnection at roughly $1/W, about $7,000 on a typical residential system), pool builders, and permit expediters who sell this knowledge as a service.
- **Buyer profile:** the owner or operations manager who personally ate the last fine. They already pay for a field-service tool (ServiceTitan, Jobber, Housecall Pro) and will pay again for the one thing those tools don't touch: what the city actually requires.
- **Not a target (yet):** ENR-500 GCs with in-house permitting teams, new-construction developers (PermitFlow's turf), owner-builders and homeowners.

## Market & Profitability

An honest read of the niche, both halves:

- **Category economics:** the construction software market is large and still compounding -- roughly $7.7B in 2025 growing at ~10% a year (Grand View Research, 2025) -- but PermitPath's slice is a data business wearing a SaaS suit. Margins on serving the data are software margins; the real cost is keeping requirement records current, which is human curation plus crawling. That cost is a moat as much as a burden.
- **The data moat compounds.** Every curated jurisdiction, every crowdsourced correction, every "verified 11 days ago" stamp makes the database harder to replicate. Competitors can copy features in a quarter; they cannot copy three years of verified per-jurisdiction requirement history. Coverage begets users begets contributions begets coverage.
- **Realistic ceiling:** this is not venture scale at our price point. A realistic outcome is **$30k-$150k MRR over 2-4 years**: 200-900 customers at ~$150 blended ARPU, concentrated in the metros we cover deeply. The ceiling rises with coverage, which rises with time and discipline, not spend.
- **Why churn stays low:** the product accumulates the customer's own state (jobs, licenses, watched jurisdictions, expiry calendar). Leaving means going back to the phone and the spreadsheet -- and the next unannounced rule change lands on them, not us.

Expect: a grind of curation before the flywheel turns, and revenue concentrated where coverage is deep. Don't expect: national coverage in year one, or virality.

## Monetization & Pricing

Flat monthly tiers, metered on the things that scale with company size: users, active jobs, and jurisdictions watched.

| Plan | Price | Limits | Includes |
|---|---|---|---|
| **Crew** | $99/mo | 3 users, 15 active jobs, 5 jurisdictions watched | Requirement lookup, per-job permit checklists, application status tracking, license + permit expiry alerts |
| **Company** | $179/mo | 10 users, 50 active jobs, 20 jurisdictions watched | Everything in Crew + rule-change alerts on watched jurisdictions, inspection scheduling notes, team assignments, weekly digest |
| **Regional** | $249/mo | 25 users, unlimited jobs, 60 jurisdictions watched | Everything in Company + multi-license entity tracking, priority verification requests (we re-verify a record within 2 business days), CSV export, priority support |

Notes on the model:

- **The crowdsourcing flywheel is priced in:** accepted contributions (a corrected fee, a new submittal quirk, a confirmed timeline) earn account credit -- $10 per accepted edit, capped at 50% of the invoice. Customers become the field network that keeps the data fresh, and the credit is cheaper than the curation hours it replaces.
- **Annual = 2 months free.** Prepaid annual matters in a seasonal trade; invoice in January when trucks are idle.
- **No free tier.** The data costs real money to keep true, and a free tier attracts one-off lookups (homeowners, DIY) that consume curation while contributing nothing. The 14-day trial is scoped to the buyer's own jurisdictions, where the value is obvious or absent within a week.

## MVP Feature List

- [ ] Jurisdiction database: 50 hand-curated jurisdictions at launch (one metro, covered completely), with per-job-type requirement records: permits needed, submittal requirements, fees, review timelines, quirks
- [ ] Every requirement record carries a source link, version history, `verified_at` date, and verifier -- recency and provenance are UI, not metadata
- [ ] Per-job permit checklist generated from jurisdiction + job type, with per-item verification (the stamp)
- [ ] Job tracking: job sites, permit applications with status timeline (not submitted -> in review -> issued -> expired), notes
- [ ] Inspection scheduling notes per application (who to call, lead time, reinspection fee, quirks)
- [ ] License and credential vault with expiry dates; permits inherit expiry rules from their jurisdiction
- [ ] Expiry alerts: escalating email at T-60/T-30/T-7/T-1 for licenses, registrations, and issued permits
- [ ] Jurisdiction-page change detection: scheduled crawls of monitored source URLs, text diff, human review queue, versioned requirement update, alert to affected orgs
- [ ] Crowdsourced contributions: suggest-an-edit on any record, moderation queue, verification stamp + credit on acceptance
- [ ] Billing for PermitPath itself (Stripe Billing, the three plans above, annual discount)
- [ ] Admin curation console: record editor, source manager, diff review queue, contribution moderation

Post-MVP (explicitly cut from v1): direct e-submittal to municipal portals, public API, SMS alerts, plan-set review, national coverage promises, ServiceTitan/Jobber integrations, mobile apps (responsive web first).

## Differentiation

1. **Change detection as the headline, not the lookup.** Static requirement guides rot silently. PermitPath monitors the source pages, diffs them, human-reviews the diff, versions the record, and alerts every org watching that jurisdiction. The enemy is the unannounced rule change; we are the tripwire.
2. **Recency and provenance on every fact.** Every record shows "verified 11 days ago · source: City of Mesa Development Services" and its version history. Competitors and Google results assert; we timestamp. In a domain where wrong answers cost $2,000, the honesty is the feature.
3. **Crowdsourced verification with paid credits.** Nobody else pays the trades to keep municipal data true. Expediters and high-volume contractors become moderated field sensors, and the moat deepens with every accepted edit.
4. **Built for specialty trades, not new construction.** PermitFlow and Pulley chase developers and GCs on big builds. The HVAC changeout, the re-roof, the panel swap -- 40 permits a month, $200 each -- is an underserved, different product with different data.
5. **Expiry alerting across licenses AND permits in one calendar.** License tools ignore permits; permit tools ignore licenses. The contractor's actual risk surface is both, and the fine doesn't care which one lapsed.

## Go-to-Market Channels

In priority order:

1. **Programmatic SEO on the long tail.** "mesa az mechanical permit requirements," "does a water heater replacement need a permit in gilbert," times every jurisdiction times every trade -- a massive, high-intent, weakly-served keyword surface. Each covered jurisdiction ships a public teaser page (top-level answer + fee visible; checklist, quirks, and change history gated). The database *is* the content engine.
2. **Trade associations and licensing courses.** PHCC, ACCA, NECA/IEC chapters, state ROC continuing-education providers. Sponsor the compliance session; the speaker's horror stories are our landing page.
3. **Solar installer communities.** Permitting soft costs are an existential topic in residential solar; r/solar, SEIA state chapters, installer Slack groups. Our per-jurisdiction solar quirk data (interconnection notes included) is the wedge content.
4. **Permit expediter partnerships.** Expediters are power users and distribution: white-glove data access + a referral cut, and in exchange they contribute the highest-quality verifications in the system.
5. **Comparison and alternative pages.** "PermitFlow alternative for specialty contractors," "PermitPath vs calling the building department" (played straight, with the math). Incumbents have thin comparison content below the enterprise tier.
6. **Field-service tool marketplaces and communities.** ServiceTitan/Jobber user groups and Facebook contractor groups, where "anyone know if Chandler requires a permit for X" gets asked daily. Answer publicly, link the source page.

## Competition

| Competitor | Pricing | Weaknesses |
|---|---|---|
| **PermitFlow** | Venture-funded, quote-based (effectively $1k+/mo) | Built for developers/GCs on new construction; workflow tool with expediting services, not a requirements database. Overkill and overpriced for a 12-truck HVAC shop. |
| **Pulley** | Quote-based, upmarket | Permit workflow + expediting for architects/developers. Same upmarket gravity; no specialty-trade focus, no change-detection alerting. |
| **Shovels.ai** | Data/API plans, ~$100s/mo | Permit *records* analytics (who pulled what, where) for lead gen and market research -- descriptive, not prescriptive. Doesn't tell you what a job requires or that a rule changed. |
| **GreenLight / Symbium-style gov tools** | Sold to governments | Gov-side permitting UX for residents in the jurisdictions that adopt them. Adoption is jurisdiction-by-jurisdiction and slow; contractor sees a different tool per city, which is the problem restated. |
| **Municipal portals (Accela, Tyler)** | Free to applicants | The system of record for *submitting*, useless for *knowing*. Requirements live in PDFs and tribal knowledge around the portal; zero cross-jurisdiction view. |
| **Calling the building department + a spreadsheet** | Free (looks free) | The incumbent. 20 minutes on hold per question, answers that vary by clerk, a spreadsheet nobody updates, and zero warning when rules change. Our comparison page writes itself, in hold-music minutes. |

## Key Risks

1. **Data accuracy and liability.** Wrong information causes real fines and stopped jobs -- the exact harm we sell against. Mitigation: recency + source labels on every record, version history, conservative "verify before you submit" framing, terms that position us as research aid not code authority, E&O insurance, and a correction SLA (Regional tier: 2 business days). Never show a record without its verified-at date.
2. **Coverage cold-start.** 50 jurisdictions is a rounding error against 10,000+. Mitigation: depth-first -- own one metro completely so every contractor there gets full value, then expand along customer demand (waitlist votes decide the next metro). Sell coverage honestly on the pricing page: a map, not a promise.
3. **Crowdsource quality control.** Paid credits invite low-effort or self-serving edits. Mitigation: all contributions pass human moderation before publish, contributor reputation scoring, credits only on *accepted* edits, and spot re-verification of contributor-sourced records.
4. **Jurisdictions publish better portals.** Gov-side software (Symbium, Accela upgrades) slowly improves first-party UX. Mitigation: the cross-jurisdiction layer is the product -- one interface, one change log, one expiry calendar across every AHJ a contractor touches. Better municipal websites make our crawls easier, not our product obsolete.
5. **Crawl fragility and access.** Municipal sites are brittle, occasionally hostile to bots, and sometimes paper-only. Mitigation: polite crawling (identified user agent, low frequency), human curation as the fallback pipeline for uncrawlable jurisdictions, and never auto-publishing a diff without review.
6. **PermitFlow moves downmarket.** A funded competitor could ship a cheap specialty-trades tier. Mitigation: speed in the niche, the contribution network they'd have to bootstrap from zero, and pricing/positioning built for the 12-truck shop they'd have to re-learn. Accept the risk consciously: their incentives (venture returns) point upmarket.

## Setup

Requires Node 20+ and a Postgres database. Nothing else is mandatory: the app runs
without Stripe, without Resend, and without a Mapbox token, and says so on screen
wherever that changes what you see.

```bash
npm install
cp .env.example .env.local           # fill in DATABASE_URL and AUTH_SECRET
npm run db:migrate                   # applies drizzle/ against DATABASE_URL
npm run db:seed                      # the 50-jurisdiction launch corpus
npm run dev                          # http://localhost:3032
```

Then sign up. The trial is 14 days and starts immediately; watch a jurisdiction,
create a job, and the checklist is generated from the current requirement record and
pinned to that version.

To reach the curation console, grant yourself curator access after signing up:

```bash
npm run db:seed -- --curator=you@example.com
```

### What the corpus contains

`npm run db:seed` inserts the launch curation set: every incorporated city and town
in Maricopa County, the Pinal County communities the metro spills into, both
counties' unincorporated areas, the four tribal communities inside the valley, three
utility interconnection authorities, four fire districts, two county agencies and two
state authorities — 50 in all, with a verified requirement record for every job type
each of them covers, monitored source URLs, four version chains with real diffs, and
three crawl diffs waiting in the review queue. It is idempotent: re-running updates
jurisdiction metadata and never overwrites a record that already has a verifier's
name on it.

### Background work

Crawling monitored pages, diffing them into the review queue, planning the expiry
ladder and sending due alerts are one bounded pass, driven either by a cron-triggered
route or by a long-lived process:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3032/api/cron/tick
npm run worker      # the identical pass on an interval, for Railway/Fly
```

`vercel.json` schedules the route hourly (which needs a Vercel plan above Hobby —
Hobby runs cron once a day, which is fine for the expiry ladder and slow for a
72-hour crawl cycle). The route refuses every request when `CRON_SECRET` is unset
rather than defaulting to open: an open trigger here emails real contractors and
crawls other people's servers.

### Checks

```bash
npm run typecheck
npm test            # node:test via tsx, no test dependency
npm run build
```
