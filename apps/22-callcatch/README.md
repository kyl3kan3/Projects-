# CallCatch

**An AI receptionist for local businesses: every missed call gets answered, texted back, and booked — 24/7, for less than one lost job costs.**

---

## The Problem

A plumber under a sink, a salon mid-blowout, a dental front desk at lunch: local businesses miss ~40–60% of inbound calls, and a missed call is usually a lost job — 80%+ of callers won't leave a voicemail, they just call the next listing. For a home-services business where an average job is $300–$3,000, missing two calls a week is tens of thousands a year in lost revenue.

The existing fixes are bad: human answering services cost $1–2/minute with script-following operators who can't book anything; voicemail is where leads die; hiring front-desk staff for after-hours is absurd. Meanwhile the callers just want three things answerable by any competent system: *do you do X, what does it roughly cost, when can you come?*

## Target User

- **Primary:** home services (plumbing, HVAC, electrical, roofing, landscaping) and appointment businesses (salons, med spas, dental, auto shops) — 1–20 employees, high job value, phone-first customers.
- **Buyer:** the owner; **channel buyer:** the marketing agencies that already sell these businesses websites and Google Ads (white-label opportunity).
- **Not targeting:** restaurants (reservations are solved), enterprise call centers, emergency dispatch (liability).

## Market & Profitability

- Local-business willingness to pay is anchored by what this replaces: answering services run $200–$500/mo, and one saved job/month pays for the tool. **$99–$299/mo pricing meets zero resistance when framed against a single missed $800 job.**
- This niche is one of the highest-ACV micro-SaaS opportunities available to small teams right now; realistic outcome **$15k–$100k+ MRR** (100–400 customers at ~$150 blended — very reachable via agency channel).
- Voice AI costs have collapsed: a handled call costs $0.10–$0.50 all-in. At 100 calls/mo per customer that's ~$30 cost against $149 price — 70–80% margins.
- Churn is the watch item (SMBs churn at 3–6%/mo); the counter is being wired into their calendar and lead flow — rip-out pain.

## Monetization

| Tier | Price | Limits |
|------|-------|--------|
| Missed-Call Rescue | $99/mo | Missed-call text-back + AI SMS conversation + lead capture (no voice answering) |
| AI Receptionist | $199/mo | Everything + AI answers calls live 24/7, FAQ answering, appointment booking (150 calls/mo) |
| Pro | $299/mo | 400 calls/mo, multi-location, CRM integrations, call recordings + transcripts |

Setup fee ($99–$249) is standard in this market and worth charging — it filters tire-kickers and funds onboarding. Agency white-label: 30% margin to resellers.

## MVP Features

- [ ] Phone-number provisioning or forward-on-no-answer from the business's existing line (Twilio)
- [ ] **Missed-call text-back within 5 seconds** ("Sorry we missed you! How can we help?") → AI SMS conversation that qualifies the lead (job type, location, urgency) and captures contact info
- [ ] AI voice answering: greets in the business's name, answers FAQs from a knowledge profile (services, service area, hours, rough pricing), takes messages
- [ ] Appointment booking against Google Calendar / Cal.com availability
- [ ] Instant owner notifications (SMS/push/email) with lead summary + transcript
- [ ] Dashboard: calls handled, leads captured, revenue-recovered estimator (the retention widget)
- [ ] Business profile wizard: 15 minutes from signup to live

## Differentiation

1. **Text-back first.** Voice AI is the headline, but the SMS rescue flow converts astonishingly well (people who won't talk to a robot will happily text one), works from day one with zero call-quality risk, and justifies the $99 tier alone.
2. **The revenue-recovered dashboard** reframes the product from cost to profit center — "CallCatch captured 14 leads worth ~$6,200 this month" is the anti-churn screen.
3. **Vertical knowledge packs** (plumbing FAQs ≠ salon FAQs) instead of a blank-slate bot.

## Go-to-Market

- **Agency channel first:** marketing agencies serving home services actively hunt for recurring add-ons to sell; white-label + 30% recurring gets a salesforce for free.
- Direct: Google/Facebook ads with the visceral hook ("How many calls did you miss this week?"), local-business Facebook groups, trade association newsletters.
- Proof-driven landing pages per vertical ("AI receptionist for plumbers") with recorded demo calls.
- Partnerships: field-service software (Jobber, Housecall Pro ecosystems) app marketplaces.

## Competition

| Competitor | Price | Weakness we exploit |
|------------|-------|---------------------|
| Human answering services | $200–500/mo | Can't book, script-bound, per-minute pricing |
| Smith.ai | $285+/mo | Human-hybrid pricing, upmarket focus |
| Goodcall / Rosie / other AI answering | $59–$199/mo | Generic bots, weak SMS rescue flow, no vertical packs |
| Podium | $399+/mo | Messaging suite, expensive, no voice answering |

## Key Risks

- **Call-quality failures are public:** a bot that mangles a customer call embarrasses the owner. Mitigations: conservative fallback ("let me take a message") whenever confidence drops, human-transfer option, listen-to-every-call review UI during onboarding.
- **Telephony compliance:** A2P 10DLC registration for SMS, call-recording consent laws vary by state — build the consent/disclosure flows in from day one.
- **SMB churn:** counter with annual prepay discounts, agency-managed accounts (agencies churn less), and the revenue dashboard.
- **Platform dependence on Twilio:** abstract the telephony layer; Telnyx as tested fallback.
