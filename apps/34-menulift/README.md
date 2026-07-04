# MenuLift

**QR menus that don't suck, one-tap 86ing, and menu-engineering analytics that show a restaurant which dishes actually pay the rent — $29-79/mo per location.**

## The Problem

The menu is the highest-leverage document in a restaurant and the worst-managed one. It is the only page every single guest reads before spending money, and in most independent restaurants it is a laminated PDF that lags reality by weeks:

1. **Reprints cost real money and never keep up.** Every price change, supplier swap, or seasonal dish means another trip to the print shop. So prices go stale, margins quietly compress while food costs swing, and the "new" menu is out of date the day it's laminated.
2. **86'd items burn service time and goodwill.** When the kitchen runs out of the half chicken at 7:40pm, every server has to remember to say so at every table for the rest of the night. Guests order it anyway, get told no, and re-decide while the table stalls. The existing QR menu (usually a PDF of the print menu) says nothing.
3. **Owners have no idea which dishes make money.** The POS knows what sold; the invoices know what it cost; nobody joins the two. Menu engineering — the stars/plowhorses/puzzles/dogs analysis taught in every hospitality program — is done in a spreadsheet once, if ever. Meanwhile a widely cited consultancy figure puts the payoff of doing it properly at a 10-15% profit lift (Aaron Allen & Associates, cited across the industry).

The current "digital" answer is a QR code pointing at a PDF that guests pinch-zoom in a dim dining room. That's not a menu platform; it's a print file on a phone.

## Target User

- **Primary:** independent full-service and fast-casual restaurants, 1-5 locations, where the buyer is the owner-operator or GM. They change the menu monthly or seasonally, 86 items nightly, and feel food-cost pressure personally.
- **Secondary:** cafes, bars, and food-hall stalls with simpler menus; small local groups (3-10 locations) that want one dashboard across sites.
- **Buyer profile:** hands-on operator who already pays for a POS, a reservation tool, and a print shop. Will adopt anything that removes a nightly chore and costs less than one reprint cycle.
- **Not a target (yet):** chains with enterprise menu-management systems, ghost kitchens living entirely on delivery-platform menus, and hotels/venues with procurement processes.

## Market & Profitability

Huge surface, brutal churn — both halves deserve honesty:

