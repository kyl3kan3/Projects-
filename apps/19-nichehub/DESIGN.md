# NicheHub — Design Specification (v3, redline level)

## Vision
A beautifully kept field guide, printed at scale. NicheHub generates many
directories from one engine, so this is a meta-system: cream paper, ink, one
cartography accent per directory, verification set like survey measurements.
Every page must read as lovingly curated rather than programmatic sludge — and
Core Web Vitals supremacy is not a constraint on the aesthetic, it *is* the
aesthetic. Light/paper world: ink-filled primary actions, no dark chrome on
the reader path.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `paper` | `#F7F3EA` | The ground. Every reader page. |
| `card` | `#FFFDF6` | Index cards, sheets — the only raised surface |
| `hairline` | `#DAD3C2` | 1px rules, card borders, table lines |
| `ink` | `#1E1B16` | Primary text and **primary buttons** (paper text on it) |
| `ink-2` | `#6E6655` | Secondary text (AA on paper) |
| `ink-3` | `#9A9179` | Faint (folio numbers, disabled) |
| `accent` | `#C6402E` | THE accent (default; re-tokened per directory). ≤10% of any page: links, pins, TOP PICK stamp, active filter, focus rings |
| `green` | `#5B7553` | Verified/success semantic only |
| `red` | `#B3261E` | Errors/moderation flags only |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: accent never fills a button or a surface; `ink` is the only
high-emphasis fill; sponsored cards get a 1px accent border + a `SPONSORED`
Label — no special color washes. Each directory overrides only `accent`, and
every per-directory override must obey the color law above: custom-mixed,
non-purple-family, never a framework-default swatch.

## Type — exact specimen

Faces: **Source Serif 4** (600, + 400 italic) for display and curator notes ·
**Inter** (400/500/600) for UI/body · **IBM Plex Mono** (400/500) for data.
Self-hosted woff2 subsets, preloaded, `font-display: swap`, total ≤90KB.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (page title) | Source Serif 600 | `clamp(28px, 7.5vw, 44px)` / 1.12 | −0.01em |
| H2 (category shelf) | Source Serif 600 | 22 / 1.2 | 0 |
| Title (listing name) | Inter 600 | 17 / 1.3 | 0 |
| Body | Inter 400 | 16 / 1.6, ~65ch | 0 |
| Curator note | Source Serif 400 italic | 16 / 1.55 | 0 |
| Secondary | Inter 400 | 13 / 1.45 | 0 |
| Label | Inter 600 | 11 / 1.2 | +0.08em, uppercase |
| Data (verified, counts, folio) | IBM Plex Mono 500 | 12 / 1.2 | 0, tabular figures |
| Button | Inter 600 | 15 / 1 | 0 |

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **2** (index cards, stamps — printed matter) · **4** (buttons, inputs,
  chips) · **16** (bottom sheets only). Nothing else.
- Elevation: none. Depth is `card` on `paper` plus hairlines; the filter sheet
  alone carries `0 -8px 24px rgba(30,27,22,0.12)`.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `search`, `pin` (map pin — listings), `filter` (sliders),
`out` (arrow-up-right — outbound CTAs), `verified` (check in a shield),
`chevron-right`, `chevron-down`, `plus` (submit listing), `close`, `check`,
`sort`, `flag` (report). Inline 16px, controls 20px. **No emoji, anywhere,
ever** — ratings render as mono (`4.6`), never star rows of glyph soup.

## Component construction (exact)
- **Primary button:** ink fill, paper text, radius 4, height 48 mobile
  (full-width sticky CTA), Inter 600 15. Press: translateY 1px + fill
  `#33302A` — a letterpress dip, 120ms. Disabled: `hairline` fill, `ink-3`.
- **Secondary:** transparent, 1px `ink` border at 40%, ink text. Press:
  border 70%.
- **Quiet action / links:** accent text with a 1px underline offset 3px;
  visited stays accent (directories are reference works).
- **Input (search):** `card` fill, hairline border, radius 4, height 48, 16px
  text. Focus: 2px offset ring in accent at 30%.
