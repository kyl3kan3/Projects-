# ResumeRocket — Design Specification (v3, redline level)

## Vision
A job search runs on a phone between other obligations, so ResumeRocket turns
application anxiety into calm instrumentation: paste a posting, see the gap,
close it. Two honest grounds — deep indigo app chrome and bright paper documents
— and one signature: the X-ray flip that shows what the ATS robot actually reads.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `indigo` | `#12172E` | App-chrome ground: nav, tailor workspace, tracker |
| `panel` | `#1A2140` | Sheets and grouped panels on `indigo` only |
| `hairline-d` | `#262E52` | 1px dividers/borders on dark ground |
| `text` | `#EAEDF9` | Primary text on dark |
| `text-2` | `#8B93BC` | Secondary text on dark |
| `paper` | `#FCFCFA` | Document surfaces; **primary buttons on dark** (ink text) |
| `ink` | `#1A1D29` | Document text; **primary buttons on paper** (paper text) |
| `hairline-l` | `#E4E3DC` | 1px dividers/borders on paper ground |
| `blue` | `#3B66D9` | THE accent. ≤10% of any screen: brand mark, links, active tab dot, X-ray field outlines, focus rings |
| `green` | `#3DDC97` | Covered keywords / apply-ready state only |
| `amber` | `#F5B84D` | Missing keywords + unverified-AI underline only |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules per ground: on `indigo`, the only high-emphasis fill is `paper`
(ink text); on `paper` document surfaces, the only high-emphasis fill is `ink`
(paper text). `blue` never fills a button or a surface; green/amber appear only
where they mean coverage or a gap. Match score is not a color — it is a numeral.

## Type — exact specimen

Faces: **Archivo** (SemiExpanded 700) for display · **Inter** (400/500/600) for
UI · **IBM Plex Mono** (500) for data · resume-body suites: **Source Serif 4**,
Inter, **IBM Plex Sans**. All self-hosted woff2, preloaded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (score, hero) | Archivo 700 | `clamp(34px, 9vw, 60px)` / 1.05 | −0.01em |
| H2 (screen title) | Archivo 700 | 24 / 1.15 | 0 |
| Title (row/card) | Inter 600 | 16 / 1.3 | 0 |
| Body | Inter 400 | 16 / 1.55 | 0 |
| Secondary | Inter 400 | 13 / 1.45 | 0 |
| Label | Inter 600 | 11 / 1.2 | +0.08em, uppercase |
| Data (score, keywords) | IBM Plex Mono 500 | 13 / 1.2 | 0, tabular figures |
| Resume body (default) | Source Serif 4 400 | 15 / 1.5 | 0 |
| Button | Inter 600 | 15 / 1 | 0 |

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **10** (buttons, inputs, chips) · **14** (suggestion cards, panels) ·
  **20** (sheets, the document frame). Nothing else.
- Elevation: none on dark; the paper document alone carries one soft shadow
  (`0 2px 12px rgba(10,12,24,.35)`) because it is a physical object.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `file-text` (applications), `crosshair` (tailor), `layers`
(documents), `kanban` (tracker), `chevron-left`, `plus`, `check`, `x`,
`clipboard-paste`, `download`, `scan` (X-ray), `arrow-up-down` (reorder),
`link`. Nav renders at 22px, inline at 18px. **No emoji, anywhere, ever** —
match score renders as a mono chip (`MATCH 74`), never a face or a rocket.

## Component construction (exact)

- **Primary button (dark ground):** `paper` fill, `ink` text, radius 10, height
  48, full-width in thumb zone. Press: scale 0.98 + fill `#ECEDE8`. Disabled:
  `#232A4C` fill, `text-2` text.
- **Primary button (paper ground):** `ink` fill, `paper` text, radius 10,
  height 44. Press: fill `#2B2F3D`.
- **Secondary:** transparent, 1px hairline (per ground), text color of ground.
- **Quiet action:** text-only `blue`, no underline; press dims to 80%.
- **Input:** ground fill, hairline border, radius 10, height 48, 16px text.
  Focus: `blue` border + 2px offset ring at 25% blue.
- **Keyword chips:** height 32, radius 10, mono 13 text; covered = green 1px
  border + green text; partial = hairline border, `text` text; missing = amber
  1px border + amber text. Grouped under 11px uppercase labels (COVERED 12 ·
  PARTIAL 4 · MISSING 6), horizontally scrolling, no scrollbar.
