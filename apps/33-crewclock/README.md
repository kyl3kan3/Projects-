# CrewClock

**GPS-verified time tracking and job costing for field crews. The timesheet that can't be rounded up — and the job cost you see before the job loses money.**

## The Problem

Paper timesheets round up. A worker writes "7:00" when the truck rolled in at 7:20; the foreman signs it from memory on Friday; the office keys it into payroll on Monday. Fifteen padded minutes a day per worker, at a $28/hour loaded rate, is $7 a day — $35 a week, roughly **$1,800 a year per worker**. A 15-person crew leaks ~$27,000 a year before anyone commits actual fraud. Industry studies back the arithmetic: the American Payroll Association has estimated time theft costs businesses 1.5-5% of gross payroll, and buddy punching alone touches a large majority of US businesses (APA, cited in payroll-industry surveys). Roughly 40% of US contractors still run labor hours on paper, and a University of Utah study found paper time-and-attendance error margins in construction as high as 40% (hh2/University of Utah, 2023).

The second leak is quieter and bigger: **jobs that lose money silently**. A patio gets bid at 120 labor hours. It quietly runs 158 because nobody tallies hours against the bid until the office invoices — weeks after the crew left. The owner learns the job lost money at the exact moment nothing can be done about it. Every sub knows this story; almost none have a number that updates daily.

The fixes are known but unbuilt in most 5-50-person shops:

1. **Clock-in that's tied to the ground**: GPS-verified punches at the job site, so hours mean "on site," not "wrote it down."
2. **Live labor cost vs bid**: every entry priced at the worker's loaded rate, rolled up against the bid the day it happens.
3. **Overtime caught before it exists**, not on the payroll report after.
4. **Payroll export that just works**: a CSV the bookkeeper drops into ADP or Gusto without re-keying.

None of this is exotic technology. It's a punch clock, a map circle, and arithmetic — applied where the incumbents haven't bothered to speak the crew's language.

## Target User

- **Primary:** field-service and construction subcontractors with 5-50 field workers — framing, concrete, painting, landscaping, roofing, electrical subs. This is a two-audience product: the **buyer** is the owner or office manager who eats the payroll leak; the **daily user** is the crew, who will abandon anything that takes more than ten gloved seconds. Both must love it or neither pays.
- **Secondary:** cleaning, pool service, and HVAC companies with crews that start the day at a customer site rather than an office.
- **Buyer profile:** an owner who still runs jobs from a truck, signs payroll personally, and suspects — but cannot prove — that Fridays are padded. They will pay $49/month the first week the export saves the bookkeeper an afternoon.
- **Daily-user profile:** a crew member with a phone in a work glove, possibly Spanish-dominant, zero patience for logins. The entire crew experience must fit in ten seconds at 6:55am: open, tap, ring draws, pocket.
- **Not a target (yet):** enterprise GCs on Procore/Autodesk-scale suites, union shops with certified-payroll mandates (Davis-Bacon reporting is a Phase 3 question), and solo operators with no crew to track.

## Market & Profitability

