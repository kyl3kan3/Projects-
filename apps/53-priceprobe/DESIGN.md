# PriceProbe — Design Specification (v5, redline level)

## Vision
The pre-market desk, tidied: yesterday's tape pinned flat, positions marked
in pencil, nothing blinking for attention. PriceProbe is quiet market paper —
cool grounds, ticker blue used like a position marker, mono prices
everywhere. The satisfying moment is the morning reveal: the overnight
changes ticking in, your marker sliding on the ladder, the day's picture
settled before the first coffee.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `paper` | `#F5F6F8` | The ground. Every screen — cool market paper |
| `card` | `#FCFDFE` | Position ladders, history panels, digest cards only |
| `hairline` | `#E2E4E9` | 1px dividers & panel borders — never darker |
| `ink` | `#1F2530` | Primary text AND primary button fill |
| `ink-2` | `#5D6675` | Secondary text |
| `ink-3` | `#959CA9` | Faint (timestamps, provenance lines, placeholders) |
| `ticker` | `#3E6FB0` | THE accent. ≤10% of any screen: your position marker, links, active states, focus rings, the digest header |
| `green` | `#3B8663` | Price advantage / back in stock / handled only |
| `amber` | `#B4862D` | Undercut / attention / suggestion open only |
| `red` | `#B04B3E` | Blocked page / floor breach / stale data only |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: `ticker` never fills a button or a surface; `ink` is the only
high-emphasis fill (paper text on it); semantic colors carry market/data
state only. Committed to the single light world — this is the morning desk,
not a midnight terminal; no dark theme in v1, by choice. Rises and falls
are never colored red/green by direction alone: color marks *your exposure*
(undercut = amber), not the market's mood.

## Type — exact specimen

Faces: **Schibsted Grotesk** (400/500/600 — newsprint-born, sharp without
coldness) for display and UI · **Fragment Mono** (400) for every price,
delta, timestamp, and SKU code. Both self-hosted woff2, preloaded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (marketing hero) | SG 600 | `clamp(32px, 8.5vw, 54px)` / 1.08 | −0.015em |
| Hero stat (position count) | FM 400 | `clamp(34px, 9.5vw, 52px)` / 1.05 | −0.01em, tabular |
| H2 (screen title) | SG 600 | 22 / 1.2 | −0.01em |
| Title (SKU row) | SG 600 | 16 / 1.3 | 0 |
| Body | SG 400 | 16 / 1.55 | 0 |
| Secondary | SG 400 | 13 / 1.45 | 0 |
| Label | SG 600 | 11 / 1.2 | +0.08em, uppercase |
| Data / prices / deltas | FM 400 | 13 / 1.2 | 0, tabular figures |
| Button | SG 600 | 15 / 1 | 0 |

All prices, deltas, and timestamps are mono tabular, always. Your own price
renders mono in `ticker` wherever it appears beside rivals — the accent's
quietest recurring home.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **8** (controls: buttons, inputs, chips) · **12** (ladders, history
  panels, digest cards) · **20** (sheets, chart expanders). Nothing else.
- Elevation: none. Depth is `card` on `paper` plus hairlines; only the sheet
  scrim shadows.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `tag-price` (SKUs), `ladder-rungs` (positions),
`pulse-line` (history), `bell-quiet` (alerts), `bulb-flat` (suggestions),
`probe-dot` (the brand mark — a circle with a reading line), `arrow-delta`,
`slack-hash`, `mail-flat`, `link-page`, `pause-small`, `download`,
`chevron-right`, `plus`, `gear`.
Nav renders at 22px, inline at 18px. **No emoji, anywhere, ever** — an
undercut gets the `arrow-delta` glyph and an amber pill, not a chart emoji.

## Component construction (exact)

- **Primary button:** `ink` fill, `paper` text, radius 8, height 48 mobile
  (full-width in thumb zone), SG 600 15. Press: scale 0.98 + fill `#293140`.
  Disabled: `#D8DBE0` fill, `ink-3` text.
- **Secondary:** transparent, 1px hairline, `ink`. Press: border `#CBCFD6`.
- **Quiet action:** text-only, `ticker`, no underline; press dims to 80%.
- **Input:** `card` fill, hairline border, radius 8, height 48, 16px text.
  Focus: border `ticker` + 2px offset ring at 25% ticker.
- **Chips (exposure filter: All / Undercut / Attention / Handled):**
  height 36, radius 8, hairline; active = `ticker` 1px border + `ticker`
  text.
- **SKU row (positions list):** NO boxes. Full-bleed rows ≥56px, hairline
  between: Title(16) SKU name, your price mono in `ticker` + position
  badge right ("#2 of 5"), Secondary line ("nearest: TrailShop $79.99 ·
  −$5.00" in `ink-3`); exposure dot left (`green` advantage, `amber`
  undercut, `red` floor breach).
