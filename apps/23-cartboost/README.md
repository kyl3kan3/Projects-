# CartBoost

**One-click post-purchase upsells for Shopify — found money for merchants, measured in their own dashboard.**

---

## The Problem

The most profitable moment in e-commerce is the second after checkout: the customer has already entered payment details, trust is at maximum, and Shopify allows a **post-purchase offer page** where one tap adds an item to the same order — no re-entering cards, no second checkout. Done right, this adds 5–15% to revenue with zero traffic cost.

Most merchants don't use it, and the incumbent apps that own this space (Zipify OCU at $99+/mo, AfterSell, ReConvert) are either priced for big stores, cluttered with funnel-builder complexity, or take a percentage of upsell revenue. A small merchant wants one thing: "show the right offer after checkout, tell me what it earned me."

## Target User

- **Primary:** Shopify merchants doing $10k–$500k/mo — established enough that 5% incremental revenue matters, small enough to have no dev team.
- **Secondary:** Shopify agencies configuring stores for clients.
- **Not targeting:** Shopify Plus enterprise checkout customization projects (services business, not product) or non-Shopify carts at MVP.

## Market & Profitability

- **App-store distribution is the whole game and it's excellent here:** Shopify merchants search the app store with wallet open; "upsell" is one of its highest-intent categories. Successful upsell apps sit at thousands of paying installs.
- Realistic outcome: **$8k–$60k MRR.** Comparable apps (AfterSell pre-acquisition, ReConvert) grew to $50k+ MRR largely on app-store organic.
- The product **proves its own ROI in dollars** ("CartBoost added $1,840 this month — you pay $29"), which is the strongest churn defense that exists in SaaS.
- Margins ~95%: it's CRUD + a checkout-extension widget; no LLM/media costs.

## Monetization

| Tier | Price | Limits |
|------|-------|--------|
| Free | $0 | Up to $200/mo in generated upsell revenue (then nudge) |
| Growth | $29/mo | Unlimited upsell revenue, A/B tests, 3 funnels |
| Pro | $79/mo | Unlimited funnels, AI offer suggestions, thank-you-page offers, analytics export |

Flat pricing (no revenue share) IS the positioning against percentage-taking competitors.

## MVP Features

- [ ] Post-purchase offer page via Shopify checkout extensions: one-click add-to-order (no re-payment)
- [ ] Offer builder: trigger rules (product purchased, cart value, customer tag) → offer (product, discount %, downsell on decline)
- [ ] Two-step funnels: offer → decline → downsell
- [ ] A/B testing on offers (product, price, copy)
- [ ] Revenue dashboard: incremental revenue, acceptance rate, per-offer performance — the "found money" screen
- [ ] Thank-you-page secondary offers (lighter placement)
- [ ] Templates by vertical (supplements, apparel, beauty) with typical attach offers

## Differentiation

1. **Flat price, no revenue share** — competitors taking 1–2% of upsell revenue hand us the comparison table win.
2. **Five-minute setup:** pick product → pick offer → live. The funnel-builder bloat of incumbents is our simplicity wedge.
3. **AI offer suggestions (Pro):** mined from the store's own order pairs ("buyers of X also bought Y within 30 days") — a real data feature, not a gimmick.

## Go-to-Market

- **Shopify App Store SEO** is 70% of the channel: reviews velocity, keyword-optimized listing ("post purchase upsell", "one click upsell"), fast support (review-driven ranking).
- Launch pricing: generous free tier to farm installs + reviews early.
- Shopify agency partnerships (agencies install the same stack on every client store).
- Content: "we analyzed N stores' upsell acceptance rates" data pieces for merchant communities (r/shopify, Twitter DTC circles).

## Competition

| Competitor | Price | Weakness we exploit |
|------------|-------|---------------------|
| Zipify OCU | $99+/mo | Priced for big stores, funnel-builder complexity |
| ReConvert | $4.99+ + 0.75% rev share | Revenue share, cluttered UX |
| AfterSell | $34.99+/mo tiered by orders | Order-count pricing punishes growth |
| Honeycomb | $49.99+/mo | Dated UI, weak analytics |

## Key Risks

- **Platform dependence is total:** Shopify API/extension changes or policy shifts can break the product; checkout extensibility APIs are the sanctioned path (post-purchase checkout extensions) — stay strictly on it, never script-injection hacks.
- **App review + revenue-share policy:** Shopify takes 15% of app revenue (0% under the small-developer program initially); model pricing accordingly.
- **Category saturation:** differentiation is real but narrow; win on listing conversion, support speed, and the flat-price wedge — this is an execution knife-fight, not a novelty play.
- **Free-tier abuse:** revenue-cap enforcement must be exact or the free tier eats paid conversion.
