# RecallDesk

**Dental patient reactivation that pays for itself: import your patient list from any PMS (Dentrix, Eaglesoft, Open Dental exports), see exactly who is overdue for hygiene recall, run email/SMS campaigns with booking links, and get a conservative, receipts-attached count of the production dollars you recovered.**

## The Problem

Every dental practice is sitting on a pile of money it already earned the right to collect: patients of record who simply stopped coming back. Industry benchmarks put **25-40% of a practice's active patients overdue for hygiene at any moment** — for a 2,000-patient practice that is 500-800 people who should be in a chair, at roughly $300 of hygiene-visit value each ([ainora benchmarks](https://ainora.lt/blog/dental-recall-reactivation-statistics-benchmarks), [eAssist](https://dentalbilling.com/hygiene-recall-recare-by-the-numbers/)). The hygiene schedule, meanwhile, has holes in it this week.

The practice knows this in theory. In practice, the overdue list lives inside the PMS as a report nobody runs, reactivation is "the front desk calls when it's slow" (it is never slow), and the patient-communication suite the office already pays $300-700/month for sends confirmations and birthday emails but treats reactivation as a checkbox feature with no attribution. Nobody can answer the only question that matters: *did this outreach put dollars in the schedule?*

RecallDesk is the reactivation engine, alone and done properly: the overdue list computed from a CSV any PMS can export, campaigns that run a disciplined sequence instead of one blast, a front-desk queue of exactly who to call today, and attribution so conservative the dentist can repeat it to their accountant — a recovered dollar is counted only when a patient books within 30 days of a touch.

## Target User

- **Primary:** independent general-dentistry practices, 1-3 locations, 1,500-4,000 active patients per location. The buyer is the dentist-owner or office manager; the daily user is the front desk.
- **Secondary:** pediatric and perio practices with the same recall anatomy; small DSOs (4-10 locations) wanting one reactivation number per location.
- **Buyer profile:** an owner who suspects there is "a hundred grand sitting in the charts" and an office manager who needs the who-to-call list to be someone else's math. Buys when the import shows their own overdue list with dollar signs on it.
- **Not a target (yet):** large DSOs with enterprise comms contracts, specialty practices without recall cadences (oral surgery), practices wanting full patient-communication suites (confirmations, reviews, phones) — we do reactivation, not everything.

## Market & Profitability

