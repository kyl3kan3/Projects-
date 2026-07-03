# RankRadar — Design Specification

## Design vision
A signals-intelligence station for search. Dark slate console, a sweeping radar
beam, keyword positions as contacts on a scope — SEO reframed from spreadsheet
drudgery to *surveillance craft*. The agency user should feel like an operator
with better instruments than the client's other vendors. Serious hardware energy,
warm enough for daily use.

## Brand identity

| Role | Color | Hex |
|---|---|---|
| Console slate | `#0E141B` |
| Panel | `#161F29` |
| Brand | Radar green | `#4ADE80` |
| Sweep trail | `#22C55E` at falloff |
| Rising | Signal cyan | `#38BDF8` |
| Falling | Threat amber | `#F59E0B` |
| Lost page-1 | Red | `#EF4444` |
| Text | `#E2E8F0` / muted `#8A99A8` |

- **Display & UI:** `Geist` (fallback `Inter`); **positions, deltas, volumes:** `Geist Mono` tabular — a position number is an instrument reading.
- **Logo:** "RankRadar" with a radar-dish "R" whose sweep line extends as the wordmark's underline. Icon: the sweep in a rounded square.
- **Voice:** operator's brief. "12 keywords moved into page one overnight. 3 need content."

## Art direction
- Instrument-panel layout: bezel-like panel edges (1px `#243140` with a 1px inner `#0A0F14`), section labels in small mono caps like silkscreened console text.
- Delta arrows are the core glyph set: ▲ cyan, ▼ amber, ● steady gray — custom-drawn, optically centered next to mono numerals.
- Charts on graph-paper: 8% opacity dot grid, position axis inverted (rank 1 on top, always).

## The signature moment — "The Sweep"
Marketing hero + dashboard header share the motif. A circular radar scope (canvas
/ WebGL): the beam sweeps at 8s/rev with a phosphor-decay trail (shader falloff).
Keywords are contacts — blips at radius = rank distance from #1 (center = #1).
As the beam crosses a blip it **refreshes**: today's position pings bright while
yesterday's ghost lingers at the old radius with a tether line — movement toward
center draws a cyan tether, away draws amber. Hovering a blip freezes the beam
locally and raises a data card (keyword, position, Δ, URL). On the marketing
page the scope runs a scripted narrative: a cluster of blips migrates
center-ward over 3 sweeps while the counter types "+14 positions." In-product,
the scope is a real, filterable view of the tracked set — decorative *and* load-
bearing.

## Motion system
- **Daily refresh:** rank-table rows update with a top-to-bottom sweep-line pass (a 2px green scanline traverses the table in 800ms; rows re-sort behind it with `spring-gentle` FLIP moves).
- **Position deltas:** the numeral rolls (odometer) while its delta arrow strokes in; page-one entries fire a single sonar ring from the row (600ms, one ring only).
- **SERP-feature chips** (AI Overview, snippet, local pack): flip in as small split-flap tiles when gained; gray out with a static-noise dissolve when lost.
- **Brief generation:** a "target lock" sequence — the keyword's blip gets bracketed ⌜⌝ (200ms), then the brief document assembles beside it section-by-section (outline lines draw, entities populate as chips, 60ms stagger).
- **Share-of-voice donut:** competitor arcs draw on load (600ms, staggered); your arc lands last and slightly overshoots.

## Key screens
1. **Marketing hero:** The Sweep scripted scene, left; right, the operator's claim: "See every movement. Know what to write next." Below: white-label report shots fanned like classified folders.
2. **Project console (core):** scope top-left as the summary instrument; rank table dominant (keyword / position / Δ / best URL / volume / SERP chips); right rail = movers feed with sonar-ring events.
3. **Money screen — the Client Report:** switches to a light "print" theme (white, slate ink, the agency's logo) — deliberately *not* console-styled, because it's the agency's artifact, not ours; charts simplify, wins lead. The theme swap itself is a feature demo.
4. **Brief view:** target-locked keyword header, outline left, entities/questions right as chip clouds, internal-link suggestions as connecting threads to the site's tracked pages.

## Component language
- Buttons: 6px radius, radar-green fill with slate text; secondary bezel-outline. Hover = phosphor edge.
- Tables: dense, 40px rows, mono numerals right-aligned; row hover raises a 2% green wash.
- Empty state: a scope with no contacts, beam sweeping: "Add keywords to acquire targets."
- Alerts config: threshold dials drawn as instrument knobs (drag to rotate, detents at 3/5/10 positions).

## Reduced motion & fallback
Scope → static plot with delta tethers pre-drawn; beam removed. Scanline refresh → instant table update with row-level green flashes. Sonar rings → badge highlight. All movement data duplicated in the delta column.
