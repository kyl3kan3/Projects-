# BidBoard

**Subcontractor bid management for small general contractors: invite subs by trade, collect bids through a no-login portal, level them side by side, award and notify -- without the midnight spreadsheet.**

## The Problem

A small GC bidding a $2M project needs numbers from 8-15 trades. Today that means: blast emails from a personal address, attach a plans link, chase non-responders by phone, receive bids as PDFs/emails/texts in a dozen formats, and then -- the night before the owner meeting -- retype every line item into a leveling spreadsheet so the numbers can actually be compared. Sub A included dumpsters, Sub B excluded them, Sub C quoted a lump sum; the spreadsheet is where those differences go to hide. Pick wrong and the "low bid" costs six figures in change orders.

The enterprise answer exists and is priced like the enterprise: Autodesk's BuildingConnected starts around **$3,600/year as a floor** and real GC contracts routinely run $22k/year and up ([downtobid.com](https://downtobid.com/blog/how-much-is-building-connected), [construction.autodesk.com](https://construction.autodesk.com/pricing/buildingconnected/)). It also assumes a full-time precon department. The 5-30 person GC -- the overwhelming majority of the industry -- is still on Outlook and Excel.

BidBoard is the middle: invite subs by trade from your own list, collect bids through a structured portal that requires no sub login, auto-normalize line items into your bid form, level side by side with inclusions/exclusions visible, then award and notify everyone in one click.

## Target User

