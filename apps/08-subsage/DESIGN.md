# SubSage — Design Specification (v3, redline level)

## Vision
A calm financial companion in your pocket — the opposite of banking-app
anxiety. Deep-night navy, one soft patina accent, and a single emotion tuned
above all: relief. Every subscription is a tidy object you can inspect and
throw away, and the number getting smaller is the whole show. Native mobile
first, last, and always.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `night` | `#0A1128` | The ground. Every screen. |
| `surface` | `#141B36` | Sheets, subscription cards, the paywall panel only |
| `hairline` | `#232B4D` | 1px dividers & card borders — never brighter |
| `text` | `#EEF2FF` | Primary text |
| `text-2` | `#8B93B5` | Secondary text |
| `text-3` | `#565E85` | Faint (timestamps, placeholders) |
| `paper` | `#F0F3FF` | **Primary buttons** (night text on it), the monthly total |
| `patina` | `#3FA796` | THE accent. ≤10% of any screen: active tab, links, focus, the settle sweep, insight bars |
| `green` | `#46B274` | Money saved only |
| `amber` | `#DFA83E` | Renewal warnings only |
| `rose` | `#E0697B` | Price hikes / cancel only |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: patina never fills a button or a surface (the v2 accent-pill CTA is
retired); `paper` is the only high-emphasis fill; green/amber/rose carry
meaning only. Service-brand tints on cards are capped at a 10% wash over
`surface`, derived from the service logo, never saturated.

## Type — exact specimen

Faces: **General Sans** (400/500/600/700) for display and UI · **JetBrains
Mono** (500) for list prices and dates. Both self-hosted/embedded (Expo asset
fonts), preloaded before first paint.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Monthly total (hero) | GS 700 | `clamp(40px, 11vw, 64px)` / 1.0 | −0.02em, tabular figures |
| H2 (screen title) | GS 600 | 22 / 1.2 | −0.01em |
| Title (service name) | GS 600 | 16 / 1.3 | 0 |
| Body | GS 400 | 16 / 1.55 | 0 |
| Secondary | GS 400 | 13 / 1.45 | 0 |
| Label | GS 600 | 11 / 1.2 | +0.08em, uppercase |
| Data (list price, renewal date) | JBM 500 | 13 / 1.2 | 0, tabular figures |
| Button | GS 600 | 15 / 1 | 0 |

The hero total is the app's face; cents render at 60% size. All list-level
money and dates are mono tabular so columns of prices align.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **12** (controls: buttons, inputs, chips) · **16** (subscription
  cards) · **24** (sheets, paywall). Nothing else — the v2 20px card radius
  consolidates to 16.
- Elevation: none. Depth is `surface` vs `night` plus hairlines; only the
  sheet scrim shadows.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `home`, `renewals` (calendar-clock), `insights` (bars),
`gear`, `plus`, `scan-mail` (envelope + magnifier), `bell`, `bell-snooze`,
`scissors` (cancel), `arrow-up-right` (price hike), `arrow-down` (saved),
`shield` (privacy), `check`, `x`, `chevron-right`, `export`. Nav renders at
22px, inline at 18px. **No emoji, anywhere, ever** — service identity comes
from real logos in a 32px rounded container (radius 12), with a two-letter
GS 600 monogram fallback on `hairline`.

## Component construction (exact)

- **Primary button:** paper fill, night text, radius 12, height 52 (full-width
  in thumb zone), GS 600 15. Press: scale 0.97 + fill `#DDE3F5`. Disabled:
  `#28304F` fill, `text-3` text.
- **Secondary:** transparent, 1px hairline, `text`. Press: border `#2E3760`.
- **Quiet action:** text-only, patina, no underline; press dims to 80%.
- **Input:** night fill, hairline border, radius 12, height 48, 16px text.
  Focus: border patina + 2px offset ring at 25% patina.
- **Chips (category: Streaming / Software / Fitness):** height 36, radius 12,
  hairline; active = patina 1px border + patina text.