- **Category economics:** per-seat pricing on a crew that grows is structural expansion revenue. At $8/user with a $49 floor, the median 20-seat customer is **$160/month ARPU** — and the customer adds seats when they win work, which is exactly when they're happiest. The product is webhooks, a queue, and CSV files; infrastructure margins run past 90% (see ARCHITECTURE.md).
- **The market is real and growing:** the global time tracking software market was valued around $6.1B in 2025 with mid-teens percentage annual growth forecast (Mordor Intelligence, 2025; other analysts place 2024 estimates between $3.4B and $7.1B — definitions vary, direction doesn't).
- **The bilingual bet is demographic, not cosmetic:** Hispanic workers make up roughly a third of the US construction workforce — 32-34% by recent counts, double their share in 2000 (CPWR, 2024; NAHB, 2024). A crew app whose crew-facing half is genuinely Spanish-first for those who want it is selling to the actual workforce, not the org chart. No major incumbent treats ES as more than a settings toggle.
- **The incumbent to beat is paper:** with ~40% of contractors still on paper timesheets (hh2, 2023), the biggest competitor has no sales team and no switching cost — but also no login to migrate. Win by being easier than the clipboard on day one.
- **Churn realities:** SMB field service churns hard — companies fold, winter idles landscapers, a new office manager brings her old tools. Expect 3-5%/month logo churn early, offset by seat expansion. Realistic ceiling: **$25k-$100k MRR over 3-4 years** (150-600 companies at ~$160 blended ARPU). This is a durable small-business, not a rocket.

Expect: a grind of trust-building with owners who've been burned by software before, then strong retention once CrewClock runs a payroll — switching time systems mid-year is painful in the right direction. Don't expect: virality, or any customer who reads a changelog.

## Monetization & Pricing

Per-user pricing with a monthly floor, so tiny crews still clear our support cost and growing crews expand revenue without a sales call.

| Plan | Price | Includes |
|---|---|---|
| **Crew** | $8/user/mo ($49/mo minimum) | Geofenced clock in/out, offline PWA capture, EN/ES crew UI, timesheet review + approve with audit trail, OT alerts, ADP + Gusto CSV export |
| **Company** | $12/user/mo ($49/mo minimum) | Everything in Crew + jobs & bid import, live labor cost vs bid, budget threshold alerts, multi-crew reporting, API access (Phase 3) |
| **Annual** | 2 months free (pay for 10) | Either plan; billed once, seats trued-up quarterly |

Notes on the model:

- **Why per-user with a floor:** per-user tracks value (every tracked worker is recovered minutes), and the $49 floor keeps a 3-person crew from being a $24 support liability. At 7+ users the floor disappears into the math and nobody notices it.
- **Why two plans:** time tracking is the wedge; job costing is the lock-in. Owners start on Crew to kill the paper timesheet, then upgrade to Company the first time they wonder whether the Hendricks patio is making money. The upgrade is an in-app moment, not a sales conversation.
- **No free tier, 30-day trial.** A free tier attracts 2-person crews who churn seasonally and cost support. Thirty days spans a full payroll cycle — the trial ends after the owner has run at least two exports, which is when the habit is formed.
- **Annual is the seasonal-churn hedge.** Two months free converts landscapers and painters who would otherwise cancel every winter; paired with the off-season pause (see Key Risks), it turns seasonal businesses into annual revenue.

## MVP Feature List

- [ ] Geofenced clock in/out: GPS capture on punch, distance-to-site check against job_site radius, honest accuracy handling (inside / outside / GPS unavailable — never fake precision)
- [ ] Offline-tolerant PWA time capture: punches queue locally (IndexedDB) and sync with server-side dedupe when signal returns
- [ ] Crew UI fully bilingual EN/ES: every crew-facing string localized, language chosen per user and persisted, Spanish reviewed by a native speaker
- [ ] Jobs + bids: create job, attach site(s), import labor budget (hours and dollars) from the bid
- [ ] Live job labor cost vs bid: entries priced at loaded hourly rates, rolled up per job, thresholds at 80% and 100% of budget
- [ ] Weekly OT threshold alerts: projected hours cross the OT line mid-week -> email/SMS to the owner *before* overtime exists
- [ ] Timesheet review/approve: owner or office edits entries with a full audit trail (who changed what, from what, when, why)
- [ ] Payroll CSV export in ADP and Gusto column formats, per pay period, download or email to the bookkeeper
- [ ] Billing for CrewClock itself (Stripe per-seat subscriptions with the $49 floor)

Post-MVP (explicitly cut from v1): native iOS/Android apps, QuickBooks/ADP API sync, scheduling/dispatch, per-task cost codes, photo attachments, certified payroll.

## Differentiation

1. **Bilingual as a first-class feature, not a toggle afterthought.** The crew half of the product is designed in both languages simultaneously — layouts absorb longer Spanish strings, onboarding materials ship in ES, and the foreman can run a mixed-language crew where each worker sees their own language. Incumbents localize menus; CrewClock localizes the product.
2. **Job costing tied to bids, not just hours.** busybusy and Workyard show you hours by job. CrewClock shows you *the gap between what you bid and what you're burning*, daily, which is the number that decides whether the company makes money.
3. **Honest GPS.** Phones lie about location constantly (accuracy swings 5m-500m). CrewClock records the accuracy radius with every punch and shows "inside fence," "outside fence," or "GPS unavailable" — never a confident dot that's actually a guess. Trust in the data is the product; fake precision would poison it.
4. **Alerts before overtime, not after.** Everyone's report shows OT that already happened. CrewClock projects the week mid-week and tells the owner Wednesday that Miguel will cross 40 hours Friday — while the schedule can still change.
5. **Simple per-seat pricing vs quote-walled incumbents.** QuickBooks Time and Connecteam bury real pricing under bundles, base fees, and "contact sales" tiers. $8 or $12 a head, $49 minimum, on the pricing page, forever.

## Go-to-Market Channels

In priority order:

1. **Spanish-language contractor communities.** Facebook groups for contratistas, Spanish-language trade radio spots in Texas/Florida/California metros, and ES-first landing pages. The bilingual feature is the ad. Nobody else is buying this attention.
2. **Payroll-provider partner listings.** Gusto's partner directory and bookkeeper marketplaces; the export formats make CrewClock a natural "works with" listing, and payroll pros are the trusted advisors who tell contractors what to use.
3. **Bookkeeper/accountant channel.** The bookkeeper feels timesheet pain most (re-keying, chasing, deciphering). A 20% recurring referral cut makes CrewClock their default recommendation across their contractor clients.
4. **SEO on high-intent long-tail.** "timesheet app for construction crews espanol," "gps time clock for landscaping crew," "adp csv format field workers," "job costing app for subcontractors." Weak incumbent content in Spanish especially; ship pages in both languages.
5. **Trade suppliers and counter programs.** Paint stores, landscape supply yards, and lumber counters see every sub weekly. Counter cards and a supplier referral program put CrewClock where owners actually stand at 6:45am.
6. **Comparison pages.** "CrewClock vs QuickBooks Time," "ClockShark alternative," "busybusy vs CrewClock" — switchers are already sold on the category; catch them mid-search.

## Competition

| Competitor | Pricing | Weaknesses |
|---|---|---|
| **QuickBooks Time (ex-TSheets)** | ~$20-$40/mo base + $8-$10/user | The default because QuickBooks bundles it. Priced for offices, not crews; job costing requires the wider QB stack; Spanish support is shallow; base-fee pricing stings small crews. |
| **ClockShark** | ~$40/mo base + $8-$10/user | Solid construction focus, but base fee + per-user math is opaque at small sizes; job costing is basic hours-by-job; the crew-facing app is English-designed with translation bolted on. |
| **busybusy** | Free tier; ~$10-$17/user for paid | Good GPS features; free tier anchors it as a "free app" so upgrades stall. Costing is hours-oriented, not bid-vs-actual. Reporting aimed at bigger contractors. |
| **Workyard** | ~$6-$13/user + $50 base | Strong GPS accuracy story. Costing again lacks the bid comparison; pricing pushes upmarket; no meaningful ES-first experience. |
| **Connecteam** | Free < 10 users; then ~$29-$99/mo tiers | An everything-app (chat, forms, scheduling); time clock is one module among twenty. Jack-of-trades depth problem; SMB contractors don't want an HR suite. |
| **Paper + the foreman's memory** | "Free" | The real incumbent. Costs 1.5-5% of payroll in padding and errors, plus the bookkeeper's Monday. No switching cost, no login — but also no accountability. We must beat the clipboard on speed, or lose. |

## Key Risks

1. **GPS spoofing and buddy-punching limits.** Mock-location apps exist; a phone can be handed to a buddy. Mitigation: record accuracy + device fingerprint per punch, flag impossible-travel patterns and repeated same-device multi-user punches for review — and be honest in marketing that GPS verification raises the cost of cheating rather than making it impossible.
2. **Worker-privacy backlash and state GPS-consent laws.** Several states require consent for employee location tracking, and crews rightfully hate being followed. Mitigation: **track only on the clock — make it the feature.** Location is captured at punch events, never in the background, never off shift; workers see exactly what the boss sees; consent screens ship in EN and ES. Privacy-by-design is a sales line here, not a legal tax.
3. **PWA background-location constraints.** Mobile browsers won't give a web app continuous background GPS — and shouldn't. Mitigation: the product is designed around **foreground punch events**, not continuous tracking; geofence checks happen at clock-in/out when the app is open. The architecture never depends on a capability browsers don't grant.
4. **Incumbent bundling.** QuickBooks Time rides inside QuickBooks, which most of these businesses already use for accounting. Mitigation: win the crew (QB Time's weakest surface), price under the bundle for small teams, and make the Gusto/ADP CSV so clean that the accounting system doesn't matter.
5. **Seasonal churn.** Landscapers idle in January; exterior painters pause all winter. Mitigation: an explicit **off-season pause** ($10/mo data-retention state) instead of forcing cancellation — pausing customers return in March; canceled ones re-evaluate the market.
6. **Payroll-format edge cases.** ADP and Gusto import formats vary by client configuration (earnings codes, OT rules, department mappings). A broken export destroys the core promise. Mitigation: golden-file tests per format, a pre-export validator that flags unmapped workers/codes, and sandbox-verified templates before any customer's first live payroll.
