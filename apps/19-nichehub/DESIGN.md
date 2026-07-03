# NicheHub — Design Specification

## Design vision
A beautifully kept atlas. NicheHub is an engine that prints *many* sites, so its
design is a meta-system: an editorial cartography language — cream paper, ink,
one accent per directory — engineered so every generated directory looks like a
lovingly curated field guide rather than programmatic SEO sludge. The engine's
own admin dresses like a print shop's composing room.

## Brand identity (engine defaults — every directory re-skins via tokens)

| Role | Color | Hex |
|---|---|---|
| Paper | Atlas cream | `#F7F3EA` |
| Ink | `#1E1B16` |
| Accent (per-directory token) | default Cartography red | `#C6402E` |
| Field green | `#5B7553` |
| Rule lines | `#D9D2C3` |
| Muted | `#847C6B` |

- **Display:** `Source Serif 4` 600 — field-guide headlines; **UI/body:** `Inter`; **coordinates, counts, "last verified" stamps:** `IBM Plex Mono` — verification data typeset like survey measurements.
- **Logo (engine):** a compass rose whose north needle is a map pin. Each directory gets a generated monogram: its initial inside a pin, in its accent.
- **Voice:** curator. "512 listings. Verified March. 14 added this week."

## Art direction
- **Print-grid religion:** every directory page is built on visible structure — hairline column rules, running headers ("SECTION B — CRMs for Nonprofits"), folio numbers in corners on comparison pages. The craft signals "humans curate this," which is also the SEO thesis.
- Listing cards are index cards: cream, 2px radius, a punched-hole detail top-left, category stamp top-right, and the mono "verified" date bottom — freshness as a visible design element on *every* card.
- Accent discipline: one accent per directory (link underlines, pins, stamps); the engine enforces contrast programmatically.

## The signature moment — "The Plotting Table"
Directory homepage hero: a **2.5D paper map** of the niche (stylized terrain in
cream/ink contour lines — for geo niches a real region, for topic niches an
abstract "landscape of options" with labeled territories). On load, **pins drop**
in sequence (staggered 30ms, each with a 1-bounce settle and a tiny paper
shockwave ring) — one per top listing, count ticking in mono. Typing in search
*replots the map*: non-matching pins retract (pull up and out, 150ms), matching
territories slide closer together (layout morph, 400ms `ease-in-out-soft`), and
the results list typesets itself beside the map line-by-line like a composing
stick filling. Scroll collapses the map into a persistent minimap in the corner.
Implementation: SVG terrain + Framer Motion (no WebGL — these pages must score
100 on CWV; the "3D" is layered parallax at two depths, ≤ 30KB total).

## Motion system
- **Comparison pages (A vs B):** the two contenders' spec rows slide in from opposite margins and meet at the rule line; winning cells get a hand-drawn accent circle (SVG stroke draw, 250ms) — like a curator's grease pencil.
- **"Best for X" lists:** entries typeset top-to-bottom with 40ms stagger; the #1 pick receives an ink stamp rotation-in ("TOP PICK", -6°, press animation).
- **Filters:** applying a filter re-sorts cards with FLIP moves (`spring-gentle`) and updates the mono result count with an odometer; removing filters is instant (respect the reader's impatience asymmetrically).
- **Sponsored placement:** sponsored cards get a discreet accent border and a "Sponsored" small-cap stamp — *no special motion*; integrity by restraint.
- **Verification stamps:** on listing pages, the "Last verified" date carries a subtle embossed press on first view (once per session).

## Key screens
1. **Directory home (money screen):** Plotting Table hero + search; below, category shelves as index-card rows with running headers; footer carries the directory's colophon ("Maintained by hand. Updated weekly.") — trust theater that's actually true.
2. **Listing detail:** field-guide entry — name, monogram pin, spec table with rule lines, curator's note in italic serif, verified stamp, outbound CTA in accent; sidebar shows "appears in" cross-references as pin trails.
3. **Comparison page:** the meet-at-the-rule animation, verdict paragraph set in serif with a drop cap, evidence rows with grease-pencil circles.
4. **Engine admin (composing room):** dark walnut theme (`#221D18`) contrast to the public cream — ingestion runs render as typesetting jobs (rows composing), thin-content guard flags render as red proof-marks on rejected pages, config editor with live directory preview.

## Component language
- Buttons: rectangular 4px radius, ink fill on cream (accent for primary CTAs on listings). Press = letterpress dip.
- Cards: index-card look, hover lifts 1px with a paper shadow; punched hole is a real cutout (mask) revealing page background.
- Empty state: an empty map with one waiting pin: "No listings match. Loosen a filter."
- Pagination: folio-style "Sheet 2 of 14" in mono with hairline rules.

## Reduced motion & fallback
Pin drops → all pins pre-placed. Map replot → instant filter with count flash. Card FLIPs → fades. Stamps → static. Parallax off. CWV budget always wins over motion — this design deliberately degrades to a perfect static document.
