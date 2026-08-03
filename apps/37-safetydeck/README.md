# SafetyDeck

**The OSHA compliance kit for small construction and field companies: toolbox talks with on-phone crew sign-off, an incident log that generates OSHA 300/300A output, and a cert-expiry tracker -- so the paperwork exists when the inspector asks.**

## The Problem

When OSHA shows up -- after an incident, a complaint, or a drive-by -- the first questions are documentary: show me your training records, your toolbox-talk attendance, your injury log, your posted 300A. At a small contractor, those records live on clipboards in trucks, in a foreman's photo roll, or nowhere. The gap between "we did the safety talk" and "we can prove we did the safety talk" is the citation.

The stakes are set by statute and adjusted annually: as of 2025, a single serious violation runs up to **$16,550**, and a willful or repeated violation up to **$165,514** ([osha.gov](https://www.osha.gov/news/newsreleases/osha-trade-release/20250114), [osha.gov](https://www.osha.gov/penalties)). Citations usually arrive in multiples. Meanwhile the recordkeeping duty itself (29 CFR 1904: the 300 log, the 301 reports, the 300A annual summary posted February-April) applies to most construction employers with more than 10 employees -- and the enterprise EHS platforms that automate it are priced and designed for safety departments the small contractor doesn't have.

SafetyDeck is the kit sized to the actual company: a weekly toolbox-talk library the foreman runs from a phone, crew sign-off captured on-site (signature + optional photo of the huddle), an incident log that asks plain-language questions and produces correct OSHA 300/300A output, and a tracker that flags expiring certs (OSHA 10/30, first aid, fit tests, licenses) before they lapse.

## Target User

- **Primary:** US construction and field-service companies with 10-100 field employees -- GCs, roofers, electrical/mechanical subs, excavation, landscaping, tree care -- where "safety officer" is a hat worn by an owner or ops manager.
- **Secondary:** light manufacturing and warehousing shops with the same recordkeeping duty; franchise trades operations standardizing across crews.
- **Buyer profile:** the owner or ops manager who has either eaten a citation, watched a competitor eat one, or just lost a GC bid for lacking a written safety program. The daily user is the foreman, on a phone, with gloves.
- **Not a target (yet):** enterprises with EHS departments (Intelex/Cority territory), companies under 10 employees who are 1904-exempt (they still buy for GC requirements, but they're not the design center), or non-US regimes.

## Market & Profitability

- **The base is wide and small.** Roughly **83% of US construction firms have fewer than 20 employees**, and about 90% have 10 or fewer ([Census data via learningwithoutscars.org](https://learningwithoutscars.org/why-83-of-construction-companies-drive-less-than-23-of-employment/), [tylerestimating.com](https://tylerestimating.com/blog/how-many-construction-companies-are-in-the-us/)) -- the buyer pool in the 10-100 employee band is hundreds of thousands of firms, nearly all unserved by enterprise EHS.
- **The price anchor is statutory.** One avoided serious citation pays for **23 years** of the $59 plan at 2025 penalty levels ([osha.gov](https://www.osha.gov/news/newsreleases/osha-trade-release/20250114)). No discretionary-software objection survives that arithmetic, and GC prequal requirements (ISNetworld, Avetta, bid packets demanding a safety program) add a second, commercial forcing function.
- **Realistic ceiling:** **$25k-$120k MRR** over 2-4 years (roughly 300-1,200 accounts at ~$85-100 blended ARPU). Compliance tools churn slowly -- the record history itself is the lock-in; deleting your account means deleting your defense.
- **Margins:** storage (photos/signatures) and email/SMS nudges are the only variable costs; gross margin >90%.

## Monetization & Pricing

Priced by field headcount -- the axis that tracks both value and OSHA exposure. Every plan includes every feature; no compliance features held hostage on higher tiers (holding the 300A behind a paywall would be product malpractice).

| Plan | Price | Field employees | Includes |
|---|---|---|---|
| **Crew** | $59/mo | up to 15 | Toolbox-talk library + scheduling, phone sign-off (signature + photo), incident log + OSHA 300/300A output, cert tracker, inspection binder export |
| **Company** | $99/mo | up to 40 | Everything in Crew + multiple crews/sites, Spanish-language talks and sign-off, custom talk upload, reminder escalations |
| **Fleet** | $149/mo | up to 100 | Everything in Company + multi-entity, API export, priority support |

Notes on the model:

- **Annual = 2 months free**, sold against the citation ("$590/year vs $16,550 per serious violation").
- **The trial is a real Monday.** 14 days: schedule one talk, collect real signatures at one jobsite huddle, print the binder page. The artifact converts.
- **No free tier.** Records that matter legally shouldn't live on an abandonable free plan; the $59 floor is the seriousness filter.

## MVP Feature List

- [ ] Auth + company setup (Auth.js); crews, sites, and field-employee roster (no logins needed for field workers)
- [ ] Toolbox-talk library: 52+ seeded talks (fall protection, ladders, trenching, heat, silica, lockout...), plain language, 5-minute reads, printable; custom talk upload
- [ ] Talk scheduling: weekly cadence per crew; foreman gets the Monday link (SMS/email)
- [ ] On-phone sign-off: foreman opens the talk on a phone via signed link (no app install, no login), crew members sign on the screen sequentially; optional photo of the huddle; GPS-stamp and time-stamp
- [ ] Offline-tolerant PWA capture: sign-offs queue locally and sync when coverage returns (jobsites have no bars)
- [ ] Attendance records: immutable once synced, exportable per crew/site/date range
- [ ] Incident log: guided plain-language intake (what/who/where/severity/days away or restricted) that classifies recordability per 1904 rules and emits OSHA Form 300 rows, 301 detail, and the year-end 300A summary (signable PDF for the February posting)
- [ ] Severe-incident prompts: fatality/hospitalization intake surfaces OSHA's 8/24-hour reporting duty with the correct phone/portal info (guidance, not filing)
- [ ] Cert tracker: per-employee certs with expiry dates, photo of the card, 60/30/7-day escalating reminders to ops
- [ ] Inspection binder: one-click export -- talk attendance, incident log, 300A, cert matrix -- as a dated PDF bundle
- [ ] Billing for SafetyDeck itself (Stripe Billing, three tiers)

Post-MVP (explicitly cut from v1): Spanish content (Company tier, fast follow), JHA/pre-task plans, equipment inspections, observation/near-miss programs, ISNetworld/Avetta export packs, state-plan variants beyond federal OSHA forms.

## Differentiation

1. **Phone-first sign-off with no worker accounts.** Incumbent EHS tools assume every worker has a login and a downloaded app. SafetyDeck assumes a foreman's phone, gloves, and zero patience: one link, sequential signatures, a photo, done in four minutes. The capture flow is the moat.
2. **The 300A actually comes out the other end.** Safety apps log incidents; almost none of the small-business ones emit a correct, signable 300/300A. SafetyDeck treats the government artifact as the deliverable, with 1904 recordability logic encoded in the intake questions.
3. **The inspection binder.** The buyer's nightmare is an inspector in the parking lot. One button produces the dated, organized bundle -- the demo is the product.
4. **Offline is a feature, not a bug report.** Jobsite basements and rural rights-of-way have no signal; local-first sign-off capture with sync is designed in from day one.
5. **Priced against the fine, not against software.** $59-149/mo sits under every EHS competitor's floor (SafetyCulture and friends price per user, which explodes at 40 field employees) while the citation math makes the ROI conversation trivial.

## Go-to-Market Channels

In priority order:

1. **GC prequalification pressure.** Small subs constantly get asked for "your safety program and training records" in bid packets and ISNetworld/Avetta questionnaires. Content + templates targeting "safety program for subcontractor bid," plus a shareable "our safety program" page subs can hand GCs, ride a commercial (not just regulatory) forcing function.
2. **Insurance and workers'-comp channels.** Carriers, brokers, and group-rating programs actively push loss-control tooling to small contractors; a documented safety program moves premiums. Broker referral kit + a "give this to your insured" one-pager.
3. **SEO on the paperwork.** "toolbox talk template," "OSHA 300A form deadline," "toolbox talk sign in sheet PDF," "OSHA 10 expiration tracker." Massive evergreen search from exactly the buyer; free printable talks as lead magnets with the punchline "or stop printing."
4. **Trade associations and locals** (ABC/AGC chapters, roofing/electrical/landscape associations): newsletters, webinars ("what OSHA asks for first"), member discounts.
5. **February 300A season.** The 300A must be posted Feb 1-Apr 30; an annual campaign ("is your 300A posted?") lands during a legally-timed panic window every year.

## Competition

| Competitor | Pricing | Weaknesses |
|---|---|---|
| **SafetyCulture (iAuditor)** | ~$24/user/mo | Per-seat pricing explodes for field crews; inspection-checklist DNA, not OSHA recordkeeping; workers need accounts. |
| **KPA / Vector EHS / Intelex** | Quote-only, $5k-50k+/yr | Enterprise EHS: sales-led, admin-heavy, built for safety departments. |
| **Raken / Procore dailies** | $30-66+/user/mo, suite pricing | Safety is a checkbox inside daily-report/PM suites; no 300A; requires suite adoption. |
| **SafetyMeetingApp / WeeklySafety** | ~$10-50/mo | Closest in spirit (talk libraries); weak or absent incident-to-300A pipeline, cert tracking, offline capture; dated UX. |
| **Paper + clipboard + the truck** | Free | The real competitor. Beaten by making sign-off faster than paper (one link, no login) and by the binder moment paper can never deliver. |

## Key Risks

1. **Regulatory correctness is existential.** A wrong recordability classification or a bad 300A is worse than paper. Mitigation: encode 1904 decision logic conservatively with "consult counsel" outs, cite the rule text inline, version the form logic per reporting year, and have a safety consultant review before launch. Position as recordkeeping tooling, not legal advice -- in copy and in contract.
2. **Foreman adoption.** If Monday sign-off feels like admin, it dies in week 3. Mitigation: the flow must beat paper on speed (target: under 5 minutes for an 8-person crew), work offline, and need zero training; measure weekly active crews as the north-star metric.
3. **Regulatory change risk.** Penalty amounts adjust annually; electronic-submission rules (1904.41) and state plans shift. Mitigation: form logic and penalty copy are versioned data, not hardcoded; an annual compliance-review task is part of the operating cadence.
4. **Signature/photo data sensitivity.** Worker signatures, injury details, and site photos are sensitive. Mitigation: signed-URL-only storage, per-company encryption boundaries, immutable audit logs, retention aligned to 1904's five-year duty, and a clean data-export path (their records are theirs).
5. **Incumbent bundling.** Procore/Raken could bolt on a 300A generator. Mitigation: they sell suites to companies with back offices; the phone-first, sub-$150, no-worker-accounts wedge is structurally unattractive to them.
6. **Seasonal/economic churn.** Construction slowdowns cut headcount. Mitigation: annual billing, the five-year record-retention duty (leaving means losing your defense), and pause states that preserve records read-only.

---

## Running it

Requirements: Node 20+, a Postgres database. Nothing else is needed to run the
whole product locally — object storage, SMS, email and Stripe all degrade to
documented local behaviour when their credentials are absent.

```bash
cp .env.example .env.local          # fill in DATABASE_URL, AUTH_SECRET, CREW_TOKEN_SECRET
npm install
npm run db:migrate                  # creates the schema and the immutability trigger
npm run db:seed                     # loads the 55-talk library (idempotent)
npm run dev                         # http://localhost:3037
```

Then: sign up, add a crew with a foreman phone number, add the field roster, and
press **Send this week's talk**. With `DRY_RUN=1` the crew link is written to the
server log instead of being texted; the dashboard's **Resend the crew link**
button also prints it on screen so you can open it on a phone.

### What each credential unlocks

| Unset | What happens |
|---|---|
| `R2_*` | Photos and PDFs are stored in Postgres (`stored_objects`) and served through the same authorised route. Everything works, including binder export. |
| `RESEND_API_KEY`, `TWILIO_*` | `DRY_RUN` turns itself on: messages are logged and recorded in the reminder ledger, so the sweep is still fully exercisable. Nothing leaves the building. |
| `STRIPE_SECRET_KEY` | Checkout explains that billing is not configured. **No compliance feature is gated** — talks, sign-off, the 300/300A and the binder do not depend on billing. |
| `CRON_SECRET` | `/api/cron/tick` returns 503 and refuses to run, rather than defaulting to open. |

### The scheduled sweep

One route does all the periodic work — the Monday fan-out, missed-talk detection,
the 60/30/7/overdue cert ladder, and the February 300A reminders:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3037/api/cron/tick
```

Daily is the right cadence and is what `vercel.json` schedules. Running it twice
in a day is a no-op: every rung is pinned to a calendar date and deduped by a
unique index on `(target, rung, channel)`.

### Tests

```bash
npm run typecheck
npm test            # 63 tests: 1904 recordability, the cert ladder, date maths,
                    # plan limits, 300A totals, crew tokens, the talk parser
```
