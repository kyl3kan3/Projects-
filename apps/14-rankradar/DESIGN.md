# RankRadar — Design Specification (v3, redline level)

## Vision
RankRadar answers three weekly questions for small SEO teams: where do we
rank, what should we write next, what does the client report say. A calm,
instrument-grade console — dark slate, tabular numerals, deltas read like
gauge readings — that makes an agency feel better-equipped than the client's
other vendors. Serious, legible, quiet.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `slate` | `#0E141B` | The ground. Every console screen. |
| `panel` | `#151D26` | Framed objects only: sparkline wells, the report preview card |
| `hairline` | `#232E3A` | 1px dividers, table rules — never brighter |
| `text` | `#E4E9EF` | Primary text |
| `text-2` | `#8A99A8` | Secondary text |
| `text-3` | `#55636F` | Faint (untracked cells, placeholders) |
| `paper` | `#EEF2F6` | **Primary buttons** (ink `#0E141B` text), key numerals |
| `radar` | `#4AA96C` | THE accent. ≤10% of any screen: brand mark, active states, the scanline, page-1 ring, links |
| `cyan` | `#3FA9D6` | Semantic: rising deltas only |
| `amber` | `#C67D1A` | Semantic: falling deltas and drop alerts only |
| `report-ink` | `#101A2C` | The client-report light theme's text on `#FFFFFF` |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: radar green never fills a button or a surface; `paper` is the
only high-emphasis fill; cyan/amber appear only beside a delta or in an
alert row — never decoratively.

## Type — exact specimen

Faces: **Geist** (500/600) for display and UI · **Geist Mono** (400/500) for
every position, delta, and volume — a rank is an instrument reading. Both
open-licensed and self-hosted/embedded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (marketing) | Geist 600 | `clamp(32px, 9vw, 56px)` / 1.08 | −0.02em |
| H2 (screen title) | Geist 600 | 22 / 1.2 | −0.01em |
| Title (keyword) | Geist 500 | 15 / 1.35 | 0 |
| Body | Geist 400 | 16 / 1.55 | 0 |
| Secondary | Geist 400 | 13 / 1.45 | 0 |
| Label | Geist 600 | 11 / 1.2 | +0.08em, uppercase |
| Data (position, Δ, volume) | Geist Mono 500 | 14 / 1.2 | 0, tabular figures |
| Tile numeral | Geist Mono 500 | 28 / 1.0 | 0, tabular figures |
| Button | Geist 600 | 15 / 1 | 0 |

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**;
  table row padding 12 vertical.
- Radii: **8** (controls: buttons, inputs, chips) · **12** (panels: sparkline
  wells, report card) · **16** (sheets). Nothing else.
- Elevation: none. Depth is `panel` vs `slate` plus hairlines; the only
  shadow is the sheet scrim.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `radar` (brand: arc + dot), `search`, `file-text` (brief),
`share`, `bell`, `pin`, `filter`, `globe` (location), `link`, `chart`,
`chevron-left`, `chevron-down`, `plus`, `check`, `download` (PDF), `refresh`,
`building` (project), `settings`. Tab bar renders at 22px, inline at 16px.
Delta glyphs are custom-drawn 8px marks optically centered beside the mono
numerals: `▲` cyan (up), `▼` amber (down), `●` `text-3` (steady) — this glyph
set is the core visual language. **No emoji, anywhere, ever.**

## Component construction (exact)

- **Primary button:** `paper` fill, `#0E141B` text, radius 8, height 48
  (full-width in thumb zone), Geist 600 15. Press: scale 0.98 + fill
  `#DDE3EA`. Disabled: `#26303B` fill, `text-3` text.
- **Secondary:** transparent, 1px hairline, `text` label. Press: border
  `#2E3B49`.
- **Quiet action:** text-only radar green; press dims to 80%.
- **Input:** slate fill, hairline border, radius 8, height 48, 16px text.
  Focus: border radar + 2px offset ring at 25% radar.
- **Instrument tiles (Overview):** NOT boxes — a 2×2 strip divided by
  hairlines: Label caption over a Geist Mono numeral (`TRACKED 412`,
  `MOVERS ▲ 18`, `MOVERS ▼ 7`, `PAGE 1 96`).
