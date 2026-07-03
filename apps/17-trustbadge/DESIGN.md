# TrustBadge — Design Specification (v3, redline level)

## Vision
Social proof rendered with a jeweler's restraint. Two quiet systems: a warm
merchant dashboard, and widgets whose whole art is disappearing gracefully
into someone else's storefront — fast, still, honest. The craft is felt as
speed and zero layout shift, not spectacle.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load. Extra law: the widget inherits the *host
store's* type when configured to — TrustBadge's identity never competes with
a merchant's brand.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `daylight` | `#FDFBF7` | The ground. Every dashboard screen. |
| `card` | `#FFFFFF` | Review cards and widget instances only — they are the framed objects |
| `hairline` | `#EAE4D7` | 1px dividers & card borders — never darker |
| `ink` | `#221C13` | Primary text; **primary button fill** |
| `text-2` | `#8C8577` | Secondary text, dates |
| `text-3` | `#BDB6A6` | Faint (empty star tracks, placeholders) |
| `gold` | `#E09112` | THE accent. ≤10% of any screen: filled stars, active states, links, the brand badge |
| `leaf` | `#3B9E6B` | Semantic: verified-buyer check and approve only |
| `red` | `#C4453C` | Semantic: reject/spam flag only |

Hard rules: gold never fills a button or a surface — it exists almost
entirely inside star glyphs; ink is the only high-emphasis fill (there is no
dark ground); `leaf` renders on every verified review without exception —
trust integrity as design law.

## Type — exact specimen

Faces: **Fraunces** (600, soft optics) for display — shopkeeper warmth ·
**Inter** (400/500/600) for UI and review text · **JetBrains Mono** (500)
for metrics. All Google-Fonts-loadable, self-hosted; the embed widget ships
system-stack by default (≤15KB budget) with the merchant's font inherited —
the dashboard always loads its own faces.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (funnel counts) | Fraunces 600 | `clamp(28px, 8vw, 40px)` / 1.1 | −0.01em |
| H2 (screen title) | Fraunces 600 | 22 / 1.2 | −0.01em |
| Title (reviewer, widget name) | Inter 600 | 15 / 1.35 | 0 |
| Body (review text) | Inter 400 | 16 / 1.55 | 0 |
| Secondary | Inter 400 | 13 / 1.45 | 0 |
| Label | Inter 600 | 11 / 1.2 | +0.08em, uppercase |
| Data (rating, speed specs) | JBM 500 | 13 / 1.2 | 0, tabular figures |
| Button | Inter 600 | 15 / 1 | 0 |

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **10** (controls: buttons, inputs, chips) · **12** (review cards,
  widget instances) · **20** (sheets). Nothing else. Widget radius is a
  merchant token, defaulting to 12.
- Elevation: review cards carry `0 1px 2px rgba(34,28,19,0.06)` — the only
  shadow besides the sheet scrim. Everything else is hairlines on daylight.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `star` (the brand glyph — also drawn filled for ratings),
`leaf-check` (verified), `camera`, `video`, `mail`, `message` (SMS),
`inbox`, `check`, `x`, `reply`, `layout` (widgets), `code` (embed), `chart`,
`funnel`, `import` (migration), `settings`, `chevron-left`, `chevron-right`,
`plus`. Tab bar renders at 22px, inline at 16px; rating stars render at 16px
(10px minimum in the badge widget, still legible). **No emoji, anywhere,
ever** — a five-star review renders five drawn stars, never ★-emoji.

## Component construction (exact)

- **Primary button:** ink fill, `daylight` text, radius 10, height 48
  (full-width in thumb zone), Inter 600 15. Press: scale 0.98 + fill
  `#3A3226`. Disabled: `#E2DCCD` fill, `text-3` text. Never gold-filled.
- **Secondary:** transparent, 1px hairline, ink text. Press: border `#D8D0BE`.
- **Quiet action:** text-only gold; press dims to 80%.
- **Input:** card fill, hairline border, radius 10, height 48, 16px text.
  Focus: border gold + 2px offset ring at 25% gold.
- **Star row:** five 16px star glyphs, 4px apart; filled = gold, empty =
  `text-3` outline; partial fill by width clip (a 4.8 clips the last star at
  80%). JBM rating beside it: `4.8 · 312`.
