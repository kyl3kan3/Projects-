# QuoteFox

**AI quote builder for home-service trades. Walk the job narrating on your phone, snap photos, and send a priced, branded, e-acceptable proposal from the driveway -- deposit collected before you pull away.**

## The Problem

For HVAC, roofing, electrical, and plumbing contractors, the estimate is written twice: once in their head on the walkthrough, and again at the kitchen table at 10pm, from memory and blurry photos, in a Word template last touched in 2019. The lag between "saw the job" and "sent the number" is routinely 2-5 days -- and speed is the whole game. Lead-response research consistently finds the first vendor to respond wins the majority of jobs -- the oft-cited Lead Connect figure is 78% of buyers choosing the first responder, and home-service platforms' own data points the same direction. Every night a quote sits unwritten, the homeowner is getting other bids.

The knowledge to price the job exists at walkthrough time -- the contractor literally says it out loud to themselves ("that condenser pad's shot, panel's a Federal Pacific, gonna need a permit"). What's missing is the machinery to turn that narration into a line-item estimate:

1. **Capture**: audio + photos on the phone, while walking, gloves on.
2. **Pricing**: mapped to the contractor's *own* price book, not generic averages.
3. **Delivery**: a branded proposal link the homeowner can accept and pay a deposit on, tonight, before the competing bids land.
4. **Follow-up**: the automatic nudge on day 2 and day 5 that contractors never send.

Field service platforms (Jobber, Housecall Pro) manage the whole business but still make you *type the estimate*. QuoteFox attacks only the quote, and attacks the typing itself.

## Target User

- **Primary:** owner-operators and 2-15 person shops in HVAC, roofing, electrical, and plumbing doing $300k-$5M/year, where the owner or a senior tech still writes every estimate. They quote 10-80 jobs a month and lose evenings to it.
- **Secondary:** adjacent trades with walkthrough-priced work -- fencing, painting, garage doors, water treatment, landscaping hardscape.
- **Buyer profile:** the owner. Phone-first, allergic to software demos, already pays for something (Jobber, QuickBooks, Angi leads). Buys when the first walkthrough produces a sendable quote in minutes; churns if setup takes more than an evening.
- **Not a target (yet):** commercial GCs with formal RFP/takeoff workflows, new-construction bidding, franchise networks with corporate-mandated flat-rate systems (ServiceTitan territory), or one-person handymen who quote verbally.

## Market & Profitability

The niche is large, fragmented, and structurally underserved at the low end:

- **The pool is enormous.** IBISWorld counts roughly 118,000 HVAC contractor businesses, ~129,000 plumbing businesses, and ~262,000 electrician businesses in the US alone (IBISWorld, 2025-2026) -- before adding roofing. The overwhelming majority are under 20 employees, exactly the segment where the owner still writes quotes at night.
- **The category is growing.** The field service management market is projected to grow from about $5.1B in 2025 to $9.2B by 2030, a ~12.5% CAGR (MarketsandMarkets, 2025). QuoteFox is not an FSM -- it's a wedge into the highest-pain moment of that market -- but the spend and the willingness to pay are proven.
- **Incumbent pricing leaves a gap.** Housecall Pro starts at $79/mo and charges $40/mo extra for its sales-proposal tool and $149/mo for a flat-rate price book (Housecall Pro, 2026); Jobber runs $39-$599/mo across tiers with quoting mid-tier and up (Jobber, 2026); ServiceTitan is enterprise-priced and sales-led. Nobody sells "the quote itself, done by AI against your prices" at $49-$199 as a standalone.
- **Realistic ceiling:** this is not winner-take-all. A focused tool that coexists with Jobber/QuickBooks can plausibly reach **$30k-$150k MRR over 2-4 years** (roughly 300-1,500 customers at ~$100 blended ARPU) on trade-by-trade, city-by-city distribution. Gross margin is software-like but not pure: each quote costs ~$0.10 in AI spend (see ARCHITECTURE.md), so COGS stays under ~7% of revenue even for heavy quoters.
- **Retention logic:** the price book is the moat. Once a contractor's 800-item price book, assemblies, and margins live in QuoteFox, switching means retraining the tool that already talks like them. Deposit collection adds a money pipe that's painful to unplug.

Expect: a grind of trade-specific distribution (each trade is its own market with its own forums, suppliers, and vocabulary). Don't expect: horizontal virality.

## Monetization & Pricing

Per-company subscription, tiered by volume and team size. The metered unit that matters is AI-drafted quotes per month.

