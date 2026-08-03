# GreenTally

**Carbon reporting for SMBs under supplier pressure: upload your utility bills and a spend CSV, get a defensible Scope 1/2 (+ spend-based Scope 3) footprint, a CSRD-lite PDF, and ready-to-paste answers for CDP/EcoVadis-style questionnaires.**

---

## The Problem

Sustainability reporting rolled downhill. The CSRD obligates roughly 50,000 large companies to disclose across their *entire value chain* (CEPS/EU estimates; ~10,000 of them US companies selling into the EU), and those companies discharge the obligation by sending questionnaires to their suppliers. CDP alone expected ~75,000 companies to receive disclosure requests in 2024, and 1,300+ enterprise buyers push EcoVadis assessments to tens of thousands of suppliers every year. The recipients are 40-person machine shops, food co-packers, logistics firms, and software vendors with no sustainability function and no idea what "Scope 2, market-based" means.

Today an SMB facing a supplier questionnaire has three options:

1. **Ignore it** — and watch the RFP scorecard mark them non-compliant. Procurement teams increasingly gate contracts on a submitted response, not a good one.
2. **Hire a consultant** — boutique carbon-accounting engagements for a first footprint + questionnaire support typically quote $10k–$30k, recurring annually. For a company answering one customer's form, that math never works.
3. **Buy enterprise carbon software** — Watershed, Persefoni, and Sweep are priced (and sold) for sustainability *teams*, with implementations measured in months.

The actual job is small and mechanical: 12 months of utility bills (fuel + electricity), a general-ledger spend export, published emission factors (EPA/eGRID, DEFRA, EXIOBASE), arithmetic, and a document that looks credible to a procurement analyst. That is a product, not an engagement.

## Target User

- **Primary:** the operations/finance lead at a 10–250 person supplier (manufacturing, food, logistics, professional services, software) who just received a sustainability questionnaire from their largest customer with a deadline on it. They are not buying "sustainability" — they are protecting a contract.
- **Secondary:** SMBs pitching enterprise RFPs that now include emissions questions; agencies/fractional CFOs answering these for multiple clients.
- **Buyer profile:** pragmatic, deadline-driven, allergic to consultants. Will pay $99–$299/mo without procurement review if it closes the questionnaire this week.
- **Not a target (yet):** listed companies with full CSRD obligations, heavy industry needing activity-based Scope 3, or anyone requiring third-party assurance.

## Market & Profitability

- **The demand is regulatory-adjacent, so it compounds.** Even after the EU's Omnibus simplifications trimmed the directly-obligated cohort, the value-chain mechanism is intact: obligated buyers must report Scope 3, so they must collect from suppliers. The VSME voluntary standard exists precisely because SMB suppliers are being asked (EFRAG). Each year the questionnaire wave gets bigger, not smaller — CDP's supply-chain program alone has grown to ~75,000 requested companies (CDP, 2024).
- **Willingness to pay is anchored by the alternative.** The comparison is a $10k–$30k consultant or a lost enterprise contract, not another SaaS line item. $199/mo is a rounding error against either.
- **Category economics:** this is spreadsheets-and-PDFs software — parsing, arithmetic against public emission-factor tables, and document generation. Gross margins 85–90%; the only meaningful COGS is document-extraction inference.
- **Realistic outcome: $15k–$100k MRR** over 2–4 years. The wedge (questionnaire deadline) has sharp intent but modest search volume; growth compounds through renewal season (questionnaires recur annually) and multi-customer suppliers who get 3+ different forms.
- **Honesty about the ceiling:** enterprise carbon platforms will not come down-market gracefully (their sales model forbids it), but accountant-channel players (e.g. bookkeeping-integrated carbon tools) could commoditize the calculation layer. The durable value is the *questionnaire answer bank* and the annually recurring deadline.

## Monetization & Pricing

| Plan | Price | Includes |
|---|---|---|
| **Starter** | $99/mo | 1 site, 12 months of bills, Scope 1/2 footprint, spend-based Scope 3 screen, CSRD-lite PDF report |
| **Standard** | $199/mo | 3 sites, questionnaire answer bank (CDP/EcoVadis/custom-form mapping), branded report, year-over-year comparison |
| **Supplier+** | $299/mo | 10 sites, multi-entity roll-up, reduction-plan builder, procurement-portal response exports, priority support |

Notes on the model:

- **Annual billing pushed hard (2 months free):** the job recurs annually with the reporting cycle; annual prepay matches the buyer's mental model ("this year's questionnaire, handled").
- **The free hook is the Footprint Preview:** upload one electricity bill, see a partial Scope 2 estimate and a blurred report page. The full number, the PDF, and the answers require a plan.
- No per-seat pricing — the buyer is one person, and seats would only create friction.

## MVP Feature List