- **Funnel rows (Home):** NOT boxes — four full-bleed hairline rows: Label
  (`ORDERS`, `REQUESTED`, `REVIEWED`, `PUBLISHED`) left, Fraunces count
  right (`1,204 · 806 · 214 · 187`), each row 56px, whole row taps into its
  segment.
- **Review cards:** `card`, hairline, radius 12, padding 16: photo 1:1 top
  (when present), star row + `leaf-check`, Body clamped at 4 lines with a
  quiet "more", reviewer + date in Secondary (`Maya R. · Jun 24`). Cards
  only here and in widgets — settings and lists are hairline rows.
- **Moderation card stack:** one review card at a time; Approve (primary)
  and Hide (secondary) as 48px buttons under the card; swipe right/left does
  the same.
- **Speed receipts:** JBM Label-style line set like jewelry specs:
  `13.2 KB · 28 MS TTFB · CLS 0.00` — appears on Home and marketing, always
  from live measurements, never rounded flattering.
- **Bottom tab bar:** height 56 + safe-area, daylight 96% + blur, hairline
  top. Home / Reviews / Widgets / Settings, 22px icons + 10px Inter 600
  labels. Active = ink + 2px gold dot; inactive = `text-3`.

## The signature — the zero-CLS reveal
The widget's entrance is the brand, exactly: the embed reserves its exact
height before data arrives (server-measured, inlined as `min-height` in the
snippet — CLS 0.00 is a design spec, enforced in CI); cards then settle in
with opacity 0→1 + a 6px rise, 240ms `ease-out-quart`, 30ms stagger, ≤8 at
once; each card's stars fill left-to-right at 90ms per star, and a 4.8
stops honestly mid-star — the last star clips to 80% and holds. Runs in the
vanilla-JS embed at 60fps, zero libraries, within the 15KB budget. The
`leaf-check` never animates — verification just *is*.

## Mobile layout (390×844 — primary spec)
The merchant app is a Shopify-embedded PWA, thumb-first.
- **Home:** gutter 20. H2 "Good morning, Harbor Goods" + speed receipts
  line. Funnel rows, then rating-health line ("4.8 average · 12 awaiting
  review" with star row), then the latest-reviews inbox as review cards.
  Primary button pinned in the thumb zone, contextual: **Approve 12
  waiting** or **Send 43 requests**.
- **Moderation stack:** the card stack — a photo review of a linen apron,
  stars, `leaf-check`, "Beautiful weight, washes well…" — Approve / Hide
  buttons, swipe equivalents; approving issues the reply affordance.
- **Widget studio (money screen):** each widget type (Wall, Carousel, Badge,
  Stars) as a live phone-width instance in a `card` frame; token controls
  (radius, star color, font: Merchant's / TrustBadge) as hairline rows
  below; the embed snippet in a code chip — copied state shows a leaf check.
  The product demos itself on the device it ships to.
- **Shopper review form (merchant-branded):** one question per screen, ≤45s:
  star input (44px tap zones, 1px gold ring pulse on select), text, photo
  upload (thumbnail presses in, scale 1.1→1), then the incentive code
  (`HARBOR10`) slides down like a receipt with the FTC disclosure line in
  Secondary — always, regardless of rating.

## Responsive
≥768px the funnel goes horizontal (4 hairline-divided columns) and Reviews
becomes list + detail panes; the widget wall grows 2–4 columns via
**container queries — it adapts to the host slot, not the viewport**.
≥1024px the dashboard gains a left rail replacing the tab bar; max width
1200. Desktop-only marketing enhancement: the theming playground re-skinning
a fake product page live — lazy-loaded, never on the widget's critical path.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Approve: the `leaf-check` draws its stroke
(200ms) and the card files right 300ms `spring-gentle`; Hide: card fades to
40% and collapses 240ms. Funnel counts roll (odometer, `dur-standard`) on
refresh. Star-input select: 1px gold ring pulse 200ms + haptic tick in
native webviews. Targets ≥44px, ≥8px apart; swipe-to-moderate always has
button equivalents; pull-to-refresh on Home and Reviews.

## Reduced motion & fallback
Widget reveal → instant render, still CLS 0.00 (the reservation is layout,
not motion). Star fills → stepped instant fills, partial widths kept. Card
file/hide → 100ms opacity fade. Odometers → value swaps. Shopper-facing
widgets default conservative, and merchants can disable widget motion
entirely per widget. Every state is complete without animation.
