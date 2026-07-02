# LumaShot

**AI professional headshot studio: upload 8-15 selfies, get 40-200 studio-quality headshots in under 30 minutes.**

LumaShot fine-tunes a Flux LoRA on the user's face (via Replicate), then generates headshots across curated styles, backgrounds, and outfits. Customers pay once per pack -- no subscription, no recurring billing, no dark patterns.

---

## The Problem

- A professional photoshoot costs **$200-$500**, requires booking days or weeks out, an hour in a studio, and another wait for retouched files. Most people do it once every 5+ years, so their profile photo is stale.
- Profile photos are disproportionately load-bearing: recruiters and hiring managers form impressions in seconds, sales reps with professional photos get more replies, LinkedIn profiles with quality photos get dramatically more views and connection accepts, and dating profiles live or die on the first image.
- Phone selfies fail specifically at the things headshots need: lighting, background, framing, and wardrobe. People know their photo is bad; they just cannot justify $300 and a week of lead time to fix it.
- AI headshots collapse the cost to $19-$49 and the turnaround to minutes -- if (and only if) the likeness is good. Likeness quality is the entire product.

## Target User

1. **Job seekers** -- actively applying, need a credible LinkedIn/resume photo today, not next week. Highest urgency, highest conversion.
2. **LinkedIn optimizers** -- consultants, sales reps, founders, creators who treat their profile as a landing page and refresh it regularly.
3. **Remote teams** -- companies that want visually consistent headshots across a distributed team without flying in a photographer. Buys in bulk, lower CAC per seat.
4. **Dating-profile upgraders** -- want a better first photo without hiring a photographer. Price-sensitive but viral-prone (before/after screenshots get shared).

## Market and Profitability

Honest read of the category:

- **Category leaders have proven the ceiling.** HeadshotPro and Aragon.ai have publicly reached **$100k+/month**; HeadshotPro has claimed multi-million-dollar annual revenue. The demand is real and keyword-driven.
- **Revenue is spiky, not recurring.** This is a one-time-purchase product. A customer buys a pack, gets headshots, and does not come back for 1-3 years. There is no MRR flywheel; every month starts near zero and is refilled by SEO, ads, and virality. Expect $10k-$200k/month as the realistic range for a well-executed entrant, with large month-to-month swings.
- **Demand is keyword- and viral-driven.** The category lives on the "ai headshot generator" search cluster and on before/after posts going viral. Leaders spend heavily on Google Ads; the business is structurally ad-dependent, and CAC inflation is a first-order risk (see Key Risks).
- **Gross margins are excellent: ~70-85%.** GPU inference cost per delivered pack is roughly **$1-3** (one LoRA training run plus 40-200 image generations). Stripe fees, S3, and email are rounding errors. The margin math survives even aggressive ad spend -- which is exactly why leaders can afford aggressive ad spend.
- **B2B (team packs) is the most durable segment**: repeat purchases as teams grow, higher order values, and referenceable customers.

## Monetization and Pricing

One-time credit packs. No subscription -- ever. That is a feature, not a limitation (see Differentiation).

| Pack | Price | Headshots | Styles | Extras |
|---|---|---|---|---|
| **Basic** | $19 | 40 | 2 styles | Standard queue |
| **Pro** | $29 | 100 | 5 styles | Standard queue |
| **Executive** | $49 | 200 | All styles | Priority queue (front of GPU line) |

Every pack includes: LoRA training on the user's photos, full-resolution downloads, a zip export, and automatic deletion of training photos after the retention window.

**Upsells (post-MVP):**

- **Extra styles** -- add a style to a completed order ($5-9); reuses the already-trained LoRA, so COGS is inference only (~$0.50-2).
- **Rush processing** -- jump the queue ($9).
- **Team packs** -- per-seat pricing with volume discounts, one admin dashboard, consistent style presets across the whole team.
- **Regeneration credits** -- "not quite right" customers can re-run a batch with adjusted prompts instead of refunding.

## MVP Feature List

- [ ] Google OAuth sign-in (Auth.js), email capture at checkout
- [ ] Stripe Checkout for the 3 packs (one-time payments), webhook-driven order fulfillment
- [ ] Selfie upload flow: 8-15 photos via S3 presigned URLs, drag-and-drop, mobile-friendly
- [ ] Upload validation: face detection, one-face check, min resolution, blur/quality scoring, duplicate detection, with actionable per-photo error messages ("face too small -- move closer")
- [ ] Style picker gated by pack tier (2 / 5 / all styles) with real preview images per style
- [ ] LoRA training pipeline: worker submits Flux fine-tune to Replicate, tracks training state
- [ ] Generation pipeline: batched inference across selected styles until pack quota is met
- [ ] Replicate webhook ingestion for training and prediction completion (signature-verified)
- [ ] Results gallery: grid view, full-size lightbox, per-style grouping
- [ ] Favorites: star the keepers, filter gallery to favorites
- [ ] Download: single image and "download all as zip" (streamed from S3)
- [ ] Email notification via Resend when the pack is ready ("your headshots are ready")
- [ ] Order status page with live progress (uploading -> validating -> training -> generating -> ready)
- [ ] Auto-deletion of training photos after TRAINING_DATA_RETENTION_DAYS (default 7), with user-visible countdown and "delete now" button
- [ ] Refund/regeneration request flow: structured "bad likeness" report -> offer one free regeneration batch before refund; refund path documented and honored
- [ ] Basic abuse guardrails: reject uploads that fail face-match consistency (photos of different people / celebrities), NSFW filter on outputs
- [ ] Admin view: orders, pipeline states, failed jobs, manual re-queue

