# PriceProbe

**Competitor price monitoring for small e-commerce brands: track rival product pages with polite, rate-limited scrape workers, get price and stock-change alerts in email or Slack, see your price position per SKU on one dashboard with full history -- and get repricing suggestions you approve, because software should never change your prices behind your back.**

## The Problem

A 40-SKU outdoor-gear brand loses margin two ways, and both happen overnight. A competitor drops their price on a hero product Tuesday evening; by Friday the brand's conversion rate on that SKU has quietly halved and nobody knows why. Or the opposite: every rival is out of stock on a category the brand is discounting -- money left on the table by a promotion nobody needed. The founder's fix is a bookmarks folder and twenty minutes of morning tab-clicking that stopped happening in March.

The tooling above is enterprise-shaped, and the tooling below is a browser extension. Mid-market monitors price by the thousand-URL block with onboarding calls. The "AI dynamic repricing" products want write access to your store and reprice automatically -- terrifying for a brand where one mispriced hero SKU is a week of margin. What the 20-500 SKU brand needs is boring and specific: watch these pages, tell me when something moves, show me where I stand, and *suggest* -- never touch.

PriceProbe is that: paste competitor product URLs against your SKUs, workers check them on a schedule (per-domain rate limits, honest failure states), changes alert you in Slack or email with the old and new price, the dashboard shows your position per SKU with history charts, and repricing suggestions come with reasoning you can accept or ignore. Nothing is ever pushed to your store.

## Target User

- **Primary:** independent e-commerce brands with 20-500 SKUs in competitive categories (outdoor gear, supplements, pet, home goods, parts) on Shopify/WooCommerce -- big enough for price moves to hurt, too small for enterprise pricing suites. The buyer is the founder or e-commerce manager.
- **Secondary:** marketplace-adjacent sellers with their own storefronts, and agencies running pricing for 2-5 brand clients.
- **Buyer profile:** an operator who has been silently undercut before and found out from a sales dip. Motivated by margin defense, promo timing, and never tab-clicking at 7am again.
- **Not a target (yet):** Amazon-only sellers (marketplace repricers own that), enterprise retailers with MAP-enforcement programs, or anyone wanting automated repricing (explicitly not offered).

## Market & Profitability

