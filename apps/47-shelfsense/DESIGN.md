# ShelfSense — Design Specification (v3, redline level)

## Vision
A stockroom at 6 a.m., not a growth dashboard. ShelfSense is the calm clipboard
that says what to order, how many, and by when — warm dark ground the color of
a closed warehouse, figures in mono, and one rationed kraft-paper tan that
appears only where a purchase decision lives. The urgency is in the numbers,
never in the chrome.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `ink` | `#15120C` | The ground. Every screen (warm, kraft-tinted dark) |
| `carton` | `#1E1A12` | Panels: PO drafts, grouped stat panels, sheets only |
| `hairline` | `#2B251A` | 1px dividers & panel borders — never brighter |
| `text` | `#F1EDE3` | Primary text |
| `text-2` | `#A79D89` | Secondary text |
| `text-3` | `#6E6656` | Faint (timestamps, placeholders, axis labels) |
| `paper` | `#F5F1E8` | **Primary buttons** (ink text), hero numerals |
| `kraft` | `#B07D3F` | THE accent. ≤10% of any screen: brand mark, reorder notches, active states, links, focus rings, the runway sweep |
| `moss` | `#5E9367` | Healthy cover / resolved only |
| `rust` | `#C75B44` | Stockout risk / order-now only |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: `paper` is the only high-emphasis fill; `kraft` never fills a
button or a surface and never colors a chart series; `moss`/`rust` appear only
where they mean healthy or at-risk. Dollar figures are `text` — money is not
decorated here; the *at-risk* dollar figure alone may carry a `rust` 6px dot
beside it, never colored digits.

## Type — exact specimen

Faces: **Archivo** (400/500/600) for display and UI · **Spline Sans Mono**
(500/600) for every count, dollar figure, SKU code, and date. Both self-hosted
woff2, preloaded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (revenue at risk) | SSM 600 | `clamp(34px, 9vw, 52px)` / 1.05 | −0.01em, tabular |
| H2 (screen title) | Archivo 600 | 22 / 1.2 | −0.01em |
| Title (SKU row) | Archivo 600 | 16 / 1.3 | 0 |
| Body | Archivo 400 | 16 / 1.55 | 0 |
| Secondary | Archivo 400 | 13 / 1.45 | 0 |
| Label | Archivo 600 | 11 / 1.2 | +0.08em, uppercase |
| Data (counts, SKUs, dates) | SSM 500 | 13 / 1.2 | 0, tabular figures |
| Button | Archivo 600 | 15 / 1 | 0 |

Units, days-of-cover, SKU codes, and money are always mono tabular:
`SKU-1042 · 6.2d COVER · ORDER 240 BY JUL 11`.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **8** (buttons, inputs, chips) · **12** (panels, PO cards) ·
  **20** (sheets). Nothing else.
- Elevation: none. Depth is `carton` on `ink` plus hairlines; only the sheet
  scrim shadows.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `shelf` (overview: three horizontal lines, one short),
`hourglass` (order-by), `clipboard` (PO drafts), `truck` (suppliers), `gear`
(settings), `arrow-up-right` (velocity rising), `arrow-down-right` (falling),
`snooze`, `check`, `download` (CSV), `send`, `plus`, `chevron-right`,
`magnifier`. Nav renders at 22px, inline at 18px. **No emoji, anywhere,
ever** — a stockout is a rust dot and a date, not a siren.

## Component construction (exact)

- **Primary button:** `paper` fill, `ink` text, radius 8, height 48 mobile
  (full-width in thumb zone). Press: scale 0.98 + fill `#E6E1D4`. Disabled:
  `#2E2818` fill, `text-3` text.
- **Secondary:** transparent, 1px hairline, `text`. Press: border `#372F1F`.
- **Quiet action:** text-only `kraft`, no underline; press dims to 80%.
- **Input:** `ink` fill, hairline border, radius 8, height 48, 16px text.
  Focus: border `kraft` + 2px offset ring at 25% kraft.
- **Chips (status filter: Order now / Soon / Healthy / Dead):** height 36,
  radius 8, hairline; active = kraft 1px border + kraft text.
- **At-risk stat block:** NOT a card — the top of the page itself. Label
  `REVENUE AT RISK · 30D` over `$6,412` in `paper` Display, then mono
  `4 SKUS PAST ORDER-BY · 3 DUE THIS WEEK` in `text-2`.
