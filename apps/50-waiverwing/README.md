# WaiverWing

**Digital waivers and check-in for gyms, tour operators, and rental shops: a waiver builder with real minor/guardian support, kiosk + QR self-serve check-in, and a signed-participant database you can actually search when it matters.**

## The Problem

Walk into a climbing gym, a kayak outfitter, or a ski-rental counter and there it is: the binder. Paper waivers signed in a hurry, filed by month if filed at all. The operator's enemy is not paperwork — it's the two moments the binder fails:

1. **The line at the counter.** Every Saturday morning, a staff member reads the same clipboard speech while customers queue. Groups with kids are worse: who signs for the 14-year-old whose parent stayed home? (Answer, usually: nobody, incorrectly.)
2. **The lawsuit.** Eighteen months after an incident, a lawyer requests the signed waiver. It's in a box. Or the March binder. Or it was signed by the minor themselves, which makes it worth approximately nothing. A waiver that can't be found or can't be attributed is a waiver that never existed.

Between those two moments sits the daily grind: no way to know if a returning customer has a current waiver, no participant database for marketing or recalls, no link between "something happened on the 2pm tour" and the people who were on it.

Generic e-sign tools don't know what a guardian is. Gym-management suites bolt on a waiver screen but bury it in a system built for memberships. The focused job — waiver in, participant searchable forever, check-in in seconds — is worth a focused tool.

## Target User

- **Primary:** owner-operators of activity businesses with walk-in risk exposure: climbing/boulder gyms, trampoline parks, martial-arts and CrossFit-style gyms, tour operators (kayak, rafting, ATV, zipline), and rental businesses (bikes, boats, ski/board, e-bikes).
- **Secondary:** event organizers (races, obstacle events) needing one-off waves of signatures; multi-location franchises later.
- **Buyer profile:** the owner or GM. Not technical, extremely busy, legally anxious after one near-miss. Buys when they see a phone scan a QR code, a guardian sign for two kids, and the record surface by name in two seconds.
- **Not a target (yet):** hospitals/medical consent, HR onboarding, enterprises with legal-ops teams.

## Market & Profitability