- **The incumbents validate the price points.** Prisync -- the small-business category leader -- charges **$99/month for up to 100 products, $199/month for 1,000, and $399/month for 5,000** ([prisync.com](https://prisync.com/)). Price2Spy tiers by tracked URL, **starting around $39.95/month for up to 500 URLs and $157.95/month for 2,000** ([price2spy.com](https://www.price2spy.com/price2spy-vs-prisync-comparison.html)). PriceProbe's $49 entry undercuts Prisync's floor while shipping the alert + position experience the segment actually uses.
- **The anchor is silent margin loss.** One hero SKU undercut for two unnoticed weeks costs a mid-size brand more than a year of PriceProbe; one needless 15%-off promo run while every rival was out of stock costs more still. $99/mo is priced against a spreadsheet habit that already died of neglect.
- **Realistic ceiling:** $20k-$70k MRR over 2-3 years (roughly 250-800 brands at ~$85 blended ARPU). Churn pressure is real (tools get audited quarterly), countered by accumulated price history -- the chart of a rival's last 12 months is impossible to rebuild elsewhere.
- **Margins:** scraping compute and proxy bandwidth are the variable costs; they scale with tracked pages, which is exactly the pricing axis. Gross margin ~85-90%.

## Monetization & Pricing

Priced by tracked SKUs -- the honest scale axis (each SKU can watch multiple competitor pages). Users unlimited on every plan.

| Plan | Price | Tracked SKUs | Includes |
|---|---|---|---|
| **Watch** | $49/mo | up to 100 | 2 checks/day, price + stock alerts (email/Slack), position dashboard, 12-month history, CSV export |
| **Desk** | $99/mo | up to 300 | Everything in Watch + 4 checks/day, repricing suggestions with reasoning, morning position digest, price-rule alerts (MAP floor, margin floor) |
| **Floor** | $199/mo | up to 1,000 | Everything in Desk + hourly checks on flagged SKUs, API export, multi-brand workspaces (agencies), priority support |

Notes on the model:

- **14-day free trial, no card** -- the trial is engineered so the first "competitor moved" alert lands during it; that alert closes the sale.
- **Annual = 2 months free.**
- **No free tier.** Free monitoring invites scrape abuse and junk load; $49 filters for brands with real skin in the game.
- **Suggestions never auto-push, on any plan, ever.** This is a product principle and the trust wedge, not a tier gate.

## MVP Feature List

- [ ] Auth + brand workspace (Auth.js); own-SKU catalog (name, your price, cost floor, URL) via CSV import or Shopify product sync (read-only)
- [ ] Competitor page tracking: paste URLs per SKU; automatic price/stock extraction (structured data first: JSON-LD/OpenGraph/microdata, then per-domain selector fallbacks); extraction preview at paste time ("we read $84.99, in stock -- correct?")
- [ ] Scrape scheduler: per-plan check frequency, per-domain rate limits and jitter (never hammer a rival), robots-aware fetching, honest per-page failure states ("blocked since Tue -- needs attention," never silently stale)
- [ ] Change detection: price and stock deltas persisted as events with old/new values and timestamps; noise filters (ignore < 1% moves, currency sanity checks)
- [ ] Alerts: email + Slack (incoming webhook) per event, with per-SKU and per-rule muting; the alert shows old price, new price, your price, and your new position
- [ ] Price-position dashboard: per SKU -- your price vs every tracked rival, position badge (lowest / mid / highest), delta to nearest rival; sortable by exposure ("undercut and losing")
- [ ] History charts: per-SKU price lines (you + rivals) over time; stock-gap shading ("rival out of stock here")
- [ ] Repricing suggestions (never auto-push): rule-driven ("match lowest," "stay within 5% of median," "never below cost floor") with visible reasoning per suggestion; accept marks it handled, nothing touches your store
- [ ] Morning digest: "while you slept" -- overnight changes, new positions, suggested moves, one email/Slack post per day
- [ ] Billing (Stripe: three tiers by tracked SKUs, trial, limit upgrade prompts)

Post-MVP (explicitly cut from v1): automated repricing/store write-back (never, on principle), Amazon/marketplace monitoring, MAP-violation enforcement workflows, competitor discovery ("find who sells this"), browser extension, Google Shopping feed monitoring.

## Differentiation

1. **Suggestions, never auto-push.** The "dynamic repricing" incumbents demand store write access and reprice while you sleep -- one bad selector read away from a $9 hero SKU. PriceProbe is read-only by architecture: the suggestion shows its reasoning and waits. Trust is the product.
2. **Built for 20-500 SKUs, priced under the incumbents' floor.** Prisync starts at $99; Price2Spy's UX is enterprise-shaped. $49 with a 10-minute setup (paste URLs, see the extraction preview confirm itself) is sized for the founder-operator.
3. **The extraction preview kills the trust gap.** Every tracked page shows what was read and when ("$84.99 · in stock · 22 min ago"); failures are loud and specific. Monitoring tools die when users stop believing the numbers; we make the numbers auditable.
4. **Polite scraping as a feature.** Per-domain rate limits, jitter, robots awareness, and no proxy-war escalation in v1 -- stated openly. Sustainable monitoring beats an arms race the small brand never asked to fund.
5. **The morning digest is the habit loop.** One "while you slept" post in the brand's Slack every morning makes PriceProbe the first tab that no longer needs opening.

## Go-to-Market Channels

In priority order:

1. **SEO on the audit moment:** "competitor price tracking tool," "price monitoring for shopify," "prisync alternative," "how to track competitor prices." Comparison pages are the category's highest-intent queries and the incumbents' content is stale at the small end.
2. **Shopify ecosystem:** app-store listing (read-only product sync is the hook), Shopify community forums, e-commerce Twitter/X and newsletters (2PM, Marketing Brew adjacents).
3. **E-commerce operator communities:** r/ecommerce, r/shopify, eCommerceFuel, Facebook brand-operator groups -- where "just found out I've been undercut for a month" threads recur.
4. **A free one-shot tool as lead magnet:** paste one competitor URL, get the extracted price and a 7-day watch by email -- the product demonstrating itself.
5. **Agency channel:** multi-brand workspaces (Floor tier) for the agencies already doing quarterly pricing audits by hand.

## Competition

| Competitor | Pricing | Weaknesses |
|---|---|---|
| **Prisync** | $99/mo (100 products) -> $199/mo (1,000) -> $399/mo (5,000) ([prisync.com](https://prisync.com/)) | The category benchmark -- validates the segment. Entry price double ours for the small catalog; dashboard-first UX with dated alerting; repricing add-ons push toward automation. |
| **Price2Spy** | From ~$39.95/mo (500 URLs) to $157.95/mo (2,000) + custom ([price2spy.com](https://www.price2spy.com/price2spy-vs-prisync-comparison.html)) | Deep but enterprise-shaped: complex plans, per-URL mental math, a UI built for pricing analysts, not founders. |
| **Priceva / Pricefy / budget tools** | ~$20-100/mo tiers | Thin extraction reliability and alert quality; weak or absent position/history views; several push auto-repricing as the headline. |
| **Marketplace repricers (Aura, BQool etc.)** | ~$27-100/mo | Amazon-only; irrelevant to own-storefront brands but absorbs the search term "repricer." |
| **The bookmarks folder + spreadsheet** | Free | The real competitor. Beaten by the first overnight alert the founder didn't have to click for, and by history charts no spreadsheet was ever kept honest enough to hold. |

## Landing Page (message architecture)

- **Enemy:** the silent undercut -- the competitor's Tuesday-night price drop you discover from a Friday sales dip.
- **One sentence:** know your price position on every SKU before your first coffee, without touching a spreadsheet or trusting a robot with your prices.
- **The device (used relentlessly -- hero, pricing, OG image, emails):** **"Your price position while you slept."** Rendered as the morning digest assembling: the overnight timestamp line, two rival prices ticking to new values, your SKU's marker sliding down the position ladder, the amber UNDERCUT chip landing with a suggestion beneath it.
- **Hero:** the machine running -- a tracked rival's price ticks down at 2:14am, the alert posts to Slack, the position ladder re-sorts. Claim above it: "They moved at 2am. You knew at 7." De-risk line: "No card required. Read-only, always."
- **The math:** one hero SKU undercut for two unnoticed weeks vs $49/mo; the 20-minute morning tab-click ritual x 22 workdays vs the digest.
- **Objection killer:** "I don't want software repricing my store" -- neither do we. PriceProbe has no write access to your store, by architecture. Suggestions show their reasoning and wait for you.
- **Receipts (Law 5, never fabricated):** live extraction previews on real public product pages, our own tracked test catalog with real timestamps, clearly framed -- never invented "brands trust us" numbers.
- **One CTA phrase, verbatim everywhere** (hero / post-proof / post-pricing / sticky mobile bar): **"Start free — 14 days"**.

## Key Risks

1. **Extraction breaks; trust breaks with it.** Sites change markup, add bot defenses, or serve regional prices. Mitigation: structured-data-first extraction (JSON-LD survives redesigns), per-domain selector fallbacks, loud per-page failure states, extraction preview at setup, and a "report a wrong price" loop that feeds selector fixes.
2. **Scraping posture.** Aggressive scraping invites blocks and reputational risk. Mitigation: per-domain rate limits with jitter, robots awareness, conservative frequencies by plan, no login-wall or CAPTCHA-busting in v1; public-page price data is the industry's long-standing practice, and politeness keeps it sustainable.
3. **Incumbents cut price downmarket.** Prisync could ship a $49 tier. Mitigation: win on the trust wedge (never auto-push), the extraction preview, and the digest habit; stay faster to set up than anything demo-led.
4. **Alert fatigue kills retention.** Mitigation: noise filters, per-SKU muting, digest-first defaults (immediate alerts only for flagged SKUs and rule breaches), and exposure-sorted dashboards so attention lands where margin bleeds.
5. **Proxy/compute costs creep with catalog size.** Mitigation: pricing axis = tracked SKUs; per-plan check frequencies; hash short-circuits on unchanged pages; flagged-SKU hourly checks reserved for the top tier.