- **SKU rows:** NO boxes. Full-bleed rows ≥56px, 16px vertical padding,
  hairline between: 6px status dot left (rust / kraft / moss), Title(16)
  product name, mono line beneath (`SKU-1042 · 38 LEFT · 6.2d COVER`), mono
  order-by date right (`BY JUL 11` in `text-2`; past-due in `rust`).
- **The runway (SKU detail):** a 4px horizontal track in `hairline`; stock
  fill in `text-3` draining left→right toward the projected stockout date;
  the reorder point is a 2px kraft notch with mono date beneath; lead-time
  span hatched. Lives in its own `overflow-x:auto` strip with mono date axis.
- **PO draft card:** `carton`, hairline, radius 12, padding 16: Label
  supplier name + lead time (`APEX GOODS · 18D LEAD`), hairline line items
  (mono qty x SKU, editable qty field 44px), mono total row, full-width
  **Send to supplier** primary in the card footer. Never nested in another card.
- **Bottom tab bar:** height 56 + safe-area, `carton` at 94% + blur, hairline
  top. Four items — shelf / hourglass / clipboard / truck — 22px icons + 10px
  Archivo 600 labels; active = `text` + 2px kraft dot; inactive = `text-3`.

## The signature — the runway re-draw
When the nightly sync (or pull-to-refresh) lands, each visible SKU runway
re-draws: the stock fill animates to its new length in 400ms
`ease-out-quart`, the kraft reorder notch slides to its recomputed position
in 240ms, and if the SKU crossed into `order_now`, a 1.5px kraft underline
sweeps left→right beneath the row's order-by date (240ms) then fades over
400ms. One property leads (the fill); rows stagger 24ms, ≤8 at once. Pure
CSS/SVG transforms — phone-first, 60fps, no canvas. This is the entire brand
animation; everything else is state feedback ≤240ms.

## Mobile layout (390 × 844 — primary spec)
- **Reorder (home):** gutter 20. Top bar: shop switcher (mono
  `oaklane-goods.myshopify.com` truncated) + sync timestamp. At-risk stat
  block, chip row, then SKU rows grouped under Labels `ORDER NOW` /
  `ORDER THIS WEEK` / `HEALTHY`, urgency-ranked. Primary button **Draft
  POs (4 SKUs)** pinned above the safe-area.
- **SKU detail:** Title + mono facts row, the runway, then "the math" —
  hairline rows exposing every input (`VELOCITY 30D · 6.1/day`,
  `LEAD TIME · 18d`, `SAFETY · 7d`, `REORDER POINT · 152 units`), each with
  its source. Thumb zone: **Add to PO draft** primary, Snooze secondary
  (hold-to-confirm 600ms radial fill).
- **PO drafts:** draft cards per supplier; sent drafts collapse to hairline
  history rows (`SENT JUL 2 · 6 LINES · $4,180`).
- **Dead stock:** Display mono total (`$11,940 SITTING`), then rows ranked by
  cash tied up (`Waxed canvas tote · 212 UNITS · 194d COVER · $3,816`), each
  with quiet actions `Discount` / `Snooze`.
- **First run:** full-width **Connect Shopify** primary in the thumb zone;
  above it a `carton` panel with real preview math ("Last quarter you likely
  missed ≈ `$4,900` to stockouts across 7 SKUs").

## Responsive
≥768px: at-risk block joins a top band of three stats (At risk · Dead stock ·
POs pending), SKU list gains columns (velocity trend arrow, supplier), gutters
32. ≥1024px: left rail replaces the tab bar; center is the ranked list; right
rail shows the selected SKU's runway + math; max content width 1160 centered.
No desktop spectacle — the runway re-draw is the signature at every size.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Rows enter with 24ms stagger, opacity + 4px
x-slide only — inventory tables never bounce. Chip changes crossfade 150ms.
Runway notch slide 240ms `ease-in-out-soft`. Pull-to-refresh triggers a
Shopify re-sync (also a header control). Targets ≥44px, ≥8px apart; snooze
and dismiss are hold-to-confirm (600ms); swipe left on a SKU row reveals
**Snooze** (also in row overflow). Haptics native-only, never load-bearing.

## Reduced motion & fallback
Runway re-draw → instant length change with a single 100ms opacity fade; the
kraft underline sweep → a static 1.5px underline that fades in 100ms; stagger
→ ≤100ms opacity. Every animated signal (crossed into order-now, sync landed)
is also plain text in the row (`ORDER BY JUL 11 · PAST DUE`). Nothing is
motion-only.