- **Primary:** small and mid-size general contractors and design-build firms (5-50 employees, $2M-$50M annual volume) bidding 2-10 projects a month across commercial TI, light industrial, multifamily, and custom residential.
- **Secondary:** owner's reps and construction managers who run competitive sub pricing; large residential remodelers with recurring trade lists.
- **Buyer profile:** the estimator/precon lead (often a principal) who owns the leveling spreadsheet today and has personally lost a night to it before an owner meeting. Values their sub relationships; will not adopt anything that makes subs create accounts.
- **Not a target (yet):** ENR-400 GCs with precon departments (BuildingConnected's home turf), subs looking for lead-gen networks, or public-works agencies with procurement portals.

## Market & Profitability

- **The long tail is the industry.** Roughly **83% of US construction firms have fewer than 20 employees** ([Census data via learningwithoutscars.org](https://learningwithoutscars.org/why-83-of-construction-companies-drive-less-than-23-of-employment/), [bls.gov](https://www.bls.gov/opub/ted/2017/establishments-with-fewer-than-50-workers-employed-60-percent-of-construction-workers-in-march-2016.htm)). The tooling gap between "Excel" and "$22k/year Autodesk" is the product.
- **The category is real and growing:** the construction bid management software market was estimated at **~$1.16B in 2025, growing ~16% annually toward ~$2.5B by 2030** ([thebusinessresearchcompany.com](https://www.thebusinessresearchcompany.com/report/construction-bid-management-software-global-market-report)).
- **Willingness to pay is proven upmarket** by BuildingConnected's pricing ([downtobid.com](https://downtobid.com/blog/how-much-is-building-connected)); BidBoard's $149-$399/mo sits at 5-15% of that while covering the workflows a small GC actually uses.
- **Realistic ceiling:** **$30k-$150k MRR** over 2-4 years (roughly 150-600 GC accounts at ~$200-250 blended ARPU). B2B, high ACV for micro-SaaS, and sticky: the sub database and bid history accumulate switching costs every project.
- **Margins:** file storage and email are the only meaningful variable costs; gross margin >90%. Churn risk is project-cyclicality, offset by annual billing and the sub-database lock-in.

## Monetization & Pricing

Priced per GC account by active projects and seats -- never per sub (subs are always free, no login, forever; that is the adoption wedge).

| Plan | Price | Limits | Includes |
|---|---|---|---|
| **Crew** | $149/mo | 3 active projects, 2 seats | Trade packages, sub invites + reminders, no-login bid portal, side-by-side leveling, award + notify, plans hosting 25 GB |
| **Builder** | $249/mo | 10 active projects, 5 seats | Everything in Crew + bid-form templates, line-item normalization assist, inclusion/exclusion matrix, CSV/PDF leveling exports, sub coverage analytics |
| **Precon** | $399/mo | Unlimited projects, 12 seats | Everything in Builder + multi-office, custom branding on the portal, API export, priority support |

Notes on the model:

- **Annual = 2 months free**, anchored against one estimator-night saved per bid ("your Saturday is worth more than $149").
- **14-day trial runs a real bid package** -- the product is only provable on a live project, so onboarding drives straight to "invite three subs on the job you're bidding this week."
- **No free tier.** A GC not actively bidding has no use for the tool; the trial covers evaluation.

## Setup

Requires Node 20+ and a Postgres database. Nothing else is needed to run the whole
product locally: file storage defaults to Postgres, and email is logged to the console
until you add a Resend key.

```bash
npm install
cp .env.example .env.local          # then fill in DATABASE_URL, AUTH_SECRET, PORTAL_TOKEN_SECRET
npm run db:migrate                  # creates the schema
npm run dev                         # http://localhost:3000
```

The three variables that must be real are `DATABASE_URL`, `AUTH_SECRET` and
`PORTAL_TOKEN_SECRET` (`openssl rand -base64 32` for the latter two). Everything else
degrades honestly:

| Left unset | What happens |
|---|---|
| `RESEND_API_KEY`, or `DRY_RUN=1` | Invites, reminders and award notices are logged in full to the console and recorded as `logged` — never silently treated as delivered. |
| `STRIPE_SECRET_KEY` | The billing screen says so and checkout is disabled. Plan limits are still enforced. |
| `R2_*` (with `STORAGE_DRIVER` unset) | Plans and attachments are stored in Postgres. Set `STORAGE_DRIVER=r2` plus the R2 keys to use Cloudflare R2 instead. |
| `CRON_SECRET` | `/api/cron/tick` refuses to run rather than defaulting to open. Reminders will not send. |

Then: sign up, paste your sub list into **Subs**, create a project, add a trade
package, and send yourself an invite — the link in the console log opens the sub portal
exactly as a subcontractor would see it.

```bash
npm run typecheck
npm test                      # add DATABASE_URL to also run the database-backed suites
npm run build
```

## MVP Feature List

- [ ] Auth + company setup (Auth.js); seats with estimator/viewer roles
- [ ] Sub directory: companies, contacts, trades (CSI-division tagging), notes, import from CSV/spreadsheet
- [ ] Project setup: name, location, bid due date, trade packages with scope notes and a structured bid form (line items) per trade
- [ ] Plans/specs hosting: file upload (R2), version marking, one link per package
- [ ] Invitations: per-trade email invites with personal notes; tracked opens; automatic reminder schedule (T-7, T-3, T-1); bid/decline/no-response status board
- [ ] No-login sub portal: signed-token link where a sub views scope + plans, asks questions, and submits the bid form (line items, inclusions, exclusions, lump-sum fallback, attachment upload)
- [ ] Line-item normalization: sub entries mapped onto the GC's bid form; lump-sum and nonstandard entries flagged for manual mapping (deterministic matching first, assist later)
- [ ] Bid leveling view: side-by-side columns per sub, per-line lows highlighted, inclusion/exclusion matrix, plug values for missing lines, adjustment rows, apparent-low calculation
- [ ] Award flow: select winner per trade, generate award + regret notifications, statuses locked to the record
- [ ] Q&A thread per package (sub questions -> GC answers broadcast to all bidders on that trade)
- [ ] Billing for BidBoard itself (Stripe Billing, three tiers)
- [ ] Leveling export: clean PDF/CSV of the leveled comparison for the owner meeting

Post-MVP (explicitly cut from v1): AI normalization assist, ITB (invitation to bid) network/discovery, plan-room viewer with markup, bid bonds/prequal (TradeTapp territory), accounting handoffs, public API.

## Differentiation

1. **Subs never log in.** Every incumbent leaks friction onto the sub (accounts, networks, spam). BidBoard's portal is a signed link that works on a phone in a truck. Sub adoption is the whole game -- a bid tool without bids is a spreadsheet with extra steps.
2. **Leveling is the product, not a report.** BuildingConnected treats leveling as one feature in a suite; the midnight spreadsheet is the actual pain. BidBoard's structured bid forms mean bids arrive *already comparable*, and the inclusion/exclusion matrix makes scope gaps -- the real cause of bad awards -- visible instead of buried.
3. **Priced for the 83%.** $149/mo against a $3,600-$22,000/year incumbent isn't a discount strategy; it's a different market. No sales call, no 3-year contract, no per-office pricing games.
4. **Your subs, not our network.** No lead-gen marketplace, no exposing your trusted sub list to competitors, no spam economics. The GC's private directory is theirs -- which is also why they'll import it.
5. **The owner-meeting artifact.** The leveling export is designed to be shown to an owner: clean, defensible, with scope differences annotated. Estimators get to look rigorous, which is worth more than the time saved.

## Go-to-Market Channels

In priority order:

1. **The sub-side flywheel.** Every invite and portal touch is BidBoard-branded ("bid requested via BidBoard"). Subs who bid through it are one click from "run your own bids here" -- many subs are also GCs on smaller jobs, and every GC's sub list contains the next customers.
2. **Estimator communities and content.** r/Construction, r/Estimators, construction-estimating Facebook/LinkedIn groups; SEO on "bid leveling template/spreadsheet," "subcontractor bid comparison," "BuildingConnected alternative," "bid tabulation." The free **leveling spreadsheet template** (which fills itself from BidBoard) is the lead magnet.
3. **Comparison pages.** "BidBoard vs BuildingConnected," "vs SmartBid," "vs Pantera," "vs email + Excel." Incumbents are enterprise-priced and weakly reviewed at the low end; switch intent is high.
4. **Local builder exchanges and AGC/ABC chapters.** Small GCs cluster in regional associations with newsletters and lunch-and-learns; a 20-minute "level a bid live" demo converts.
5. **Takeoff/estimating tool partnerships** (STACK, PlanSwift, Buildertrend ecosystems): they own quantity takeoff, punt on sub bid collection; referral or integration slot.

## Competition

| Competitor | Pricing | Weaknesses |
|---|---|---|
| **BuildingConnected (Autodesk)** | ~$3,600/yr floor; $22k+/yr real-world; sales-led, multi-year terms | Priced and sold past small GCs; network model spams subs; leveling buried in a suite; Autodesk account baggage. |
| **SmartBid (ConstructConnect)** | Quote-only, ~$3-8k/yr typical | Dated UX; sub logins; tied to ConstructConnect's data-selling ecosystem which GCs distrust. |
| **Pantera Tools** | ~$1,500-5k/yr, quote-only | Feature sprawl (CRM, plan room, bid board); shallow leveling; small-GC packaging still sales-led. |
| **DownToBid** | ~$299+/mo | Closest in spirit (sub outreach focus); weaker on structured leveling; newer/unproven directory tooling. |
| **Buildertrend / Procore bid rooms** | Bundled in $400-1,000+/mo suites | Bid modules are afterthoughts inside PM suites; require whole-suite adoption; subs need accounts. |
| **Email + Excel** | Free | The real competitor. Beaten only by making collection (no-login portal) and comparison (auto-leveling) visibly faster on the *first* project. |

## Key Risks

1. **Two-sided adoption inside one workflow.** If subs won't use the portal, GCs fall back to email and the value collapses. Mitigation: portal is phone-first, no account, sub can attach their own PDF *plus* fill the form; GC can transcribe an emailed bid manually so the leveling view never has holes; measure portal-submission rate as the north-star metric.
2. **Normalization is genuinely hard.** Sub line items never match the GC's form exactly; bad auto-mapping poisons trust in the leveling math. Mitigation: v1 mapping is deterministic (the sub fills the GC's own form; free-form entries flag for manual mapping) -- assistive AI mapping only after real bid corpora exist, always suggest-and-confirm, never silent.
3. **Incumbent price response.** Autodesk could ship a $200/mo BuildingConnected tier. Mitigation: their revenue model and salesforce make down-market cannibalization unlikely; speed, sub-friendliness, and no-network positioning are the moat regardless.
4. **Project cyclicality churn.** GCs pause subscriptions between bidding seasons. Mitigation: annual billing incentives, the sub directory + bid history as accumulating assets, pause-instead-of-cancel plan state.
5. **Plans hosting cost/abuse.** Plan sets are gigabytes. Mitigation: R2 (zero egress) with per-plan storage caps, cold-tiering old projects, hard file-type limits.
6. **Legal sensitivity of bid data.** Bid shopping accusations are radioactive in this industry. Mitigation: subs' numbers are never visible to other subs, no cross-GC data sharing ever, an explicit "your bids are never shared or sold" commitment on the portal, and audit logs on every access.
