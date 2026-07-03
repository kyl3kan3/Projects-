# CartBoost — Design Specification

## Vision
The cash-register moment, celebrated with merchant-grade taste. CartBoost lives inside
Shopify's world, so it is Polaris-fluent but carries one quiet signature: found money,
acknowledged. Everything speaks the merchant's language — zero risk, real receipts — and
the shopper-facing offer is fast and honest above all, because checkout speed is sacred.

## Mobile layout (390 × 844)
Two mobile surfaces, both critical: the Shopify-admin embedded app, and — most of all —
the shopper post-purchase page (the majority of checkouts are on a phone).
- **Shopper offer page (the artifact):** single column — product photo at 1:1 up top,
  offer copy and price, then a **full-width "Add" button, 48px, in the thumb zone**, with
  the honest "No thanks" decline link directly below at 100% opacity, 14px minimum. No
  fake timers, real prices. Total interaction budget 400ms — delight never delays.
- **Merchant app:** Polaris mobile patterns — top bar, single-column cards, the
  found-money headline in register green first, then the live tape feed and active
  funnels. Primary actions are full-width; the funnel builder collapses to a vertical
  node list on phone (drag reorders; add/offer/downsell as stacked cards with 44px edit
  taps).

## Identity
| Role | Name | Hex |
|---|---|---|
| Merchant paper | Polaris grey | `#F6F6F7` |
| Card | White | `#FFFFFF` |
| Brand | Boost violet | `#7B5CFF` |
| Found money | Register green | `#108043` |
| Offer accent | Sunrise | `#FFB44D` |
| Ink | Ink | `#202223` |

Muted `#6D7175`.

- **UI:** `Inter`, Polaris-compatible, 16px min; **money always tabular figures**,
  register green when incremental. **Display (marketing):** `Cabinet Grotesk` 800 — bold
  shopkeeper energy.
- **Signature detail — the drop:** when a shopper taps Add, the item lands in the order
  with one restrained move — a small arc + `spring-snappy` settle (≤200ms, no
  squash-stretch box theater), the order total updates with a quick count, and a register-
  green "+$14.50 — found money" chip prints once. In the merchant app the live revenue
  feed prints one tape line per real accepted upsell (rate-limited). The physics say the
  whole pitch — *it's already sold; you're just adding to the box* — without a canvas.

## Responsive
The embedded app follows Polaris breakpoints exactly (review passes, merchants feel zero
friction); CartBoost's violet appears only on our primary actions, funnel nodes, and the
found-money ledger. At `md` the funnel builder becomes a horizontal node canvas with
violet spline connections; the analytics ledger goes two-column. **No desktop-only 3D.**
The shopper page is identical across sizes — one product, one button, honest decline.

## Motion & touch
- Shared tokens: the drop `spring-snappy`; ledger rows print top-down on load
  (`ease-out-quart`, 40ms stagger, max 12 then instant); acceptance dial sweeps
  `ease-out-quart`, once.
- Targets ≥44px; shopper Add button 48px. Offer-editor edits update the shopper preview
  live with a 150ms crossfade.
- Free-tier cap: the meter fills toward $200 as found money accrues; at 80% a gentle
  sunrise glow — the upgrade nudge as warmth, not warning.

## Key screens
1. **Dashboard (embedded, money-forward):** found-money headline in register green, tape
   feed beneath, active funnels as node-cards with acceptance sparklines, install
   checklist with satisfying strike-throughs.
2. **Funnel performance (money screen):** per-offer ledger (shown / accepted / revenue),
   register-tape monthly view, and the ROI line ("CartBoost: $29. Found: $1,840. 63×")
   typeset large — the screenshot merchants share.
3. **Shopper offer page:** the artifact — one product, one 48px button, honest decline,
   the restrained drop on add.
4. **Marketing / app-store assets:** the drop hero; a "flat pricing, no revenue share"
   comparison table where rev-share rows visibly take a bite from a revenue bar; merchant
   quotes styled as till receipts.

## Component language
- Buttons: Polaris-scale; primary violet in-app; shopper-page button merchant-brand
  colored, full-width, 48px.
- Cards: white, 8px radius, Polaris shadows; funnel nodes get violet 2px borders when
  active.
- Money chips: register-green "+$14.50" pill, tabular figures — the brand's most repeated
  glyph.
- Empty state: an open, empty order box: "Pick a product to offer after checkout. Two
  minutes."

## Reduced-motion & fallback
Drop → item appears with a green flash + total crossfade. Tape printing → rows fade in.
Dial sweep → set position. Shopper-page motion is minimal by default (conversion first);
merchants can disable it entirely. Conversion never waits on animation.