- **Subscription cards:** the one framed object — `surface` + 10% brand wash,
  hairline border, radius 16, padding 16, ≥72px tall: logo 32px left, Title
  name + Secondary next-renewal ("Renews `Jul 11`"), JBM price right
  ("`$15.49`"). Swipe left reveals cancel-assist (rose), right snoozes
  (amber); both also live in the detail sheet.
- **Renewal strip:** horizontal scroller of chips (height 44, radius 12,
  hairline): logo 20px + JBM day ("`Fri`") + price; imminent (≤48h) = amber
  1px border.
- **Saved chip:** height 28, hairline, green text ("saved `$15.99`/mo") —
  appears only after a cancel.
- **Insight bars:** rounded-cap 8px patina bars on hairline tracks, JBM values
  right; category rows are hairline rows, not boxes.
- **Paywall sheet:** radius 24 top, padding 20; weekly-with-trial as the
  primary paper button ("Start 3-day free trial · then `$4.99`/wk"), annual as
  a secondary button beneath ("`$34.99`/yr — save 87%"), close X at full
  opacity from the first second, 44×44.
- **Bottom tab bar:** height 56 + safe-area, `surface` at 94% + blur, hairline
  top. Four items, 22px icons + 10px labels; active = `text` + 2px patina dot;
  inactive = `text-3`.

## The signature — the total that responds (kept, refined)
The monthly total is a live odometer. Cancel a subscription and the digits
roll **down** with `spring-gentle` (≤600ms, ~1px motion blur mid-roll) while a
saved chip floats up 12px and settles; beneath the settled figure a 1.5px patina
underline sweeps left→right in 240ms `ease-out-quart` and fades. Adding rolls
up, no sweep — only relief earns the sweep. Reanimated 3 on the UI thread at
60fps; one roll per 2s, batched. No particles, no space scene. Everything
else is state feedback ≤240ms.

## Mobile layout (390×844 — primary spec)
- **Home:** gutter 20. Label "THIS MONTH" over the hero total `$142.47`, then
  Secondary "12 subscriptions · `$1,709` a year". The 7-day renewal strip
  ("Netflix `Fri` `$15.49`", "iCloud `Sun` `$2.99`"). Then the card stack —
  real services, real prices. One insight teaser row at the bottom ("Streaming
  is 41% of your total →"). **Add subscription** primary pinned in the thumb
  zone; **Scan email for subscriptions** quiet action above it on first run.
- **Onboarding:** value promise → Gmail connect with the privacy card
  (`shield` glyph, "We read receipts. We never store bodies. Everything lives
  on this phone.") → paywall sheet. No dark patterns; the free path (5 manual
  subs) is stated on the paywall itself.
- **Subscription detail (sheet):** logo + Title, JBM price history sparkline
  (1.5px, rose segment where a hike occurred, "`$13.99 → $15.49 · Mar`"),
  next renewal, reminder toggles, cancel-assist guide with deep link.
- **Insights:** monthly/annual totals, category bars, month-over-month delta
  ("`−$8.50` vs June" in green).

## Responsive
A phone app; there is no desktop product. It adapts within mobile: respect
`env(safe-area-inset-*)` and Dynamic Island; scale with the OS font-size
setting (layouts tolerate 130%); landscape and small tablets widen the card
stack to two columns. No WebGL anywhere — the constraint is the point.

## Motion & touch
Shared token spirit via Reanimated 3. Imminent renewals breathe amber (3s
cycle); day-of gets a single 9am ripple. Price hike: the card's rose seam
splits old from new — old price slides down to 40% opacity as a strikethrough
draws (240ms); no tilt. Scan results deal in with 80ms stagger, confirmed or
denied by swipe or buttons. Targets ≥44px; primary actions in the thumb zone.
Pull-to-refresh re-scans recent receipts (also a button). Haptics
choreographed and motion-independent: light tick on card grab, medium on
cancel confirm, success notch on the roll-down.

## Reduced motion & fallback
Odometer → direct number swap with a single 100ms patina underline fade.
Card-deal → cards appear at once with an 80ms fade. Hike seam → static
old→new with a rose label. Breathing → solid amber. **Haptics are preserved**
— they are motion-independent and carry the relief. Every figure and status
is also plain text.
