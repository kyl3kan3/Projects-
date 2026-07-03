# CartBoost — Design Specification

## Design vision
The cash-register moment, celebrated with merchant-grade taste. CartBoost lives
inside Shopify's world, so the design is Polaris-fluent but carries its own
signature: the *drop* — one more item landing in an already-paid cart, and the
revenue counter acknowledging it. Everything speaks the merchant's language:
found money, zero risk, receipts.

## Brand identity

| Role | Color | Hex |
|---|---|---|
| Merchant paper | `#F6F6F7` (Polaris-adjacent) |
| Card | `#FFFFFF` |
| Brand | Boost violet | `#7B5CFF` |
| Found money | Register green | `#108043` |
| Offer accent | Sunrise | `#FFB44D` |
| Ink | `#202223` |
| Muted | `#6D7175` |

- **UI:** `Inter` (Polaris-compatible metrics); **money:** tabular figures always, register green when incremental — the "+$14.50" chip is the brand's most repeated glyph.
- **Display (marketing):** `Cabinet Grotesk` 800 — bold shopkeeper energy.
- **Logo:** a shopping-cart glyph with a small rocket-nozzle at its rear wheel. Icon: cart-with-boost on violet.
- **Voice:** merchant-practical. "This funnel added $1,840 last month. You paid $29."

## Art direction
- **Embedded app = Polaris first:** spacing, forms, and tables defer to Shopify's system so review passes and merchants feel zero friction; CartBoost's violet appears only on our primary actions, funnel nodes, and the found-money ledger.
- The post-purchase offer template (shopper-facing) is engineered for merchant-brand inheritance but ships with impeccable defaults: product photo left at 1:1, offer stack right, one-click button full-width — honesty rules baked into the design (real prices, no fake timers; the "no thanks" link at 100% opacity, 14px minimum).
- Data visuals: receipts, ledgers, and register tape as chart metaphors.

## The signature moment — "The Drop"
Marketing hero: a completed checkout screen (stylized) with a sealed order box.
An offer card slides up from below ("Add the matching case — 20% off, one
click"). Cursor clicks **Add** — the product *drops into the open order box*
(2.5D: the item arcs in with squash-stretch, the box flaps flex outward 4° and
settle, `spring-snappy`), the box's shipping label reprints itself (label slides
out, new total types on, slides back), and a register-tape ticker at screen top
prints one more line: `+ $14.50 — found money`, with the running month total
rolling upward. Three scenarios loop (apparel, supplements, coffee). The physics
of the drop — weight, flap flex, tape print — carries the entire pitch:
*it's already sold; you're just adding to the box.* In-product echo: the live
revenue feed prints a tape line per real accepted upsell (rate-limited).

## Motion system
- **Funnel builder:** trigger→offer→downsell as connected nodes on a canvas; dragging a product into an offer node makes the node inhale (scale 1.05) and mount the product thumbnail with the drop physics at 50% scale; connections draw as violet splines.
- **A/B test results:** the two variants render as side-by-side register tapes; the winning tape extends longer with a per-line print stagger (30ms), then a "promote winner" stamp becomes available with a press-in.
- **Analytics ledger:** the money screen's rows print top-down on load (tape metaphor, 40ms stagger, max 12 then instant); the acceptance-rate dial sweeps with `ease-out-expo`.
- **Offer editor preview:** edits (discount %, copy) update the shopper-preview live with a soft 150ms crossfade; the preview device frame tilts 2° on hover inviting inspection.
- **Free-tier cap approach:** the cap meter fills as found money accrues toward $200; at 80% a gentle sunrise glow — the upgrade nudge as warmth, not warning.

## Key screens
1. **Marketing/app-store assets:** The Drop hero; a "flat pricing, no revenue share" comparison table where competitor rev-share rows literally take a bite from a revenue bar (notch animation); merchant-quote cards styled as till receipts.
2. **Dashboard (embedded):** found-money headline in register green with the tape feed under it; active funnels as node-cards with sparkline acceptance; setup checklist for new installs with satisfying strike-throughs.
3. **Money screen — Funnel performance:** per-offer ledger (shown / accepted / revenue), the register-tape monthly view, and the ROI line ("CartBoost: $29. Found: $1,840. 63×") typeset large — the screenshot merchants share.
4. **Shopper offer page (the artifact):** merchant-branded, one product, one button, honest decline link; the add moment reuses the drop at subtle scale (200ms, small arc) — delight without delay (total interaction budget 400ms; checkout flow speed is sacred).

## Component language
- Buttons: Polaris-scale; primary violet in our app; on shopper pages, merchant-brand-colored full-width with 48px height.
- Cards: white, 8px radius, Polaris shadows; funnel nodes get violet 2px borders when active.
- Money chips: register green pill "+$14.50" with tabular figures — used everywhere an upsell lands.
- Empty state: an open, empty order box: "Pick a product to offer after checkout. Two minutes."

## Reduced motion & fallback
Drop → item appears in box with a green flash + label crossfade. Tape printing → rows fade in. Dial sweeps → set positions. Shopper-page motion minimal by default (conversion first); merchants can disable entirely.
