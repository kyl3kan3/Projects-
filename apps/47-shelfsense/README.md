# ShelfSense

**Inventory forecasting for Shopify merchants: sales velocity + supplier lead times become reorder points, PO drafts, and dead-stock alerts — before the best-seller sells out.**

## The Problem

A Shopify merchant doing $40k-$500k/mo lives inside a spreadsheet that is always three weeks out of date. They reorder by gut: too late on the SKU that's accelerating (stockout right as the ad spend peaks), too heavy on the SKU that quietly died (cash buried in a shelf of dead stock). Both failure modes are invisible until they've already cost real money — a stockout doesn't appear in any Shopify report as *revenue you didn't make*, and dead stock never sends a notification.

The math to fix it is not exotic: per-SKU sales velocity, supplier lead time, safety stock, reorder point. But doing it continuously across 300 SKUs, three suppliers, and seasonal demand curves is exactly the kind of tedious, always-on arithmetic software should own. Shopify's native reports show what *sold*; they don't say **"order 240 units of SKU-1042 by Thursday or you go dark on your #2 seller for 19 days."**

The enemy: cash tied up in the wrong SKUs while the best-seller goes out of stock.

## Target User

- **Primary:** owner-operators and ops leads of Shopify/Shopify Plus stores doing $30k-$800k/mo GMV with 50-2,000 SKUs and physical inventory they purchase from suppliers (D2C brands, boutiques, consumables, hobby retail).
- **Secondary:** small 3PL-backed brands managing multiple locations; merchants graduating off a reorder spreadsheet after their first painful stockout or dead-stock write-off.
- **Buyer profile:** the person who places supplier POs. They know their lead times by heart and hate that the reorder decision lives in their head. They will install a Shopify app in minutes if the first screen shows *their* SKUs ranked by urgency.
- **Not a target (yet):** dropshippers (no inventory), made-to-order, enterprise brands on NetSuite/Cin7-class ERPs, marketplaces-first sellers.

## Market & Profitability