- [x] Onboarding wizard: company profile, sites, reporting year, the questionnaire(s) they need to answer
- [x] Document upload: PDF/image utility bills (electricity, gas, fuel), drag-and-drop, batch
- [x] Extraction pipeline: LLM-assisted parsing of bills into normalized activity data (kWh, therms, litres) with per-field confidence and a human review screen for low-confidence fields
- [x] Spend CSV import: map GL export columns, categorize spend lines to EEIO categories (auto-suggested, user-confirmable)
- [x] Emissions engine: Scope 1 (fuel combustion), Scope 2 (location- and market-based, eGRID/residual-mix factors), Scope 3 spend-based screen (EEIO factors), all with factor citations and vintages
- [x] Dashboard: total tCO2e by scope, by site, by month; data-coverage meter showing which months/sources are still missing
- [x] CSRD-lite PDF report: methodology notes, factor sources, scope tables, intensity metrics (tCO2e/revenue, /FTE) — credible to a procurement analyst, explicitly not assurance-grade
- [x] Questionnaire answer bank: mapped answers for common CDP/EcoVadis-style questions (emissions figures, methodology, boundaries, reduction intent), copy-paste ready with per-answer source references
- [x] Audit trail: every reported figure traceable to source documents and factors (the trust feature)
- [x] Billing (Stripe): three plans + annual, footprint-preview gate

Post-MVP (explicitly cut from v1): utility API integrations, activity-based Scope 3, reduction-project tracking, multi-language reports, accountant multi-client workspace, assurance-partner handoff.

## Running it

Node 20 or newer, and a Postgres database. Nothing else is required — every external
service degrades honestly (see `.env.example`).

```bash
cp .env.example .env.local          # fill in DATABASE_URL and AUTH_SECRET
npm run db:migrate                  # create the schema
npm run db:seed-factors             # load the bundled EPA / eGRID / DEFRA / USEEIO sets
npm run dev                         # http://localhost:3039
```

Then sign up, walk the four-step setup, and drop a utility bill onto the Documents
screen. The footprint, the report and the questionnaire answers all fill in from it.

### What each optional service adds

| Unset | What happens instead |
|---|---|
| `ANTHROPIC_API_KEY` | Bills are read from their PDF text layer, which is a real driver — but it cannot read a photograph. A scan lands in review with empty fields to type in, never with a guessed number. |
| `R2_*` | Original bills are stored as bytes in Postgres and served through the same short-lived signed links. |
| `STRIPE_SECRET_KEY` | The billing screen shows the plans and says checkout is unavailable. Plan limits still apply. |
| `CRON_SECRET` | `/api/cron/tick` refuses to run at all rather than defaulting to open. |

### Background work

Extraction, spend classification and footprint recomputation run through a queue in
Postgres (`jobs`). Three callers drain it through one code path:

- the browser, right after an upload (`POST /api/jobs/run`, scoped to your own org);
- the scheduled sweep (`GET /api/cron/tick`, `Authorization: Bearer $CRON_SECRET`);
- `npm run worker`, if you would rather deploy a long-lived process.

On Vercel the first two are enough. `ARCHITECTURE.md` specifies BullMQ on Redis behind
a standalone worker; the queue lives in the database instead because the deployment
target has no always-on process and Hobby cron fires once a day, and because enqueueing
then happens in the same transaction as the row it is about.

### The PDF

The report is a print-CSS route rendered by headless Chromium, so the screen artefact
and the downloaded document are the same file. That needs a Chromium binary:
`npm run worker`'s host, a container, or a developer machine. Set
`CHROMIUM_EXECUTABLE_PATH` if the platform ships its own. Where none exists,
`Download PDF` says so and the print view produces the identical A4 document through
the browser's own Print → Save as PDF.

### Emission factors

`src/db/factors.ts` holds the bundled sets — EPA, eGRID, DEFRA/DESNZ and USEEIO — with
the publisher, table, vintage and any unit conversion on every row. They are a
transcription kept in the repository so the product has no runtime dependency on a
factor API. **Before a report leaves the building on a real engagement, re-run
`npm run db:seed-factors` against the current published CSVs.** Factor vintages change
annually, and a stale factor is the commonest defect in an SMB footprint.

### Tests

```bash
npm run typecheck
npm test        # 129 unit tests: units, bill reading, PDF text, validators,
                # the engine's determinism, spend, plans, the answer bank
npm run build
```

The tests cover the parts that are expensive to get wrong: unit conversion (a CCF read
as a kWh understates gas thirtyfold), PDF text decoding (a kerned `4,110` read as `41`),
the confidence and validation routing, integer emissions arithmetic, replay determinism,
and every questionnaire template against an empty inventory.

## Differentiation