- **The audience is wide and physical:** the US counts a record [~55,000+ fitness facilities serving 77M members](https://www.healthandfitness.org/how-77-million-fitness-members-work-out-new-hfa-data-reveals-shifting-equipment-training-and-membership-trends/) — before counting climbing gyms, trampoline parks, and studios — plus [thousands of US tour operators](https://www.ibisworld.com/united-states/number-of-businesses/tour-operators/1482/) and a long tail of rental businesses. Nearly all of them make someone sign something before the fun starts.
- **The category is proven at low price points:** incumbent [Smartwaiver prices from $19 to $155+/mo by waiver volume](https://www.smartwaiver.com/pricing), and WaiverForever sits in the same band — evidence operators pay monthly for exactly this job, and that the segment's pricing tolerance is real but capped (which suits a lean builder).
- **Structural stickiness:** the signed-waiver archive is a legal record with multi-year retention. Leaving a waiver tool means migrating (or losing) your liability history — churn is low once the database has a season in it.
- **Category economics:** forms + signatures + storage at 85-90% gross margin; volume costs (storage, email) are cents per customer. Realistic outcome: **$10k-$60k MRR** (250-1,200 locations at ~$45-60 blended ARPU) over 2-3 years, with seasonality smoothed by the gym segment.

## Monetization & Pricing

Priced per location, tiered by signed-waiver volume — the metric that tracks value and the incumbents' own yardstick, kept simpler (three tiers, no surprise overage cliffs; soft-cap with an upgrade prompt).

| Plan | Price | Volume | Includes |
|---|---|---|---|
| **Counter** | $29/mo | up to 200 waivers/mo | Waiver builder, minors/guardian flow, QR self-serve signing, searchable participant database, PDF export |
| **Front Desk** | $59/mo | up to 1,000 waivers/mo | Everything in Counter + kiosk mode (PWA), check-in dashboard, expiry rules & re-sign prompts, incident notes, CSV export |
| **Operator** | $99/mo | up to 5,000 waivers/mo | Everything in Front Desk + 3 locations, multiple kiosks, API-lite (webhook out), branded emails, priority support |

14-day free trial with full features; annual = 2 months free (sold hard before summer season to outfitters, January to gyms).

## MVP Feature List

- [ ] Waiver builder: liability text blocks, initialed clauses, custom questions (emergency contact, medical flags), signature block — versioned, so every signature pins the exact text signed
- [ ] Minors/guardian support: one guardian signs for multiple minors in one flow; guardian relationship + age capture; minors linked to the guardian's record; age-of-majority rules per waiver
- [ ] QR self-serve: printable QR per location/activity; customers sign on their own phones before arrival or in line
- [ ] Kiosk mode: full-screen tablet PWA at the counter — attract screen, big type, sign, done; auto-resets between customers; works through brief connectivity drops (offline queue, sync on reconnect)
- [ ] Check-in: staff dashboard showing today's signed participants; search-as-you-type by name; returning-customer lookup ("current waiver on file" in one glance); manual check-in tap
- [ ] Waiver expiry rules: valid-for durations (visit, 1 year, forever); expired participants prompted to re-sign on next visit
- [ ] Searchable participant database: every signer, their waiver versions, signature evidence (timestamp, IP/device, waiver text hash), guardian/minor links; instant name/email/phone search
- [ ] Signed-waiver PDF export: single or bulk, with evidence summary — the "here it is, counsel" artifact
- [ ] Incident notes: staff logs an incident (what, when, where, who) and links participants — the incident file pulls the exact signed waivers alongside
- [ ] Billing (Stripe, three plans, trial); volume soft-caps with upgrade prompts

Post-MVP (explicitly cut from v1): bookings/scheduling integrations (Peek, FareHarbor), gym-suite integrations (Mindbody), marketing exports/automation, photo capture, hardware bundles, multi-language waivers.

## Differentiation

1. **Minors done right, front and center.** One guardian, three kids, one flow, legally coherent records with relationship capture. This is the #1 daily pain for family-facing operators and the sloppiest corner of both paper and generic e-sign.
2. **The lawsuit scenario is the product demo.** Search "Maya Torres" → her waiver, signed 14 months ago by her mother, exact text version, evidence summary, PDF in one tap. Competitors sell form-filling; WaiverWing sells *retrieval*.
3. **Incident notes tied to waivers.** When something happens, the operator builds the file in the same tool that holds the waiver — a wedge feature no low-cost incumbent treats seriously.
4. **Kiosk that survives real counters.** Offline-tolerant PWA on whatever tablet exists; no app-store install, no proprietary hardware.
5. **Simple, honest volume pricing.** Three tiers, soft caps, no per-template fees or setup charges — directly against incumbent pricing-page fine print.

## Go-to-Market Channels

1. **SEO on job keywords:** "digital waiver for climbing gym," "online waiver with parent signature," "tour operator waiver app," "waiver template [activity]" — high intent, thin incumbent content. Free activity-specific waiver templates (attorney-reviewed skeletons, clearly labeled "have your lawyer confirm") as lead magnets.
2. **Vertical communities:** climbing-gym owner groups, IFSC/CWA industry lists, tour-operator forums and Facebook groups (Arival community), rental-industry associations; niche podcasts and newsletters are cheap and precise.
3. **The QR moment as marketing:** every customer-facing QR sign says "Waivers by WaiverWing" (removable on Operator) — the product is seen by thousands of end customers standing in exactly the businesses we sell to.
4. **Insurance and risk-management channel:** brokers who insure activity businesses recommend documentation practices; a co-branded "waiver hygiene checklist" makes WaiverWing the answer to their own advice.
5. **Comparison pages:** "WaiverWing vs Smartwaiver," "vs WaiverForever," "vs paper binder" — the binder page is the fun one and the honest one.

## Competition

| Competitor | Pricing | Weaknesses |
|---|---|---|
| **Smartwaiver** | $19-$155+/mo by volume | The category incumbent: dated UX, clunky minor flows, kiosk requires care, pricing tiers with overage anxiety. Solid but sleepy — a classic "out-position on product feel" target. |
| **WaiverForever** | ~$19-129/mo | Similar shape; mobile apps over web, weaker search/database story, incident linkage absent. |
| **Jotform Sign / DocuSign** | ~$25-99+/mo | Generic e-sign: no guardian/minor model, no check-in, no participant database, no kiosk. Wins only when the buyer doesn't know the category exists. |
| **Mindbody / gym suites** | $129-$349+/mo suites | Waivers as a buried checkbox inside a membership system; irrelevant to tour/rental; overkill and overpriced for waiver-first needs. |
| **The paper binder** | ~Free | The real incumbent. Beaten by the Saturday-line story, the minor-signature horror story, and the two-second retrieval demo. |

## Key Risks

1. **Legal-adjacent product, non-lawyer team.** We provide the signing/retrieval machinery, not legal advice — but buyers will conflate them. Mitigation: template skeletons clearly marked for attorney review, no enforceability promises, an "evidence summary" framing (what was signed, by whom, when) that stays factual, and terms that draw the line explicitly.
2. **Incumbents are cheap and entrenched.** Smartwaiver/WaiverForever are good enough for many. Mitigation: win on the minor flow, retrieval speed, incident linkage, and modern kiosk UX; convert at season boundaries when operators re-evaluate; import tools for competitors' CSV exports.
3. **Kiosk environment chaos.** Old tablets, flaky Wi-Fi, sticky fingers. Mitigation: PWA with offline queue and aggressive auto-recovery, a supported-devices doc, and a "kiosk health" indicator staff can see.
4. **Seasonality (tour/rental segment).** Outfitters pause in the off-season. Mitigation: gyms are counter-seasonal ballast; annual plans discounted into the pre-season; pause-not-cancel plan preserving the archive (small retention fee).
5. **Data protection duty.** The participant database holds PII including minors'. Mitigation: encryption at rest, role-based access, retention policies per location, breach-response plan, and COPPA-aware minimalism (collect only what the waiver needs).

## Setup

Requires Node 20+ and a Postgres 14+ database (the first migration enables
`pg_trgm`, which the participant search depends on).

```bash
npm install
cp .env.example .env.local          # DATABASE_URL and AUTH_SECRET are the only
                                    # two that must be real to run the product
npm run db:migrate                  # creates the schema and the trigram indexes
npm run db:seed                     # optional: a demo gym with a Saturday's traffic
npm run dev                         # http://localhost:3050
```

`npm run db:seed` prints the login it created, the QR sign link and the kiosk
URL with its PIN. Without it, sign up at `/signup`: choosing an activity template
publishes a starter waiver, so the QR poster and the kiosk work immediately.

**What each optional service buys you.** Nothing below is needed to take a real
signature:

| Unset | What happens |
|---|---|
| `STRIPE_SECRET_KEY` | The billing screen says Stripe is not configured; plans still display. |
| `S3_BUCKET` / `AWS_ACCESS_KEY_ID` | PDFs render per request instead of being cached. The record is in Postgres either way. |
| `RESEND_API_KEY` (or `DRY_RUN=1`) | Receipts, sign links and digests are logged instead of sent, and the UI shows the link so staff can read it out. |
| `CRON_SECRET` | `/api/cron/tick` refuses to run at all, rather than defaulting to open. |

### The three URLs

- `/` — the marketing page.
- `/sign/<poster token>` — what a customer's phone opens from the QR poster. No
  account, no app. Print the poster from **Settings → QR poster**.
- `/kiosk/<location id>` — the counter tablet. Enter the kiosk PIN once, then add
  the page to the tablet's home screen; it runs full-screen, resets between
  signers, and queues signatures locally when the Wi-Fi drops.

### Scripts

```bash
npm run typecheck     # tsc --noEmit
npm test              # node:test via tsx — domain logic, no database needed
npm run build         # production build
npm run db:generate   # new migration from a schema change
```

### Deploying

Vercel + Neon; see the repo's `DEPLOYING.md`. Use Neon's **pooled** connection
string, run migrations from your machine rather than from a build step, and set
`CRON_SECRET` so `vercel.json`'s daily cron entry is authorised. The cron job
(expiry roll + digest) is written to be correct at any frequency, so Hobby's
once-a-day floor is fine.