## Differentiation

vs. HeadshotPro / Aragon.ai and the rest of the field:

1. **Turnaround under 30 minutes (p50), guaranteed target.** Incumbents quote 1-3 hours and have historically taken longer. Fast Flux LoRA training plus a priority queue makes "order at lunch, update LinkedIn by 1pm" the core promise.
2. **Transparent per-style previews.** Every style shows real generated examples (multiple ages/skin tones/genders) before purchase. No mystery-box styles.
3. **No-subscription honesty.** Several competitors funnel users toward subscriptions or hide recurring charges. LumaShot is loudly one-time-payment; this is a trust wedge worth marketing on.
4. **Team / bulk mode.** One admin buys N seats, invites the team by email, everyone gets the same style presets, admin gets one consolidated gallery. Underserved by consumer-first incumbents.
5. **GDPR-friendly auto-deletion.** Training selfies are deleted automatically after N days (default 7) with a visible countdown and one-click immediate deletion. Deletion is a scheduled, audited job -- not a support-ticket promise. Privacy fear is a top purchase objection in this category; make deletion a headline feature.

## Go-to-Market

1. **SEO on the "ai headshot generator" cluster.** Programmatic and editorial pages: "ai headshot generator", "professional headshots online", "linkedin photo generator", plus persona pages (headshots for realtors / lawyers / doctors / actors) and honest comparison pages ("LumaShot vs HeadshotPro"). This is where the category's demand lives; rankings compound while ads do not.
2. **LinkedIn organic before/after posts.** Founder-led posting of real customer before/afters (with permission). The product's output is inherently shareable; every delivered pack is potential creative. Encourage customers to post with a referral link.
3. **Affiliate program for career coaches and resume writers.** 20-30% of first purchase. These people are already telling clients "fix your photo" -- give them a link and a margin. Low volume per affiliate, high intent, near-zero CAC.
4. **Google Ads on high-intent keywords.** "ai headshots", "professional headshot online", competitor brand terms where policy allows. Unit-economics note: at a $29 average order and ~$4 COGS+fees, breakeven CPA is roughly $25; the category's CPCs ($1.50-4) make this workable only with strong landing-page conversion (target 3-5%+). Cap spend at target CPA from day one -- this channel inflates and must never be the only leg.
5. **Product Hunt launch** timed with the team-mode release (a genuinely new angle, not "another headshot app").
6. **B2B outreach to recruiting agencies and staffing firms.** They touch thousands of job seekers; offer white-label or bulk codes. Also HR/people-ops at remote companies for the team product.

## Competition

| Competitor | Pricing | Strengths | Weaknesses |
|---|---|---|---|
| **HeadshotPro** | ~$29-59 per package (tiered by count/styles) | Category leader, huge SEO + ads footprint, team offering, strong social proof | Slower turnaround (hours), quality variance complaints, heavy ad dependence baked into pricing |
| **Aragon.ai** | ~$29-69 per package | Strong likeness quality reputation, polished brand, editing/retouch tools | Premium pricing, upsell-heavy funnel, turnaround measured in hours |
| **BetterPic** | ~$25-49 per package | Fast turnaround claims, generous shot counts, business tier | Weaker brand/SEO position, quality consistency varies by style |
| **Remini** | ~$5-10/week subscription (app) | Massive mobile install base, dirt-cheap entry, instant results | Subscription dark-pattern reputation, generic outputs, weak professional positioning, likeness drift |

Positioning summary: beat leaders on **speed + transparency + privacy**, match them on quality, and refuse the subscription game Remini plays.

## Key Risks

1. **Model commoditization.** Native ChatGPT/Gemini image tools and on-device phone features are improving fast; "good enough" free headshots would gut the low end. Mitigation: own the professional/team use case, speed, and workflow (bulk, consistency, admin tools) -- things a chat prompt does not deliver.
2. **Ad CAC inflation.** The category's paid keywords get more expensive every quarter as entrants pile in. Mitigation: SEO + affiliates + B2B as primary channels; ads capped at target CPA, treated as marginal volume only.
3. **Chargebacks and refunds on bad likeness.** Likeness failure is the product's core failure mode and the top refund driver. Mitigation: strict upload validation (most bad outputs trace to bad inputs), one free regeneration before refund, a clear published refund policy, and likeness-acceptance tracking as a first-class metric.
4. **Deepfake and abuse moderation.** Users will try to train on celebrities, exes, and strangers. Mitigation: face-consistency checks across the upload set, terms requiring subject consent, NSFW output filtering, and a manual-review queue for flagged sets. This is both an ethical requirement and a payment-processor requirement.
5. **Spiky, non-recurring revenue.** No MRR cushion; a Google algorithm update or ad-account issue can halve a month. Mitigation: diversify channels early, build the B2B/team motion (closest thing to repeat revenue), and keep fixed costs near zero -- the stack below runs on usage-priced services.