1. **Questionnaire-first, not dashboard-first.** Competitors sell "measure your footprint"; GreenTally sells "answer the form that's threatening your contract." The answer bank mapped to CDP/EcoVadis-style questions is the product; the footprint is its supporting evidence.
2. **Provenance on every number.** Each figure in the report and every questionnaire answer links back to the source bill, the extracted field, and the published factor (name, vintage, region). Procurement analysts and auditors probe exactly this; consultants charge for exactly this.
3. **Honest methodology labeling.** Spend-based Scope 3 is clearly labeled a *screen*, location- vs market-based Scope 2 both shown. Credibility with the analyst reading the report is the moat; greenwash-y precision would destroy it.
4. **A week, not a quarter.** Bills in on Monday, defensible PDF by Friday. Enterprise tools cannot structurally match this because their onboarding is the sales process.

## Go-to-Market

1. **SEO on the panic queries:** "EcoVadis questionnaire help," "CDP supplier request what to do," "Scope 1 2 3 for small business," "supplier sustainability questionnaire template." Weak incumbent content, extremely sharp intent. Ship a free **questionnaire decoder** (paste the customer's questions, get plain-English explanations of each) as the lead magnet.
2. **The free Footprint Preview** as the demo-first hero: one bill in, a real (partial) number out, in the first session.
3. **Accountant & fractional-CFO channel:** they get forwarded these questionnaires by clients today and have no answer. 20% recurring referral; multi-client workspace later makes them the expansion story.
4. **Procurement-side wedge:** publish "what good supplier responses look like" content aimed at the enterprise buyers sending the forms; being the tool the *buyer* recommends to struggling suppliers is the cheapest distribution in the category.
5. **Trade-association partnerships** in questionnaire-dense verticals (contract manufacturing, food & beverage, logistics): webinars titled "your customer just asked for your carbon number."

## Competition

| Competitor | Pricing | Weaknesses |
|---|---|---|
| **Watershed / Persefoni / Sweep** | Enterprise ($30k–$100k+/yr, sales-led) | Built for sustainability teams; implementation-heavy; will not serve a $199/mo buyer. They validate the category and leave the bottom open. |
| **Normative / Plan A** | Mid-market (~€5k–€20k/yr) | European mid-market focus, still consultative onboarding; questionnaire answering is secondary to footprint dashboards. |
| **Greenly** | ~$2k–$10k/yr, SMB-adjacent | Closest competitor. Broad platform (LCA, ESG modules) dilutes the questionnaire job; pricing anchored to engagements with climate experts, not pure self-serve. |
| **Carbon consultants** | $10k–$30k per engagement | The real incumbent. Slow, expensive, and non-recurring — but trusted. We win on price and speed, and copy their trust signals (methodology notes, factor citations). |
| **DIY spreadsheets + GHG Protocol tools** | Free | Where most SMBs start and stall. Free tools produce numbers, not credible documents or mapped answers. "Good enough and free" fails at the procurement-analyst review stage — that's the wedge. |

## Key Risks

1. **Regulatory softening.** The EU Omnibus already trimmed CSRD's direct scope, and further dilution would shrink urgency. Mitigation: the buyer-driven questionnaire mechanism (CDP, EcoVadis, RFP scorecards) predates CSRD and survives it; position on "keep your customer," not "comply with the law."
2. **Extraction accuracy on messy bills.** Utility bills are adversarially inconsistent; a silently wrong kWh number poisons the whole report. Mitigation: per-field confidence scores, mandatory human review below threshold, unit-sanity checks (kWh/sqft bands), and the audit trail making every figure inspectable.
3. **Credibility gap.** A $199/mo tool's report may be dismissed by a skeptical analyst. Mitigation: methodology transparency, published factor sources with vintages, explicit uncertainty labeling, and (Phase 3) a review network of credentialed practitioners who co-sign reports for a fee.
4. **Factor-data licensing.** Some factor sets (e.g. certain EXIOBASE derivatives, ecoinvent) carry licensing constraints. Mitigation: build on public sets (EPA, eGRID, DEFRA, open EEIO) first; treat licensed factors as a paid-tier upgrade with proper agreements.
5. **Seasonality.** Questionnaire deadlines cluster (spring CDP cycle, year-end RFPs); trials will spike and idle. Mitigation: annual plans, year-round value via the coverage meter and monthly data drip, and renewal-season lifecycle emails.
6. **Platform players adding "carbon" checkboxes.** Accounting suites could ship a spend-only estimate for free. Mitigation: spend-only numbers fail real questionnaires (they can't answer Scope 1/2 methodology questions); our bill-level provenance is the defensible layer.

## Sources

Market claims above are grounded in: EU CSRD scope estimates (~50,000 companies; ~10,000 US companies affected), CDP supply-chain disclosure requests (~75,000 companies requested in 2024), EcoVadis network scale (1,300+ enterprise buyers assessing tens of thousands of suppliers), and typical boutique carbon-consulting engagement pricing ($10k–$30k).