| Plan | Price | Limits | Includes |
|---|---|---|---|
| **Solo** | $49/mo | 1 user, 25 AI quotes/mo, 300-item price book | Walkthrough capture, AI drafting, branded proposal links, e-acceptance |
| **Crew** | $99/mo | 5 users, 100 AI quotes/mo, 2,000-item price book | Everything in Solo + deposit collection via Stripe, automatic follow-up nudges, option add-ons on proposals |
| **Fleet** | $199/mo | 15 users, unlimited quotes (fair use), unlimited price book | Everything in Crew + review-request follow-ups after job completion, win-rate analytics by trade/tech, priority support |

Notes on the model:

- **The trial is the demo.** 14 days, no card, capped at 5 AI quotes -- enough to win one real job. The first accepted proposal with a deposit hitting their bank account is the close; no other sales motion exists.
- **The wedge is Solo; the business is Crew.** Deposit collection is deliberately gated to Crew+ because it's the feature that makes cancelling feel like unplugging revenue.
- We take **no percentage of deposits** (contractors pay only Stripe's processing fees on their own connected account). Rent extraction on their money is how incumbents earn resentment; flat SaaS pricing is a stated differentiator.
- Price-book import (CSV, or "photograph your old rate sheet") is free and assisted -- it front-loads the moat.

## MVP Feature List

- [ ] Org onboarding: trade selection, branding (logo, license number, colors), starter price-book templates per trade
- [ ] Price book: CRUD, CSV import, categories, labor/material/flat-rate item types, default markup rules
- [ ] Mobile walkthrough capture: record narration (pauseable), snap photos, works offline-tolerant with upload retry; presigned direct-to-R2 uploads
- [ ] Transcription + AI drafting pipeline: Whisper transcript, GPT-4o drafts line items matched against the org's price book with quantities and notes, flags unmatched items for review
- [ ] Estimate editor: review/edit drafted line items, add/remove/reprice, markup and tax, the signature "estimate drafting itself" reveal
- [ ] Branded proposal link: hosted page with scope, line items, photos, terms, license/insurance block; signed tokens, no homeowner login
- [ ] E-acceptance: typed-name signature, timestamped acceptance record, PDF snapshot archived
- [ ] Deposit collection: percentage or fixed deposit via Stripe Checkout on the contractor's connected account (Stripe Connect)
- [ ] Proposal events: sent/viewed/accepted/deposit-paid timeline per proposal; email notifications to the contractor
- [ ] Automatic follow-ups: polite nudge emails at +2d and +5d if unviewed/unaccepted (Crew+)
- [ ] Billing for QuoteFox itself (Stripe Billing, the three plans above) with quote-count metering and plan gating
- [ ] Audit log of every AI draft, edit, send, and payment action

Post-MVP (explicitly cut from v1): review-request follow-ups, win-rate analytics, good/better/best proposal options, QuickBooks/Jobber export, financing offers, Spanish-language capture, iOS/Android native apps (v1 is a mobile-first PWA).

## Differentiation

1. **The quote writes itself from the walkthrough.** Everyone else -- Jobber, Housecall Pro, Joist -- gives you a nicer form to type into. QuoteFox eliminates the typing: narration and photos in, priced line items out. That is the product, not a feature of it.
2. **Your price book, not generic pricing.** AI estimating tools that guess from national averages produce numbers contractors don't trust and won't sign their name to. QuoteFox only drafts from the contractor's own items and markup rules, and visibly flags anything it couldn't match instead of inventing a price.
3. **Speed as the marketed outcome.** The pitch is not "AI" -- it's "the bid arrives before your competitor has left their truck." Every marketing surface sells same-hour quoting against the 2-5 day industry norm.
4. **Flat price, no take-rate.** Deposits flow through the contractor's own Stripe account with zero QuoteFox percentage. Joist and the FSMs monetize payments; we monetize the subscription and say so loudly.
5. **Coexists instead of replacing.** QuoteFox does not do scheduling, dispatch, or invoicing, on purpose. It slots in front of whatever the shop already runs, which turns the FSMs from rip-and-replace competitors into things we hand off to.

## Go-to-Market Channels

In priority order:

1. **Trade-specific communities and forums.** HVAC-Talk, r/HVAC, r/electricians, r/Roofing, Plumbing Zone, and the big Facebook groups (HVAC Business Owners, Roofing Sales). Walkthrough-to-quote screen recordings are natively impressive content; post real ones, not ads.
2. **YouTube/TikTok trade influencers.** The trades have a dense creator layer (business-of-the-trade channels reviewing tools). Sponsored honest reviews plus an affiliate code; one strong HVAC-channel review can outperform months of ads.
3. **Content SEO on quoting keywords.** "HVAC estimate template," "roofing quote example," "how to price a panel upgrade," "Joist alternative." High intent, weak incumbent content below the FSM giants. Free tool as lead magnet: a per-trade quote-speed calculator ("what slow bids cost you per year").
4. **Supplier counter and distributor partnerships.** Trade supply houses (electrical/plumbing distributors, roofing suppliers) run counter days and contractor breakfasts; a demo table where a rep walks the parking lot and sends a quote in 4 minutes is theater that converts.
5. **Google Ads on competitor + template keywords.** Small, surgical budget on "Joist app alternative," "quote app for contractors," and per-trade estimate-template searches where CPCs are still sane.
6. **Trade association newsletters and local chapters.** PHCC, NECA-adjacent small-shop groups, state roofing associations: sponsorships are cheap, audiences are exactly owner-operators, and association credibility de-risks "AI" for a skeptical buyer.

## Competition

| Competitor | Pricing | Weaknesses |
|---|---|---|
| **Jobber** | $39-$599/mo by tier (Jobber, 2026) | Full FSM; quoting is typing into a form. No walkthrough capture, no AI drafting against your price book. Quote features gated to mid tiers. |
| **Housecall Pro** | From $79/mo + add-ons: proposals $40/mo, flat-rate price book $149/mo (Housecall Pro, 2026) | Add-on pricing stacks fast; proposal tool is a form-filler. AI features are assistive text, not estimate generation from a walkthrough. |
| **ServiceTitan** | Enterprise, sales-led, commonly cited $300+/tech/mo | Built for 20+ tech shops with managed flat-rate systems. Overkill and unaffordable for our segment; long contracts, long onboarding. |
| **Joist** | Free tier; Pro ~$14-32/mo; monetizes payments | Estimates and invoices for contractors, phone-first -- closest in spirit. But it's still manual entry, generic templates, no price book intelligence, no walkthrough capture, and it takes a cut on payments. |
| **PandaDoc / Proposify** | ~$19-65/user/mo | Generic proposal software: beautiful documents, zero trade awareness, no price book, no capture. Contractors bounce off horizontal tools. |
| **Word/Excel template + kitchen table** | Free | The real incumbent. Infinitely flexible, fully trusted, already installed. Costs 3-6 evening hours a week and 2-5 days of quote lag -- we win only if capture-to-send is genuinely faster than their muscle memory, including review time. |

## Key Risks

1. **Draft quality below the trust threshold.** If the AI mis-prices or hallucinates line items, contractors stop trusting every draft and the product collapses into a fancy form. Mitigation: draft *only* from the org's price book, never invent prices, flag unmatched narration as explicit "needs pricing" rows, and show the transcript excerpt behind every line item so the contractor can audit in one tap.
2. **Incumbents add walkthrough AI.** Jobber and Housecall Pro are shipping AI features and have distribution we can't match. Mitigation: speed and focus -- own the walkthrough-capture interaction and per-trade price-book depth; stay the best-of-breed tool that coexists (export/handoff) rather than fighting FSMs feature-for-feature. Accept honestly: this caps the ceiling, same as every wedge product.
3. **Noisy jobsite audio.** Attics, mechanical rooms, and wind wreck transcripts. Mitigation: chunked capture with pause/resume, on-device level metering that warns when audio is unusable, photo-first fallback ("caption each photo"), and prompt design that tolerates fragments. Test on real jobsites in Phase 1, not in an office.
4. **AI cost creep on heavy users.** Unlimited-tier users quoting 400+ jobs/mo could erode margin. Mitigation: per-quote costs are metered and modeled (~$0.10/quote); fair-use policy on Fleet; caching of price-book embeddings; renegotiate to batch/smaller models as quality allows.
5. **Payments/compliance surface.** Deposits on connected accounts bring refund disputes, contractor fraud risk, and state-by-state rules on deposit caps for home-improvement contracts (e.g., California's 10%/$1,000 rule). Mitigation: Stripe Connect standard accounts keep KYC and liability with Stripe; deposit templates warn on known state caps; we never touch funds.
6. **Single-founder distribution grind.** Six trades times fifty states is a lot of doors. Mitigation: sequence ruthlessly -- one trade (HVAC), one channel (communities + creators) until $10k MRR; resist horizontal marketing until the beachhead converts predictably.