- **The pain is enormous and measured.** IHL Group's long-running study puts the global cost of inventory distortion at [~$1.7 trillion a year — roughly $1.2T from out-of-stocks and $554B from overstocks](https://www.ihlservices.com/news/analyst-corner/2025/09/retail-inventory-crisis-persists-despite-172-billion-in-improvements/) ([2023 coverage: $1.77T](https://www.retailtouchpoints.com/features/industry-insights/ihl-study-inventory-distortion-will-cost-retailers-1-77-trillion-in-2023)). Small merchants feel the same two leaks with none of the tooling.
- **The platform is huge and still growing.** Shopify merchants transacted [$292.3B of GMV in 2024 (+24% YoY), selling to 875M+ consumers](https://www.sec.gov/Archives/edgar/data/0001594805/000159480525000011/exhibit991pressreleaseq420.htm) — millions of stores, of which even a sliver of inventory-carrying merchants is a large TAM for a $59-199/mo tool.
- **Stockouts are the norm, not the exception:** one analysis of Shopify storefronts found [roughly half of products experience stockout windows, averaging weeks in length](https://kedra.io/blog/stockouts-cost-shopify-stores-millions/).
- **Category economics:** app-store distribution, webhook ingestion + nightly math = 85-90% gross margins. Churn is structurally low: once POs are drafted from ShelfSense, leaving means going back to the spreadsheet. Realistic outcome: **$15k-$80k MRR** (150-600 stores at ~$100 blended ARPU) over 2-3 years; the ceiling is set by distribution work, not demand.

## Monetization & Pricing

Tiered by active SKU count (what we meter from their catalog). 14-day free trial; the trial opens on a **revenue-at-risk report** computed from their own last 90 days — the product sells itself with their numbers or it doesn't.

| Plan | Price | SKUs | Includes |
|---|---|---|---|
| **Counter** | $59/mo | up to 250 | Velocity + reorder points, stockout alerts, dead-stock report, 1 location |
| **Backroom** | $99/mo | up to 1,000 | Everything in Counter + supplier profiles & lead times, PO drafts (CSV/email), seasonality-aware forecasts, 3 locations |
| **Warehouse** | $199/mo | up to 5,000 | Everything in Backroom + multi-location transfer suggestions, bundle/component awareness, PO push to email with supplier portal links, priority support |

Billing runs through the Shopify Billing API (required for App Store distribution) — the charge lands on the merchant's existing Shopify invoice, which removes a whole class of payment friction.

## MVP Feature List

- [ ] Shopify OAuth install (embedded app, App Bridge) with least-privilege scopes: products, inventory, orders read
- [ ] Webhook ingestion (orders/create, inventory_levels/update, products/update) with HMAC verification, idempotent processing, and replay
- [ ] 90-day order backfill on install -> per-SKU daily sales velocity (7/30/90-day windows, trend-weighted)
- [ ] Supplier profiles: name, lead time days, MOQ, per-SKU cost & supplier assignment (CSV import)
- [ ] Reorder engine: reorder point = velocity x (lead time + safety days); nightly recompute; "order by" date per SKU
- [ ] Reorder dashboard: SKUs ranked by days-of-cover, urgency states (order now / order this week / healthy)
- [ ] PO drafts: grouped by supplier, quantity suggestions honoring MOQ and pack size, exported as CSV or emailed to the supplier
- [ ] Stockout revenue-at-risk: for every at-risk SKU, projected units missed x price during the uncovered window; aggregate figure on the dashboard
- [ ] Dead-stock alerts: SKUs with > N days cover and falling velocity, ranked by cash tied up; monthly digest email
- [ ] Billing via Shopify Billing API (three plans above, SKU-count gating)
- [ ] Email digests (weekly reorder summary, monthly dead-stock report)

Post-MVP (explicitly cut from v1): multi-location transfer suggestions, bundle/BOM awareness, purchase-order receiving/reconciliation, Amazon/other channel ingestion, supplier portal.

## Differentiation

1. **Revenue-at-risk, in dollars, on the first screen.** Competitors show stock levels; ShelfSense leads with "you will miss ≈ $6,400 of sales in the next 30 days unless these 4 SKUs are reordered by Friday." Urgency in dollars is what makes an ops tool a daily habit.
2. **Dead stock is a first-class citizen.** Most forecasting apps optimize against stockouts only. ShelfSense treats over-ordering as the equal enemy — the monthly "cash buried on the shelf" report is the retention feature nobody else sends.
3. **PO drafts, not just alerts.** The output is the artifact the merchant actually needs: a supplier-grouped PO honoring MOQs and pack sizes, one tap from send. Alert fatigue kills alert-only tools.
4. **Honest math, shown.** Every reorder point expands to its inputs (velocity window, lead time, safety days). Merchants trust numbers they can audit; black-box "AI forecasting" claims are the category's credibility problem.
5. **Built only for Shopify.** Deep native integration (webhooks, App Bridge embedded UX, Shopify Billing) instead of least-common-denominator multichannel.

## Go-to-Market Channels

1. **Shopify App Store SEO.** The single highest-intent channel: merchants search "inventory forecasting," "reorder," "purchase orders" inside the admin. Listing quality, reviews, and category ranking are the growth loop; seed the first 20 reviews from design partners.
2. **The free stockout-cost calculator.** A public page: connect read-only or paste a CSV, get your last-quarter revenue lost to stockouts + cash in dead stock. Lead magnet for content and ads; the number converts.
3. **Content SEO** on "shopify reorder point," "shopify inventory forecasting," "dead stock," "how much inventory to order" — weak incumbent content, high commercial intent, evergreen.
4. **Communities:** r/shopify, r/ecommerce, Shopify Community forums, D2C Twitter/X and newsletter sponsorships (2PM, DTC Newsletter class) once unit economics are proven.
5. **Agency/app partnerships:** Shopify agencies doing store builds and inventory-heavy migrations; 20% recurring referral. Cross-promotion with complementary apps (shipping, loyalty) that share the ICP.

## Competition

| Competitor | Pricing | Weaknesses |
|---|---|---|
| **Stocky (Shopify)** | Free with POS Pro | Tied to POS subscription; minimal forecasting; stagnant product; no revenue-at-risk framing. The "good enough and free" baseline to beat. |
| **Inventory Planner (Sage)** | ~$250+/mo | Powerful but priced and shaped for bigger ops teams; heavy setup; overkill below ~$1M/yr GMV. |
| **Cogsy** | ~$299+/mo | Ops-team product, priced past the owner-operator segment. |
| **Prediko / Fabrikator / Genie** | ~$60-150/mo | Direct competitors in the app store; mostly stockout-focused, thin dead-stock story, forecast math is a black box; differentiation is on honesty, dollars-first framing, and PO quality. |
| **Spreadsheets** | Free | The real incumbent. Always stale, breaks silently, lives in one person's head. We must be obviously better within one trial. |

## Key Risks

1. **Shopify platform dependency.** API scope changes, app review policy, or Shopify shipping better native forecasting could reshape the niche overnight. Mitigation: strict API version pinning, webhook replay tolerance, and living where Shopify under-invests (supplier/PO workflow, dead-stock economics). Stocky's decade of neglect suggests native inventory planning is not a Shopify priority.
2. **Forecast trust.** One visibly wrong reorder suggestion (a viral SKU, a promo spike) and the merchant reverts to gut. Mitigation: auditable math, confidence labels on volatile SKUs, promo/seasonality flags the merchant can set, and conservative defaults.
3. **Data quality in, garbage out.** Merchants with untracked inventory, missing costs, or unassigned suppliers see weak output. Mitigation: onboarding checklist that scores data readiness and a CSV import path for costs/lead times before showing forecasts.
4. **Crowded app-store category.** Several funded competitors buy reviews and ads. Mitigation: sharper positioning (dollars at risk + dead stock), the free calculator as an owned channel, and pricing under the ops-suite tier.
5. **Churn on seasonality.** Merchants may pause after peak season. Mitigation: the monthly dead-stock digest keeps the tool valuable in slow months; annual pricing with two months free.