- **The TAM is real.** The US restaurant industry counts more than 1 million restaurant and foodservice outlets and is forecast to reach $1.5 trillion in sales in 2025 (National Restaurant Association, 2025). Even a fraction of a percent of independents is a healthy SMB SaaS.
- **The margins are the argument.** Full-service restaurants average 3-5% net margins (Restaurant365, 2025; Toast, 2025). At those margins, a tool that surfaces per-dish profitability isn't decoration — it's one of the few levers an operator can pull without adding a table or a cook.
- **QR menus stuck.** Post-2020, QR menus went from emergency measure to fixture; vendor surveys consistently report that roughly half of consumers have used a QR code to view a menu and that US restaurant QR adoption grew triple-digit percentages in the years following 2020 (QRCodeChimp, 2026; Uniqode, 2025). The behavior is normalized; the execution is still mostly bad PDFs — which is the opening.
- **The honest counterweight: restaurants churn.** They close (a large fraction don't survive five years), they're seasonal, and they scrutinize every recurring line item. Assume monthly logo churn well above typical SaaS. The counters: per-location pricing under $80 is decoration-budget money (less than most single reprint runs), the analytics tier creates a provable "this tool found me $X of margin" ROI story, and multi-location groups anchor retention.
- **Realistic ceiling:** this is a $30k-$150k MRR business over 3-5 years — roughly 600-2,500 locations at a ~$45-60 blended ARPU — not a venture rocket. Distribution is door-by-door and partner-by-partner.

## Monetization & Pricing

Per location, per month. 14-day free trial on all tiers, card required.

| Plan | Price | Includes |
|---|---|---|
| **Menu** | $29/mo | Menu builder, hosted QR menu page, QR codes + printable table tents, one-tap 86ing with instant propagation, change history |
| **Kitchen** | $49/mo | Everything in Menu + AI dish-photo enhancement with approval workflow, item scheduling (auto-86 at set times, "back tomorrow"), multiple menus |
| **Margin** | $79/mo | Everything in Kitchen + POS CSV import, menu-engineering matrix (stars/plowhorses/puzzles/dogs) with recommendations, daypart menus, priority support |

Notes on the model:

- **No free tier.** A free QR-menu tier would attract exactly the users who churn fastest (single-page cafes that set-and-forget) and would put MenuLift in a race to the bottom against every free QR-PDF generator. The trial plus a sub-$29 anchor ("less than one reprint") does the conversion work; free would just do support work.
- **Annual discount: 2 months free** (pay 10, get 12). Meaningful for a business that thinks in seasons, and it pre-empts the January "cut every subscription" purge.
- **Multi-location: 20% off every location past the first**, one invoice, one dashboard. Groups are the churn anchor and the expansion story.
- **The Margin tier is the destination.** Menu and Kitchen pay the bills; Margin creates the receipts ("the matrix told me to kill two dogs and re-price a plowhorse; that's $900/mo") that make cancellation feel irrational.

## MVP Feature List

- [ ] Menu builder: sections, items, prices, descriptions, dietary tags (GF/V/VG/DF), dayparts, drag-to-reorder
- [ ] Hosted QR menu page: static-fast (sub-1s LCP on 4G), legible at arm's length, no app, no PDF, dim-room dark variant
- [ ] QR code generation + printable table tents and window cards (PDF)
- [ ] One-tap 86ing: mark an item out of stock from a phone; every live QR menu updates within seconds; optional nightly auto-restore
- [ ] AI photo enhancement pipeline: phone snap -> relight, background cleanup, consistent crop -> before/after review -> owner approves before anything goes live
- [ ] POS CSV import (Toast and Square export formats) -> stars/plowhorses/puzzles/dogs matrix + concrete per-item recommendations
- [ ] Price/description editing with full change history (who changed what, when)
- [ ] Billing (Stripe, per-location quantity, the three tiers above)

Post-MVP (explicitly cut from v1): ordering/payments at the table, POS API sync, reservations, multi-language menus, review widgets.

## Differentiation

1. **Menu-engineering analytics at an indie price point.** Popmenu charges roughly 4-8x more for a marketing suite and still doesn't do margin math. MenuLift's matrix is the classic hospitality-school analysis, automated from a CSV the operator already knows how to export.
2. **Photo enhancement built in, not a photographer.** A menu-grade photo shoot costs hundreds per session and goes stale with the menu. A phone snap through the enhancement pipeline is minutes and pennies — with an approval step, so nothing embarrassing auto-publishes.
3. **86ing as a first-class, one-tap flow.** Competitors treat out-of-stock as a menu edit buried three screens deep. MenuLift treats it as tonight's-service reality: one tap from the expo station, live everywhere in seconds, restored automatically tomorrow.
4. **Speed as a feature.** The guest page is statically rendered and loads in under a second on 4G. No app install, no PDF zooming, no spinner between a hungry guest and the food. Every competitor demo loses this race.
5. **No forced online-ordering upsell.** Toast, Square, and me&u exist to route orders and take a cut. MenuLift is the menu itself — which means it works with any POS and never competes with the operator's margins.

## Go-to-Market Channels

In priority order:

1. **Restaurant-supply and POS reseller partnerships.** The reps who sell smallwares, print table tents, and install POS terminals walk into hundreds of restaurants a month. A 20% recurring referral cut makes MenuLift their easiest add-on conversation.
2. **Instagram/TikTok before-after dish-photo content.** The photo enhancer is inherently demoable: a dim phone snap becoming a menu-grade shot in seconds is a scroll-stopping clip. This is the ad creative and the organic engine in one.
3. **SEO on "qr menu" + "menu engineering template" keywords.** High-volume commodity keywords ("qr code menu") convert on the speed demo; high-intent keywords ("menu engineering template", "stars plowhorses puzzles dogs") convert operators who already believe — ship a free matrix template as the lead magnet.
4. **Local restaurant-association chapters.** State and city associations run vendor directories, newsletters, and trade shows where a live "86 an item, watch the menu update" demo lands. Member discounts buy the listing.
5. **Food-cost consultants and hospitality bookkeepers.** The people who already tell operators "you need to know your plate costs" get a tool that does the visualization for them, plus a referral cut.
6. **Comparison pages.** "MenuLift vs Popmenu," "Toast digital menu alternative," "Square Online menu alternative" — switchers are already sold on the category and searching for the cheaper, sharper option.

## Competition

| Competitor | Pricing | Weaknesses |
|---|---|---|
| **Toast / Square built-in menus** | Bundled with POS (POS itself $0-165+/mo + hardware + processing) | Menus are an afterthought of the ordering flow; slow, ad-cluttered guest pages; no menu-engineering analytics; locks the operator to that POS |
| **Popmenu** | ~$250-400/mo | A full marketing suite (site, SEO, remarketing) most independents don't finish onboarding; no margin math; 4-8x MenuLift's price for the menu features alone |
| **me&u / Mr Yum** | Commission and/or SaaS fees, order-and-pay focus | Built for upmarket hospitality groups and order-at-table; overkill for a restaurant that just wants a great menu; commission model taxes every order |
| **Generic QR-PDF services (Flipdish-style QR vendors, Canva + a QR code)** | Free-$20/mo | The pinch-zoom experience guests hate; no 86ing, no analytics, no photos, no change history; "cheap" until you count reprint-equivalent staleness |
| **The laminated menu + the print shop** | $100-500+ per reprint cycle, weeks of lag | The real incumbent. Zero marginal cost per guest and no battery required — but stale prices, no out-of-stock state, reprint costs forever, and it tells the owner nothing about profit |

## Key Risks

1. **Restaurant churn and closures.** The customer base has structurally high failure rates and seasonal cash crunches. Mitigation: annual prepay discount, multi-location group anchors, pause-instead-of-cancel plan for seasonal operators, and pricing low enough to survive the budget purge.
2. **POS platforms bundle "good enough" menus.** Toast and Square can give menus away. Mitigation: stay POS-agnostic (win every non-Toast, non-Square seat and every operator who resents lock-in), and compete where bundles won't go — margin analytics and photo quality.
3. **AI photo results disappoint on bad inputs.** A blurry, badly lit snap can't always become menu-grade, and one ugly auto-published photo destroys trust. Mitigation: mandatory before/after review and approval, honest "retake this one" guidance, and no auto-publish path anywhere in the product.
4. **CSV-format drift across POS exports.** Toast and Square change export columns without notice, and "other" POSes are a zoo. Mitigation: tolerant importer with a column-mapping UI, format fixtures under test for the big two, and import errors that name the exact column instead of failing silently.
5. **The "QR fatigue" narrative.** Press cycles periodically declare QR menus dead. Mitigation: menus are the one QR use case that demonstrably stuck — but respect print anyway: printable table tents and window cards ship in the base tier, so MenuLift complements paper instead of fighting it.
6. **Single-location price sensitivity.** $29 is small but visible on a thin-margin P&L. Mitigation: anchor against the print shop ("less than one reprint run"), show the 86-nights and price-changes counters in the monthly email, and make the Margin tier's found-money receipts the upgrade story rather than pushing price.
