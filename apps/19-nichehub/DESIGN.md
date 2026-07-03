# NicheHub — Design Specification

## Vision
A beautifully kept field guide, printed at scale. NicheHub is an engine that generates
many directories, so its design is a meta-system: an editorial cartography language —
cream paper, ink, one accent per directory — tuned so every page reads as lovingly
curated rather than programmatic SEO sludge. On a phone, first, it reads fast and clean.

## Mobile layout (390 × 844)
These are content pages; mobile reading and Core Web Vitals win over everything.
- **Header:** a slim running header ("CRMs for Nonprofits") with a hairline rule and a
  44px search affordance; no hamburger over-nav — categories live inline.
- **Directory home:** a single scroll of index-card rows, one column, each card a listing
  (name, monogram pin, one-line summary, mono "verified" date). Cards are HTML+CSS, no
  images above the fold that shift layout — LCP is a headline, not a canvas.
- **Search** opens a full-width sticky field in the thumb zone; results re-typeset the
  list below with a mono result count. Faceted filters live in a bottom sheet ("Filter"
  button), applied via checkboxes with a single "Show N" confirm.
- **Sticky footer CTA** on listing pages: the outbound/"claim listing" action as a
  full-width accent button in the bottom third.
- **Comparison pages** put the spec table in an `overflow-x:auto` container so the body
  never scrolls sideways; the verdict sits above it as readable prose.

## Identity (engine defaults — each directory re-skins via tokens)
| Role | Name | Hex |
|---|---|---|
| Paper | Atlas cream | `#F7F3EA` |
| Ink | Ink | `#1E1B16` |
| Accent | Cartography red (per-directory) | `#C6402E` |
| Field | Field green | `#5B7553` |
| Rule | Hairline | `#D9D2C3` |
| Muted | Warm grey | `#847C6B` |

- **Display:** `Source Serif 4` 600 — field-guide headlines. **UI/body:** `Inter`,
  16px min, ~65ch measure. **Data:** `IBM Plex Mono` for coordinates, counts, and
  "last verified" stamps — verification typeset like survey measurements.
- **Signature detail — the verification stamp:** every listing card carries its
  "Verified March 2026" date in mono, and on first view it presses in once with a subtle
  1px emboss (single, per session). Freshness made visible on every card is the trust
  thesis and the SEO thesis at once — and it costs nothing on CWV. One accent per
  directory: link underlines, pins, the stamp.

## Responsive
Single column → at `md` category shelves become two-up card rows with folio numbers in
the corners; comparison pages gain side margins and running headers. The print-grid
(hairline column rules, section headers) only appears where width allows. **Optional
desktop enhancement:** the engine admin ("composing room") gets a walnut-dark theme with
a live directory preview pane — desktop workspace, never on the public reader path.

## Motion & touch
- Deliberately minimal — CWV is the aesthetic. Filter re-sorts use FLIP with
  `spring-gentle`; the mono count updates with a brief odometer. Removing a filter is
  instant (respect impatience asymmetrically).
- Comparison "winning" cells get a hand-drawn accent circle (SVG stroke draw, 250ms) on
  scroll-into-view. "Best for X" #1 pick gets an ink "TOP PICK" stamp, no motion beyond
  a press-in.
- Targets ≥44px; sponsored cards get a discreet accent border and small-cap "Sponsored"
  stamp — no special motion, integrity by restraint.

## Key screens
1. **Directory home (money screen):** running header + search; index-card rows by
   category; colophon footer ("Maintained by hand. Updated weekly.") — trust theater
   that's actually true.
2. **Listing detail:** field-guide entry — monogram pin, spec table on rule lines,
   curator's note in italic serif, verified stamp, outbound CTA; "appears in"
   cross-references as pin trails.
3. **Comparison page:** readable verdict with a drop cap, evidence rows with grease-
   pencil circles, scrollable spec table.
4. **Engine admin (composing room):** dark walnut; ingestion runs as typesetting jobs;
   thin-content guard flags render as red proof-marks on rejected pages.

## Component language
- Buttons: rectangular 4px radius, ink fill on cream (accent for primary listing CTAs);
  press = letterpress dip. ≥44px.
- Cards: index-card look, 2px radius, hover lifts 1px; punched-hole detail is a real mask
  cutout revealing page background.
- Pagination: folio-style "Sheet 2 of 14" in mono with hairline rules.
- Empty state: an empty map with one waiting pin: "No listings match. Loosen a filter."

## Reduced-motion & fallback
Stamp emboss → static. Filter FLIP → 100ms fade. Grease-pencil circles → static ink
marks. Every page is designed to degrade to a perfect static document — CWV budget
always wins over motion.