- **The overdue base is enormous and quantified.** 25-40% of active patients are overdue at any given time, and average recall visit value runs ~$300 in production (hygiene plus downstream restorative found at the visit) ([ainora](https://ainora.lt/blog/dental-recall-reactivation-statistics-benchmarks), [Practice Analytics](https://practiceanalytics.com/the-impact-of-hygiene-reactivation/)). Even a 10% reactivation of a 600-patient overdue list is ~$18k of production — against a $199-499/mo subscription.
- **The incumbents set a high price anchor and a low bar.** [Solutionreach starts around $329/mo with mid-market practices reporting $400-800/mo](https://noshowcost.com/tools/solutionreach-pricing) plus implementation fees; [Weave's Pro plan starts at $249/mo per location](https://www.themolarreport.com/learn/weave-pricing) with real-world quotes commonly $400-700; [RevenueWell starts at $189/mo](https://softwarefinder.com/emr-software/revenuewell). All are broad communication suites where reactivation is one tab and attribution is marketing copy. RecallDesk is priced inside the anchor and does one job with receipts.
- **Willingness to pay is anchored to production, not software budgets.** The pitch is arithmetic: "the engine found $184,000 overdue; it recovered $9,400 last quarter; it costs $597." Attribution makes the renewal conversation a formality.
- **Realistic ceiling:** **$30k-$150k MRR** over 2-4 years (100-500 locations at ~$300 blended ARPU). Churn is contained by the attribution ledger — cancelling means giving up the number that justified the front desk's time.
- **Margins:** email/SMS are the variable costs, opt-in-bounded; gross margin >85% at the $199 floor.

## Monetization & Pricing

Priced per location — the honest unit for a practice, and how every incumbent bills.

| Plan | Price | Includes |
|---|---|---|
| **Chairside** | $199/mo per location | CSV import from any PMS, overdue engine + recall intervals per patient, email campaigns with booking links, the daily call queue, conservative attribution ledger |
| **Recall Engine** | $299/mo per location | Everything in Chairside + SMS campaigns (10DLC, opt-in enforced), multi-step sequences with quiet hours, campaign A/B on send copy, monthly owner report (PDF) |
| **Group** | $499/mo per location (3+ locations) | Everything in Recall Engine + cross-location dashboard, per-location benchmarks, roll-up owner reports, priority support and onboarding |

14-day free trial that ends with your own overdue list and its dollar total on screen — the trial IS the demo. Annual = 2 months free. No per-message fees on email; SMS at cost above a generous included pool.

## MVP Feature List

- [ ] Auth + practice/location setup (Auth.js); roles (owner, office manager, front desk)
- [ ] CSV import wizard: accepts Dentrix/Eaglesoft/Open Dental patient + appointment exports (documented per-PMS export recipes), column mapping with saved presets, dedupe by patient, dry-run preview before commit
- [ ] Overdue engine: per-patient recall interval (default 6 months, per-patient override from history), last-visit computation, overdue buckets (3-6mo / 6-12mo / 12-24mo / 24mo+), do-not-contact and bad-contact flags
- [ ] The overdue list: filterable, dollar-weighted (est. visit value per practice setting, default $300), export back to CSV — the screen the trial sells from
- [ ] Campaigns: segment (bucket + filters) -> sequence of steps (email day 0, email day 7, SMS day 14 on Recall Engine), per-step templates with merge fields, quiet hours + max-touch caps per patient, STOP/unsubscribe honored globally
- [ ] Booking links: each touch carries a per-patient tokenized link to a booking-request page (patient picks preferred windows; front desk confirms in the PMS and marks booked) — no PMS write-back required in v1
- [ ] Front-desk call queue: today's list ranked by (dollar value x recency of last touch x bucket), two-tap outcomes (booked / left message / call back / skip / do not contact), notes
- [ ] Attribution ledger: a booking counts as recovered only if it lands within 30 days of a touch (call outcomes count as touches); recovered production = bookings x practice's visit value, shown with every underlying receipt row
- [ ] Dashboard: overdue total ($ and patients), touches sent, bookings attributed, recovered production this month/quarter — the "chair that fills itself" counter
- [ ] Suppression hygiene: bounced emails and failed numbers flagged back onto the patient record; opt-outs permanent per channel
- [ ] Billing (Stripe, three tiers, per-location quantities, trial)

Post-MVP (explicitly cut from v1): direct PMS integrations/write-back (Sikka/Dental Intel-style bridges), appointment confirmations/reminders for booked patients, two-way SMS inbox, reviews/phones/payments, insurance verification.

## Differentiation

1. **Attribution a skeptic accepts.** Incumbents claim ROI; RecallDesk shows a ledger — every recovered dollar traces to a named patient, a touch with a timestamp, and a booking date inside the window. Conservative by design: no touch within 30 days, no credit. The number is small enough to be true, which is why it renews subscriptions.
2. **CSV-first beats integration-first.** Every PMS can export a patient list; almost none make integrations easy or cheap. The import wizard with per-PMS recipes means onboarding is an afternoon with no IT project, no Sikka contract, and no waiting on a DSO's integration queue — and switching PMS doesn't break RecallDesk.
3. **The front desk gets a queue, not a report.** The daily call list is ranked, dollar-weighted, and two-tap dispositioned. Incumbents give the front desk a dashboard to interpret; RecallDesk gives them the next ten calls.
4. **One job, priced under the suite.** Practices keep their confirmation tool; RecallDesk sits beside it at $199-299 doing the one thing suites do worst. No rip-and-replace decision required to buy.
5. **The trial is the audit.** Import your CSV, see your own overdue list with a dollar total in the first session. The landing page's CTA is literally the product's first screen: "See your overdue list."

## Go-to-Market Channels

1. **SEO on the owner's 2am search:** "dental patient reactivation," "hygiene recall system," "overdue patients dental," "Dentrix export patient list" — the export-recipe articles double as top-of-funnel and onboarding docs.
2. **The overdue-list calculator** as lead magnet: active patients x overdue % x visit value = the number that starts the trial ("your charts are hiding ~$168,000").
3. **Dental office manager communities:** AADOM chapters and its conference, office-manager Facebook groups, r/Dentistry threads on recall — the OM is the champion who runs the import.
4. **Dental consultants and fractional OMs** who tell practices what to buy; the monthly owner report (their client deliverable) is the referral hook, plus an honest affiliate kit.
5. **Comparison pages:** vs Solutionreach/Weave/RevenueWell ("keep your suite — add the engine"), vs "the front desk calls when it's slow" — the honest anchor.

## Competition

| Competitor | Pricing | Weaknesses |
|---|---|---|
| **Solutionreach** | [~$329/mo start; $400-800/mo reported mid-market + setup fees](https://noshowcost.com/tools/solutionreach-pricing) | Full comms suite; reactivation is a checkbox feature; annual contracts; attribution is marketing, not a ledger. |
| **Weave** | [Pro from $249/mo/location; real quotes commonly $400-700](https://www.themolarreport.com/learn/weave-pricing) | Phones-first platform; recall outreach shallow; per-location cost climbs with add-ons; no conservative recovered-$ accounting. |
| **RevenueWell** | [From $189/mo](https://softwarefinder.com/emr-software/revenuewell) | Marketing-suite DNA (newsletters, social, reviews); reactivation sequences and call-queue workflow thin; PMS-integration dependent. |
| **Practice by Numbers / Dental Intel** | ~$300-500+/mo | Analytics-first: great at showing the hole, weak at running the outreach that fills it; priced and pitched at data-curious practices. |
| **"Call when it's slow"** | Free | The real incumbent. Beaten by the ranked queue, the sequences that run without anyone remembering, and the ledger that proves the difference. |

## Key Risks

1. **CSV imports are messy and PMS-specific.** Bad mappings poison the overdue math. Mitigation: per-PMS recipes with fixtures for the big three, dry-run preview with anomaly flags ("3,412 patients, 41% missing phone — check column mapping"), saved mappings, and import versioning with one-click rollback.
2. **TCPA/SMS compliance.** Texting patients requires consent discipline. Mitigation: SMS only on imported consent flags or explicit opt-in, 10DLC registration in Phase 0, STOP honored globally and permanently, quiet hours by patient timezone, email as the always-available channel.
3. **HIPAA exposure.** Patient names + appointment history are PHI. Mitigation: BAAs with every vendor in the path (DB, Redis, storage, email, SMS), encryption at rest, no PHI in logs or analytics, access audit trail, and a signed BAA with each customer practice (we are their business associate).
4. **Attribution disputes.** "That patient would have come back anyway." Mitigation: conservative window, call-outcome touches logged by the front desk themselves, holdout comparison (untouched overdue patients' return rate) shown honestly in the owner report.
5. **Incumbent bundling.** Weave/Solutionreach can sharpen their reactivation tabs. Mitigation: stay the best at the one job — the queue, the ledger, CSV-first onboarding — and stay priced as an add-on, not a replacement.
6. **Deliverability.** Dental-office email blasts skirt spam folders. Mitigation: per-practice sending domains with SPF/DKIM, sequence pacing, suppression hygiene, and template linting (no URL shorteners, no all-caps FREE).

## Landing Page

Message architecture per MARKETING_PLAYBOOK.md (in this folder):

- **Enemy:** the empty hygiene chair at 10am — and the 600 patients in the charts who should be sitting in it.
- **One sentence:** the whole page proves *"The hygiene chair that fills itself."*
- **The device:** the chair that fills. A week-strip of hygiene slots; as touches go out, slots tick from hollow to filled, and the recovered-production counter climbs with each attributed booking — every filled slot traceable to a named (demo) patient and a timestamped touch.
- **Proof beats:** a real (design-partner, permissioned, clearly framed) attribution ledger excerpt; the overdue-list screen with its dollar total; the holdout comparison from an owner report.
- **Objection killer:** "Our front desk already calls." -> The queue calls the right ten, the sequence never forgets, and the ledger shows which. Show the two-tap disposition flow.
- **One CTA phrase, used verbatim everywhere (hero, post-proof, post-pricing, sticky mobile bar):** **"See your overdue list"**. De-risk line: 14-day trial, import in an afternoon, no PMS integration required.
