# TrustBadge

**Social proof that doesn't slow your store down.** Collect post-purchase reviews via email/SMS, display them with the fastest review widget on the market (<15KB gzipped, sub-30ms, zero CLS), on Shopify or any platform via a single script tag.

---

## Setup

Needs Node 20+ and a Postgres database. Nothing else is required to boot: every
integration is optional and the app says so on screen when one is missing.

```bash
npm install
cp .env.example .env          # then fill in DATABASE_URL and AUTH_SECRET
npm run db:migrate            # applies drizzle/ to that database
npm run dev                   # http://localhost:3000
```

Sign up, and you land on the install screen with a script tag ready to paste.

**The two variables that are genuinely required** are `DATABASE_URL` (use Neon's
*pooled* connection string in production) and `AUTH_SECRET`
(`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
Everything else degrades honestly:

| Unset | What happens |
|---|---|
| `RESEND_API_KEY` | Review requests are logged, not sent, and the request row stays `scheduled` with the reason on it — the funnel never claims a send that did not happen. |
| `SHOPIFY_API_KEY` / `SECRET` | The Shopify install flow is hidden and the webhook endpoint returns 503. The script-tag install and the generic order webhook still work. |
| `STRIPE_SECRET_KEY` | Upgrade buttons are hidden; everyone stays on Free. |
| `S3_*` | Uploaded review photos are stored in Postgres and served from `/api/media/<id>` — fine for development, not for storefront traffic. |
| `CRON_SECRET` | `/api/cron/tick` refuses every request rather than defaulting to an open trigger. Run `npm run sweep` by hand instead. |

**Scripts**

| Command | Does |
|---|---|
| `npm run dev` | Builds the embed, then starts Next on :3000 |
| `npm run build` | Builds the embed (failing over the 15KB gzip budget), then `next build` |
| `npm test` | Unit tests via `node --test`; the escaping suite is the important one |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run sweep` | Sends every review request that is due, from a terminal. `-- --dry` to look without sending |
| `npm run db:generate` | New migration from the schema |

In production the sweep runs as a cron-triggered route (`vercel.json` points at
`/api/cron/tick` every 10 minutes, which needs Vercel Pro — Hobby runs cron only
once per day).

---

## The Problem

Reviews drive a 15–30% conversion lift for e-commerce stores — this is one of the most consistently replicated findings in CRO. Every merchant knows it. Yet the tooling landscape forces a bad trade-off:

1. **Shopify-locked.** Loox is photo-review done well, but it's Shopify-only. Migrate to WooCommerce or a headless cart and your entire review history and widget stack is stranded.
2. **Ugly and dated.** Judge.me is feature-dense and cheap ($15/mo flat), but merchants routinely complain the widgets look like 2014 and require CSS surgery to match a modern theme.
3. **Slow.** The dirty secret of review widgets: most inject 80–300KB of JavaScript synchronously, tank Largest Contentful Paint, and cause layout shift as reviews pop in. Merchants pay for a conversion tool that quietly *costs* them conversion via Core Web Vitals penalties — Google uses CLS and LCP as ranking signals.
4. **Enterprise-priced.** Yotpo starts reasonable and then quotes climb into the hundreds and thousands per month once you need photo reviews, SMS, or API access. Merchants doing $50k/mo GMV get sales-called like they're Fortune 500 accounts.

Nobody owns the position: **fast, platform-agnostic, flat-priced**. That's TrustBadge.

## Target User

Shopify and WooCommerce merchants doing **$10k–$500k/mo GMV** — big enough to know social proof lifts conversion and to have order volume worth harvesting, small enough that a Yotpo quote is offensive. Typically a founder or 1–3 person team who:

- Cares about site speed (they've run Lighthouse, they've seen the third-party-script damage)
- Wants photo/video reviews because their product is visual (apparel, home goods, supplements, gadgets)
- Is currently on Loox/Judge.me and annoyed, or on nothing and leaving money on the table
- Will not sit through a sales call to see pricing

## Market & Profitability

Review-widget SaaS is a proven category with a long revenue tail:

- Judge.me, Loox, Stamped, and Okendo each have tens of thousands of Shopify installs; the category top apps monetize a single-digit percent of a 2M+ Shopify merchant base.
- Realistic solo/small-team outcome for a well-executed entrant: **$5k–$40k MRR**. This is not a venture-scale bet; it's a durable niche SaaS.
- A concrete, honest target: **300 paying merchants averaging $35/mo blended ≈ $10.5k MRR at month 18–24.** Getting there means roughly 1,500–2,500 total installs at a 15–20% free→paid conversion, which is in line with category norms on the Shopify App Store.
- **Churn is the tax on this category: 5–7%/mo** is normal because e-commerce stores themselves die at high rates. At 6%/mo churn, 300 customers requires ~18 net-new paying merchants/mo just to hold steady. Plan acquisition volume accordingly; do not model 2% churn and lie to yourself.
- Expansion revenue is real: merchants grow order volume and upgrade tiers naturally. Order-based tier limits mean pricing scales with customer success, not with a sales negotiation.

## Monetization & Pricing

Flat, public, self-serve. No "Contact Sales" anywhere.

| | **Free** | **Starter — $19/mo** | **Growth — $39/mo** | **Pro — $79/mo** |
|---|---|---|---|---|
| Orders/month | 50 | 300 | 1,500 | Unlimited* |
| Widgets | Badge only | All (wall, carousel, badge, stars) | All | All |
| Email review requests | — | ✓ | ✓ | ✓ |
| Photo reviews | — | — | ✓ | ✓ |
| Discount incentives | — | — | ✓ | ✓ |
| SMS requests | — | — | ✓ | ✓ |
| Review imports (Amazon, Etsy, Google, CSV, Judge.me/Loox) | — | — | ✓ | ✓ |
| Video reviews | — | — | — | ✓ |
| A/B testing (widget variants, request timing) | — | — | — | ✓ |
| API access | — | — | — | ✓ |
| "Powered by TrustBadge" branding | Yes | Yes | Optional | Removed |

\* Fair-use soft cap at 10,000 orders/mo; above that we talk, but we never ambush with a quote.

Pricing logic: Free tier is a distribution channel (branding link = viral loop, same play Loox/Judge.me run). $19 undercuts nothing dramatically but wins on speed + polish. $39 is the volume tier — photo reviews and incentives are the highest-perceived-value features in the category. $79 caps the ladder well below where Yotpo *starts* serious conversations.

## MVP Feature List

- [ ] Shopify OAuth install flow (app bridge, session token auth)
- [ ] Order/fulfillment webhook ingestion → review request scheduling
- [ ] Scheduled review-request emails via Resend (configurable delay, e.g. 14 days post-fulfillment)
- [ ] Hosted review submission page (star rating, text, photo upload to R2)
- [ ] Photo-review discount incentive (unique code issued on photo submission)
- [ ] Moderation queue: approve / reject / reply, auto-publish threshold setting
- [ ] Review wall widget (masonry grid, lazy-loaded images)
- [ ] Carousel widget
- [ ] Badge + star-snippet widgets
- [ ] Single embed script: `<script async src="cdn.trustbadge.io/w.js" data-store="...">` — ≤15KB gzip, zero CLS budget enforced in CI
- [ ] Edge-cached reviews JSON API (Cloudflare, target ≤30ms TTFB)
- [ ] schema.org `AggregateRating`/`Review` JSON-LD injection for rich snippets
- [ ] Stripe subscription billing with tier enforcement (order-count metering)
- [ ] CSV import + Judge.me/Loox export-file migration tool
- [ ] Merchant dashboard: request funnel (sent → opened → submitted), rating trend, widget impressions
- [ ] Generic script-tag install docs for WooCommerce / custom carts

## Differentiation

1. **Speed as a measurable, marketed claim.** The widget bundle has a hard engineering budget: **≤15KB gzipped, ≤30ms TTFB from edge cache, 0.00 CLS contribution, fully async, never blocks storefront render.** CI fails the build if the bundle exceeds budget. We publish live Lighthouse comparisons against Loox/Judge.me/Yotpo widgets on the marketing site. No competitor can match this without rewriting their widget from scratch — it's years of accumulated bloat on their side.
2. **Flat, public pricing.** The anti-Yotpo. Price is on the pricing page, the top tier is $79, and it never changes based on who's asking.
3. **Platform-agnostic by design.** The widget is a vanilla-JS embed hitting a public JSON API; Shopify is an integration, not the foundation. This is the anti-Loox, and it de-risks Shopify platform dependency (see Risks).

## Go-to-Market

1. **Shopify App Store ASO flywheel.** The app store is the category's dominant channel. Ship fast, ask every happy merchant for an app review at the moment they see their first collected review go live (in-dashboard prompt). Ratings volume → ranking → installs → ratings.
2. **Comparison-page SEO.** "Yotpo alternative", "Loox alternative", "Judge.me vs Loox", "fastest Shopify review app" — high-intent, low-competition queries. One honest, benchmark-heavy comparison page per competitor, with real Lighthouse scores as the hook.
3. **Migration tool as growth lever.** One-click import of Judge.me/Loox export files removes the single biggest switching cost (losing review history). Market it explicitly: "Switch in 10 minutes, keep every review."
4. **CRO agency partnerships.** Agencies doing conversion work for $10k–$500k/mo stores recommend tools constantly; speed story gives them a client-billable win. Offer 20% recurring referral.
5. **Twitter/X e-commerce operator community.** Build-in-public with widget performance benchmarks; e-comm operator Twitter loves speed receipts and Yotpo pricing screenshots.
6. **WooCommerce plugin directory.** Near-zero competition for a modern review widget there; the generic script tag makes the plugin a thin wrapper.

## Competition

| Competitor | Pricing | Strength | Weakness TrustBadge exploits |
|---|---|---|---|
| **Loox** | From $9.99/mo, scales with volume | Photo-first UX, strong Shopify brand | Shopify-only; widget weight; pricing scales up fast with order volume |
| **Judge.me** | $15/mo flat | Cheap, feature-dense, huge install base | Dated widget design, cluttered UX; wins on price but loses on polish and speed |
| **Yotpo** | Enterprise quotes, $100s–$1000s/mo | Brand, full marketing suite, enterprise features | Opaque sales-led pricing enrages SMBs; heavy scripts; overkill for target segment |
| **Okendo** | From ~$19/mo, quickly $119+ | Attributes/quiz data, strong DTC brands | Gets expensive fast; Shopify-centric; no speed story |
| **Stamped** | Free tier, paid from ~$23/mo | Broad feature set, loyalty add-on | Jack-of-all-trades UX, middling reviews on support; no differentiated wedge |

## Key Risks

1. **Shopify platform dependency.** Shopify can change APIs, review policies, or promote its own native reviews. *Mitigation:* platform-agnostic architecture from day one (script tag + public API is the core, Shopify is an adapter); WooCommerce channel as second leg; Shopify's 0% rev share under $1M keeps economics fine, but never let >70% of revenue depend on the app store channel by month 24.
2. **Judge.me price-competes at $15 flat.** We will not win a price war against an established incumbent. *Mitigation:* don't fight on price — fight on speed (provable, hard to copy) and design. $19 vs $15 is noise for a merchant doing $30k/mo; a 5-point Lighthouse difference is not.
3. **Review-gating / FTC compliance.** The FTC's 2024 fake-reviews rule bans selectively soliciting only positive reviews and undisclosed incentivized reviews. Incumbents have been burned. *Mitigation:* no review gating in the product, period (all ratings get the same follow-up flow); incentives reward *any* photo review regardless of rating; auto-append disclosure text on incentivized reviews; publish a compliance page — make compliance a trust feature, not fine print.
4. **Email deliverability.** Review-request emails from a shared domain hitting spam kills the core loop. *Mitigation:* Resend with per-merchant subdomain sending (`reviews.merchantdomain.com`) and enforced SPF/DKIM setup in onboarding; suppression lists and bounce handling from day one; SMS as a higher-deliverability fallback on Growth+.