- **Rank rows:** full-bleed hairline rows, 52px: keyword (Title 15),
  position + Δ in mono (`3 ▲2`), best URL path in `text-3` 12px truncated.
  Wide columns (volume, SERP-feature chips) live in a horizontally
  scrollable region inside the row's own `overflow-x:auto` container.
- **SERP-feature chips:** height 22, radius 8, hairline, Label(10) text:
  `AI OVERVIEW`, `SNIPPET`, `LOCAL PACK`. Present = `text-2`; lost this
  week = `text-3` strikethrough.
- **Sparkline well (keyword detail):** `panel`, radius 12, padding 16; 90-day
  position line 1.5px `text-2`, page-1 band shaded radar at 8%; dot on
  today in radar.
- **Alert rows:** hairline rows with a 3px amber left rule (drops) or radar
  rule (new page-1) — the only colored rules in the app.
- **Bottom tab bar:** height 56 + safe-area, slate 94% + blur, hairline top.
  Overview / Keywords / Briefs / Reports, 22px icons + 10px Geist 600 labels.
  Active = `text` + 2px radar dot; inactive = `text-3`.

## The signature — the delta reveal
When positions refresh, exactly: a single 2px radar-green scanline passes
down the table in 800ms `ease-in-out-soft`; behind it each changed numeral
rolls (odometer, 200ms) as its delta glyph strokes in over 150ms; rows
re-sort behind the line with `spring-gentle` FLIP moves (≤6 concurrent). A
keyword entering page 1 emits one 1.75px radar-green ring expanding from its
row-leading dot — 600ms `ease-out-quart`, opacity 60% → 0, once, never
looping. No sweeping scope on the phone: legible, instant "what moved."

## Mobile layout (390×844 — primary spec)
- **Overview:** gutter 20. Top bar: project switcher ("Meridian Coffee ▾") +
  `bell`. Instrument tile strip, then H2 "Today's movers" and the movers
  feed as rank rows — `pour over coffee guide · 7 ▲5`, `coffee subscription
  box · 12 ▼3`, `best burr grinder · 3 ▲1`. Primary button in the thumb
  zone, contextual: **Generate brief** (or **Share report** on Fridays).
- **Keywords:** search + `filter` chip row (`Location: Austin`, `Mobile`),
  then the dense rank list. Tap a row → full-screen detail: sparkline well,
  volume `1,900`, SERP chips, "Brief this keyword" primary.
- **Briefs:** brief rows ("how to descale an espresso machine · drafted
  Jun 28"); detail shows outline (H2/H3 lines), entities as chips
  (`water hardness`, `citric acid`), PAA questions, internal-link suggestions
  to tracked URLs.
- **Client report (money screen):** flips to the light print theme —
  `#FFFFFF` ground, `report-ink` text, the agency's logo, charts simplified
  to wins-first ("18 keywords gained · 4.2 → 3.1 avg position"). The theme
  swap is itself the feature demo. Share = hosted link + scheduled PDF.

## Responsive
≥768px: Overview tiles go 4-across; keyword table shows volume + chips
inline. ≥1024px: the operator console — rank table dominant, movers rail
right, tiles across the top, left project rail replacing the tab bar; max
width 1280. **Optional desktop-only enhancement:** the radar scope —
keywords as blips at radius = distance from #1, phosphor-decay beam on a 6s
sweep — lazy-loaded behind a static plotted poster, pointer-only, never in
the mobile bundle. The table is the truth on every screen.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Chips flip in when a SERP feature is gained
(`spring-snappy`), desaturate when lost. Brief generation: the keyword
header brackets in (`⌜⌝` strokes, 200ms), then outline lines draw and entity
chips populate (60ms stagger, ≤8). Pull-to-refresh on Overview and Keywords;
swipe a rank row for pin / alert / brief (all present as buttons in detail).
Targets ≥44px — row height 52 with full-row tap.

## Reduced motion & fallback
Scanline → instant table update with a one-frame row highlight at radar 8%.
Odometers → value swaps; delta glyphs appear without stroke; page-1 ring →
a static radar-tinted row rule for one view. FLIP re-sort → instant. Desktop
scope → its poster. Every movement is duplicated in the mono Δ column as
text, so nothing depends on animation.
