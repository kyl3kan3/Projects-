# DispatchDeck Design — "The Cab at Dawn"

Art direction anchored in the product's world: the view over a dash at
5am — asphalt dark, instrument light, one hazard-amber accent doing real
work. This is an instrument panel, not a dashboard-app cliché: few
surfaces, big legible numerals, statuses you can read at arm's length in
a moving world. The office view shares the same dark instrument world —
one product, one cockpit.

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

## Palette

| Token | Hex | Use |
|---|---|---|
| `asphalt` | `#16181B` | App ground (the pre-dawn road) |
| `panel` | `#1F2226` | Cards, sheets |
| `line` | `#2C3035` | Hairlines only |
| `linen` | `#F2F0EA` | Primary text; primary button fill |
| `dim` | `#9EA0A0` | Secondary text |
| `faint` | `#5E6165` | Tertiary, disabled |
| `hazard` | `#CE8A2A` | THE accent: active load thread, detention clock, focus (≤10%) |
| `moss` | `#5F8A5E` | Semantic: paid / on-time only |
| `flare` | `#C25B4A` | Semantic: overdue / failed only |

Hard rules: `hazard` never fills a button or a surface — it is the
thread, the clock, and small marks. `linen` is the only high-emphasis
fill (asphalt text on it). Semantic colors carry money/status meaning
only. Dark-only in v1, by choice: the cab at dawn is the product's hour.

## Type — exact specimen

Faces: **Archivo** (400/500/600 — signage grotesk, built for wayfinding,
nothing like reflexive Inter) for display and UI · **IBM Plex Mono**
(500) for every rate, mile, timestamp, and reference number. Both
self-hosted woff2, preloaded.

| Role | Face/weight | Mobile size/lh | Notes |
|---|---|---|---|
| Display (load rate) | Archivo 600 | 32/36 | tabular via Plex Mono for digits |
| H2 (screen title) | Archivo 600 | 22/28 | -0.01em |
| Title (card) | Archivo 600 | 16/22 | |
| Body | Archivo 400 | 16/24 | |
| Secondary | Archivo 400 | 13/18 | `dim` |
| Placard (status) | Archivo 600 | 11/14 | +0.08em, uppercase |
| Mono (money/miles/time) | Plex Mono 500 | 13–15 | tabular-nums everywhere |

## Space, radii, hairlines

4px scale (4/8/12/16/24/32/48). Radii: 8 (cards/inputs), 6 (chips),
999 (status dots) — three, no more. Borders are 1px `line` hairlines;
separation comes from space first, hairlines second, never shadows on
dark. Touch targets ≥ 48px; the cab's advancing button is 56px.

## Signature detail — the hazard thread

One continuous 2px `hazard` line runs down the left of the active load's
stop list — booked at the top, delivered at the bottom — advancing past
each stop as timestamps stamp in. The thread IS the lifecycle: marketing
device, cab view, and board view all draw the same element. Nothing else
on screen is amber except the detention clock, which is the thread's
emergency register.

## Motion

One signature: **the stamp** — every status advance stamps its
timestamp in with a 120ms scale-settle (1.04 → 1.0) and the thread
extends 160ms `cubic-bezier(0.25, 1, 0.5, 1)` to the next stop. The
packet build animates pages stacking (3 × 80ms staggers). Everything
else is 120–160ms opacity/transform. `prefers-reduced-motion`: thread
and stamps render final-state instantly.

## Screens (MVP)

1. **Cab card (`/cab`)** — the driver's whole world: current load,
   rate in display type, next stop with window, THE button (one action,
   56px, linen fill), the hazard thread down the stop list, detention
   clock inline when arrived. One hand, arm's length, moving world.
2. **Load board (`/loads`)** — office view: columns by status or a
   dense list (toggle), each row: reference, broker, lane
   (ORIG → DEST in Plex Mono), rate, thread-position glyph, age.
3. **Load detail** — the thread full-height on the left; stops with
   stamps; documents rail (rate con, POD, packet); accessorial lines;
   invoice state footer.
4. **Rate-con review** — split view: PDF left, extracted fields right,
   confidence per field; confirm builds the load. Low-confidence fields
   get `hazard` underlines, not red alarm.
5. **IFTA quarter (`/ifta`)** — per-state table (miles, gallons, MPG),
   quarter switcher, export buttons. Pure Plex Mono table — the
   instrument panel's ledger register.
6. **Settlement (`/settlement`)** — the week: revenue, fuel, fees,
   the per-mile number in display type. Honest math shown as lines,
   not a donut chart.
7. **Landing** — asphalt world, the load-card device running the four
   beats (see README), packet assembly close-up, pricing, honest FAQ.
   CTA verbatim: "Start free — 14 days".

## Empty / loading / error

Empty states name the next action ("Forward a rate con to
loads@yourhandle.dispatchdeck.app — the load builds itself"). Loading
is skeleton rows in `panel` (no shimmer). Errors are plain sentences
with the retry inline; parse failures always show the document that
did land.