- **Match meter:** 4px track `hairline-d`, fill `text` (not blue), numeral in
  Archivo 34 mono-spaced beside it; the meter only moves on real change.
- **Suggestion card:** `panel` fill, hairline border, radius 14, padding 16;
  proposed text in resume face with a 1px dashed amber underline; right column
  holds a 44px `check` accept and a 44px `x` dismiss. Nothing dashed exports.
- **Application rows (tracker):** NO boxes. Full-bleed rows ≥56px, 16px vertical
  padding, hairline dividers: Title 16 ("Senior Product Designer — Stripe"),
  mono meta ("MATCH 91 · APPLIED JUN 24"), status Label right.
- **Segmented control (Resume / X-ray):** height 40, radius 10 container with
  hairline; active segment `paper` fill + `ink` text on dark.
- **Bottom tab bar:** height 56 + safe-area, `panel` at 94% + blur, hairline
  top. Four items (file-text / crosshair / layers / kanban) at 22px with 10px
  Inter 600 labels; active = `text` + 2px blue dot; inactive = `text-2`.

## The signature — the X-ray flip
The segmented control cross-dissolves the paper document into its machine read
in 200ms `ease-out-quart`: parsed fields (NAME, TITLE, DATES, SKILLS) snap into
1px `blue` outline boxes with 11px uppercase blue labels; anything the parser
drops (two-column sidebar, skill icons, tables) desaturates to `#B9B7AE` flat
gray with a mono `NOT READ` tag. A count line prints beneath in mono:
`PARSED 23 FIELDS · DROPPED 2 REGIONS`. It is a state toggle — instant, honest,
replayable, opacity + color only, 60fps on any phone. No sweep, no scan-line
theatrics. This is the entire brand animation.

## Mobile layout (390 × 844 — primary spec)
- **Tailor workspace (money screen):** gutter 20. Top bar: back chevron, "Stripe
  · Senior Product Designer" truncating, pinned mono chip `MATCH 74`. Match
  meter block, then the Resume/X-ray segmented control, then the document at
  full width with 16px inner margins, then keyword chip groups, then suggestion
  cards ("Led migration of design tokens across 4 platform teams" — dashed
  amber until accepted). Primary button fixed above the tab bar: "Tailor now"
  (paper fill), becoming "Apply-ready" with a single quiet green meter band at
  all-clear — never confetti.
- **Free ATS X-ray (funnel):** paste/upload sheet (radius 20, 40×4 grab handle
  in `hairline-d`, spring 320ms) → the flip reveals the machine view → three
  findings free as hairline rows ("Your skills table is invisible to ATS"),
  rest behind signup. The result card is a phone screenshot by design.
- **Document editor:** paper ground edge-to-edge; sections reorder via
  long-press drag (`spring-gentle`) with up/down `arrow-up-down` buttons as
  equivalent; pagination chip in mono (`PAGE 1 OF 1`). Ink primary "Export PDF"
  at bottom.
- **Tracker:** hairline application rows as specced; a weekly cadence line at
  top in mono (`THIS WEEK 6 SENT · 1 INTERVIEW`). Status segments: Applied ·
  Interview · Offer.

## Responsive
≥768px: Tailor splits posting (left) · document (center) · gap rail (right);
the segmented toggle becomes a side-by-side human/machine pair; gutters 32.
≥1024px: max content 1120 centered; tracker becomes a board. Optional desktop
enhancement: hover tooltips per parsed X-ray field — pointer-only, lazy, never
on the mobile path. The flip is the signature at every size.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Chips file into their groups at an 80ms cadence,
≤8 before batching (`+ 4 more`). Meter animates only on real change
(`spring-gentle`). Accepting a suggestion draws the check in 200ms and the
dashed underline dissolves. Swipe-left dismisses a suggestion card — dismiss
button always present. Targets ≥44px, ≥8px apart. Export gives a light haptic
tap on native.

## Reduced motion & fallback
X-ray flip → instant swap, count line still prints. Chip filing → pre-docked
with counts. Meter → set value. Dashed amber underline stays (it is
information). Sheets fade instead of spring. All motion collapses to ≤100ms
opacity; nothing is motion-only.