- **Position ladder (SKU detail):** `card`, radius 12, padding 16: one
  hairline row per seller sorted by price — label, mono price, mono delta
  to you right; YOUR row carries a 2px `ticker` left rail and `ticker`
  price. Stock-outs render `ink-3` struck prices with "out of stock".
- **Provenance line:** under every rival price, Secondary mono in `ink-3`:
  "$84.99 · structured · 22 min ago". Warning/blocked pages swap it for
  the amber/red status note ("blocked since Tue — needs attention").
- **Delta chip:** height 28, radius 8, mono: amber "UNDERCUT −$5.00",
  green "ADVANTAGE +$3.20", red "BELOW FLOOR". Never colored by market
  direction — only by your exposure.
- **Suggestion card:** `card`, radius 12: Label "SUGGESTION", suggested
  price mono (large), the verbatim reasoning as Body, basis rows
  (hairline, mono rival prices), then Accept (primary) / Dismiss (quiet).
  No countdown, no urgency theater — advice waits.
- **History chart:** hairline axes, mono tick labels; your line `ticker`
  2px, rivals `ink-3` 1.5px; stock-gap bands as 4% ink washes with a
  Label; tap-to-scrub with a mono readout row. Wide ranges scroll inside
  the panel — the page never scrolls sideways.
- **Status pill:** height 28, 6px dot + Label(11): `green` "ADVANTAGE" /
  "HANDLED", `amber` "UNDERCUT" / "ATTENTION", `red` "BLOCKED" / "FLOOR",
  `ink-3` "PAUSED".
- **Bottom tab bar:** height 56 + safe-area, `card` at 96% + blur,
  hairline top: ladder-rungs / tag-price / bell-quiet / bulb-flat at 22px
  + 10px labels; active = `ink` + 2px `ticker` dot; inactive = `ink-3`.

## The signature — the overnight reveal (four beats)
When the user opens the positions screen with unseen overnight changes
(and once per morning digest view), one quiet sequence plays: **(1)** the
header line stamps in mono — "WHILE YOU SLEPT · 6 changes · 214 pages
checked" (opacity + 4px slide, 160ms), **(2)** the changed rival prices
tick from old to new — mono digits rolling once, 200ms, 40ms stagger, ≤8
rows, **(3)** your position markers slide to their new rungs on the
affected ladders (`spring-gentle`, ≤300ms), and **(4)** the exposure chips
land — "UNDERCUT −$5.00" settling with `spring-snappy`, the affected SKU
rows re-sorting to the top. Total under 1.2s, no flashing, no red/green
strobe. Everything else is state feedback ≤240ms.

## Mobile layout (390×844 — primary spec)
- **Positions (home):** gutter 20. Label "TUESDAY · 7:04 AM" + hero stat
  `31 of 34` SKUs in position (4px hairline track filled `green`), then
  Secondary "3 undercut · 1 page blocked". Exposure chips, then SKU rows
  sorted by exposure. Thumb-zone primary: **Track a page**; **Run checks
  now** quiet action in the header.
- **SKU detail:** position ladder per the component spec, then the
  history chart, then open suggestions, then tracked pages with
  provenance lines and per-page mute/pause quiet actions.
- **Track a page:** URL field, then the extraction preview card — "we
  read **$84.99, in stock** — correct?" with Confirm (primary) / Fix the
  read (quiet, opens element picker). Ends with the first snapshot row
  timestamped.
- **Alerts & rules:** rule rows (kind, scope, channels, mute state);
  digest preview ("what tomorrow's 7am post will say").
- **First run:** three cards — import your SKUs (CSV/Shopify read-only),
  track your first competitor page (ends on the extraction preview),
  connect Slack (paste webhook URL). Real data replaces each card as it
  completes.

## Responsive
≥768px: positions become a two-pane list + ladder detail; history charts
widen with more tick labels; gutters 32. ≥1024px: left rail replaces the
tab bar; the digest gets a pinned morning panel; max content width 1120
centered. The overnight reveal remains the signature at every size; no
desktop spectacle.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Rows enter with 24ms stagger, opacity +
4px y-slide only — tape never bounces. Chips crossfade 150ms; sheets 320ms
`spring-gentle`; chart scrub follows the finger with zero lag (the readout
updates, the chart never re-animates). Targets ≥44px, ≥8px apart.
Destructive/decisive actions (dismiss suggestion, delete page, accept
suggestion) are hold-to-confirm (600ms fill) for delete only; accept is a
single tap (it changes nothing outside PriceProbe) — and all are
audit-logged. Pull-to-refresh enqueues due checks for visible SKUs.

## Reduced motion & fallback
Reveal → the header line and final states appear with a ≤100ms fade; price
ticks → direct old-to-new swap; ladder slides → instant re-sort. Stagger →
≤100ms opacity fade. Undercut/advantage/blocked states are always plain
text + pill + delta chip — nothing is motion-only, and nothing is
color-only (deltas always carry sign and value in text).
