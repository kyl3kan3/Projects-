# TenantFile

**The DIY-landlord toolkit for 1–20 units: listing and application intake, tenant screening, lease e-sign, rent ledger with reminders, and a maintenance log with photo threads — the whole tenancy in one file.**

---

## The Problem

The landlord with three units runs a real business out of a text thread and a shoebox. The application is a PDF someone prints. Screening means calling a previous landlord who may be the applicant's cousin. The lease is a Word doc signed at a kitchen table. Rent is "did the Zelle come through?" scrolled for in a banking app. Maintenance history is photos buried in Messages. When a dispute, a security-deposit claim, or an eviction hearing arrives, the "records" are archaeology.

This is most of the rental market, not an edge case:

- About **seven in ten US rental properties are owned by individual investors**, who typically own just one or two properties ([Pew Research Center](https://www.pewresearch.org/short-reads/2021/08/02/as-national-eviction-ban-expires-a-look-at-who-rents-and-who-owns-in-the-u-s/)).
- Individual landlords owned roughly **14.3 million properties comprising nearly 20 million rental units** — about 41% of the US rental stock — and 99% of landlord-owned properties have 1–4 units ([HUD / Rental Housing Finance Survey via HUD USER](https://www.huduser.gov/portal/pdredge/pdr-edge-frm-asst-sec-061118.html), [Harvard JCHS](https://www.jchs.harvard.edu/blog/who-owns-rental-properties-and-is-it-changing)).
- These owners sit below the professional property-management line (~8–10% of rent makes no sense on two units) and above spreadsheet chaos — exactly the segment TurboTenant, Avail, and RentRedi have proven will pay $0–$30/mo for software, while each leaves gaps (see Competition).

The DIY landlord doesn't want a property-management ERP. They want the tenancy to run itself: fill the unit, screen safely, sign legally, collect predictably, and have the paper trail exist without doing paperwork.

## Target User

- **Primary:** self-managing landlords with 1–20 units — the duplex owner, the accidental landlord renting out the old condo, the couple with four doors as a retirement plan. Age skews 35–65; tech comfort is "uses banking apps," not "configures software."
- **Secondary:** small partnerships/LLCs (2–3 people, up to ~50 units) still self-managing; real-estate agents who help owner-clients lease up.
- **Buyer moment:** a vacancy or an incident. They arrive with a burning task (fill this unit / that tenant is late again), not a desire for a platform.
- **Not a target:** professional property managers (they need trust accounting, owner statements), large multifamily operators, short-term rentals.

## Market & Profitability

- The user base is measured in millions of households, self-serve, and durable — units don't churn out of the housing market. Once the leases, ledger, and history live in TenantFile, switching costs compound every month.
- Realistic outcome: **$20k–$100k MRR** in 2–4 years. At $30 blended ARPU that's 650–3,300 landlords — a thin slice of a market where incumbents each claim hundreds of thousands of users.
- Screening adds non-subscription revenue: reports are applicant-paid (~$35–45 retail; the orchestration API costs us a fraction), standard practice in the category.
- Costs are boring and low (Postgres, S3 photos, email/SMS, third-party screening API); margins 80–85% blended.

## Monetization & Pricing

| Plan | Price | Limits & features |
|---|---|---|
| **Keys** | $19/mo | Up to 3 units: listings + applications, screening (applicant-paid), rent reminders + ledger, maintenance log |
| **Building** | $39/mo | Up to 10 units + lease e-sign included, late-fee automation, document vault, 2 collaborators |
| **Portfolio** | $59/mo | Up to 20 units + multi-property dashboard, exportable ledgers/reports (tax season), priority support |

Applicant-paid screening (~$39/report, we keep the margin over the API cost) means the subscription isn't carrying the whole business. Annual billing at 2 months free. Free 30-day trial keyed to a real vacancy ("fill this unit free").

## MVP Feature List

- [ ] Property + unit setup; hosted listing page per vacancy (photos, rent, requirements) with a shareable link for Zillow/Craigslist/FB Marketplace traffic
- [ ] Application intake: standard rental application form, applicant uploads (ID, pay stubs), status pipeline (new → screening → approved/declined) with adverse-action letter template
- [ ] Screening orchestration via a third-party API (credit, criminal, eviction — e.g. a SmartMove-class integration): applicant-initiated, applicant-paid, results attached to the application
- [ ] Lease e-sign via an embedded provider (Dropbox Sign-class): upload your lease or start from a state template shell, fill fields, both parties sign on their phones
- [ ] Rent ledger: monthly charges, manual + Stripe ACH collection, partial payments, deposits; late-fee rules (grace days, flat/percent, state-cap warning)
- [ ] Rent reminders: email/SMS before due date and on lateness, escalating copy; tenant gets a simple pay/status page, no app download
- [ ] Maintenance requests: tenant submits with photos, threaded conversation per request, status (open → scheduled → done), cost tracking per unit
- [ ] The File: per-tenancy timeline auto-assembled from all of the above — application, screening, lease, every payment, every request — exportable as PDF
- [ ] Billing for TenantFile itself (Stripe, the three plans above)

Post-MVP (explicitly cut from v1): listing syndication APIs, accounting exports (Schedule E), owner/partner roles, tenant autopay incentives, vendor dispatch, section-8/HUD flows.

## Differentiation

1. **The File is the product.** Competitors sell task tools; TenantFile's spine is the per-tenancy record — everything timestamped in one exportable file. The pitch lands on the day a deposit dispute or court date makes the record priceless.
2. **Priced like a tool, not free-with-strings.** TurboTenant/Avail monetize "free" plans through tenant fees and upsells; landlords increasingly resent fees pushed onto tenants (it degrades their applicant pool). TenantFile is transparently landlord-paid with applicant-paid screening only — the industry-standard exception.
3. **Built for 1–20 units, honestly.** No trust accounting, no owner statements, no seat pricing — the feature set stops where professional management begins, which keeps the product legible to a non-technical owner.
4. **Maintenance photo threads.** The weakest surface across the category; ours is a first-class thread per request (the text-message workflow, formalized) feeding the File.
5. **Compliance guardrails, not legal advice.** Late-fee caps, adverse-action templates, deposit timelines surfaced as warnings with sources — the nervous first-timer's reason to choose us.

## Go-to-Market

1. **SEO on the task, not the category.** "rental application template," "how to screen a tenant," "late rent notice template," "security deposit return letter" — enormous, evergreen, weak-content keywords that arrive at the burning-task moment. Free templates convert to the tool that fills them in.
2. **BiggerPockets, r/Landlord, landlord Facebook groups.** The DIY-landlord internet is concentrated and advice-seeking; helpful presence + the free File export as the hook ("keep records like a lawyer told you to").
3. **Free state law cheat sheets.** Per-state one-pagers (late-fee caps, notice periods, deposit deadlines) — high-trust lead magnets that also power the in-app guardrails.
4. **Vacancy-moment ads.** Modest spend on "tenant screening" and "rental application" queries — high intent, priced-out incumbents bid on brand terms instead.
5. **Accountant/agent referrals.** Tax preparers with Schedule E clients and agents who just sold someone a duplex both meet our buyer at the right moment.

## Competition

| Competitor | Price | Weakness we exploit |
|---|---|---|
| TurboTenant | Free + $99–149/yr premium | Monetizes via tenant/applicant fees; landlord tools shallow past leasing; upsell-heavy UX |
| Avail (Realtor.com) | Free + $9/unit/mo premium | Per-unit pricing stings at 5+ units; corporate-owned, slowed product velocity |
| RentRedi | ~$12–30/mo | Collection-centric; screening/lease flows clunky; weak records/export story |
| Hemlane | $30+/unit/mo | Priced for hybrid management, not DIY; overkill under 10 units |
| Spreadsheets + Zelle + texts | Free | The real incumbent: no records, no reminders, no protection when it goes wrong |

## Key Risks

1. **Screening-provider dependency and compliance.** FCRA obligations, provider onboarding requirements (landlord identity verification), and API policy changes sit on the critical path. Mitigation: applicant-initiated flows (the provider carries FCRA delivery), a second provider integration on the roadmap, adverse-action tooling built in.
2. **Payments gravity.** Zelle/Venmo are free and habitual; if rent collection adoption lags, reminder value drops. Mitigation: the ledger works with manual "mark paid" from day one — the record is valuable even when the money moves elsewhere.
3. **Incumbent free tiers.** TurboTenant/Avail can bundle harder. Mitigation: their business models require monetizing tenants; our landlord-paid transparency is a structural position they can't copy without revenue pain.
4. **Legal-content liability.** State guardrails must be right and dated, with sources, and framed as information, not advice. Budget for an annual legal-content review.
5. **Seasonality.** Leasing peaks in summer; ledger/maintenance/File features are the year-round retention surface — watch winter churn as the honest health metric.