- **Index-card row (listing):** `card` fill, hairline border, radius 2,
  padding 16, min-height 88. Inside: 40px monogram pin (accent stroke, paper
  fill, initial in Source Serif 600), Title(17), one-line summary 13/`ink-2`,
  verification stamp bottom-right in mono. Cards sit in a single column with
  12px gaps — the ONE framed object here; everything else is rules.
- **Spec/comparison table:** hairline rows only, no zebra, no boxes; header
  Labels(11); numeric cells mono, right-aligned; lives in `overflow-x:auto`.
  Winning cell gets a hand-drawn accent circle (SVG, 250ms stroke draw).
- **Filter sheet:** radius 16 top, grab handle 40×4 `hairline`, checkbox rows
  44px tall, one ink "Show 34 results" button. The only JS island on the page.
- **Pagination:** folio-style — mono `SHEET 2 OF 14` centered between two
  hairlines, prev/next as 44px chevron targets.

## The signature — the verification stamp
Every listing carries `VERIFIED MAR 2026` — IBM Plex Mono 500, 12px, +0.02em,
`ink` at 70%, inside a 2px-radius 1px-hairline stamp box, padding 4/8. On a
card's first entry into the viewport (once per session, sessionStorage-gated)
it presses in: translateY 1px + a 1px inset shade `rgba(30,27,22,0.18)`, 250ms
`ease-out-quart`, then settles. Stale data (>90 days) sets the stamp `ink-3`
with `LAST VERIFIED NOV 2025` — honesty is typeset, not hidden. The stamp's
box is height-reserved in CSS: zero CLS. This is the entire brand animation.

## CWV supremacy (binding budget)
LCP is the display headline — HTML text, no hero image above the fold — ≤1.5s
on 4G mid-device. CLS 0.00: every image has width/height, the stamp and ad
slots reserve space, fonts are preloaded subsets. INP <200ms: pages are static
HTML; the filter sheet and search index (<10k listings, client-side) are the
only hydrated islands, loaded on interaction intent. No third-party JS on the
reader path; ads (when enabled) load lazily below the fold in fixed-size slots.

## Mobile layout (390×844 — primary spec)
- **Running header:** 48px — directory name ("CRMs for Nonprofits") in Source
  Serif 600 18, hairline rule beneath, 44px `search` affordance right.
- **Directory home:** intro paragraph (real editorial copy, ~50 words), then
  category shelves: H2 ("Donor management", mono count `12`), index-card rows.
  Colophon footer: "Maintained by hand. Updated weekly." + mono last-build date.
- **Listing detail:** monogram pin + Title, spec rows on hairlines ("Pricing —
  from $39/mo", "Nonprofit discount — 50%"), curator's note in italic serif,
  verification stamp, "Appears in" cross-reference links. Sticky footer CTA:
  full-width 48px ink button "Visit Bloomerang" with `out` glyph, above
  safe-area.
- **Comparison page ("Bloomerang vs DonorPerfect"):** verdict as 2–3 readable
  paragraphs with a Source Serif drop cap, then the scrollable spec table,
  then per-tool index cards.
- **Search:** full-width sticky field; result count re-typesets in mono
  (`34 RESULTS`); filters via the bottom sheet.

## Responsive
≥768px: shelves go two-up with folio numbers in card corners; comparison pages
gain running headers and 32px gutters; hairline column rules appear where
width allows; max text measure stays 65ch, page max-width 1080 centered.
**Engine admin ("composing room")** is a separate dark-walnut desktop app —
never on the reader path; ingestion jobs and thin-content rejections render as
red proof-marks there.

## Motion & touch
Deliberately minimal — speed is the brand. Filter re-sorts use FLIP with
`spring-gentle`; the mono count runs a 200ms odometer; *removing* a filter is
instant. TOP PICK is a static ink stamp (Label 11 in a 2px-radius box) with the
same one-time press-in. Targets ≥44px; the sticky CTA sits in the thumb zone;
sheet swipe-down has a visible Close.

## Reduced motion & fallback
Stamp press-in → static. FLIP re-sorts → 100ms fade. Accent circles → static
drawn marks. Odometer → direct set. Every page degrades to a perfect static
document — when motion and CWV ever conflict, motion loses.
