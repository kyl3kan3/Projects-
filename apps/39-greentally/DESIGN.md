# GreenTally — Design Specification (v3, redline level)

## Vision
A field ledger, not an eco-brand. GreenTally turns a shoebox of utility bills
into a document a procurement analyst respects, so it looks like the document:
warm recycled paper, ink type, ruled hairlines, and one moss green that appears
only where a number is grounded in evidence. No leaves, no globes, no gradient
skies — the credibility *is* the aesthetic.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `paper` | `#F6F4ED` | The ground. Every screen — a daylight, recycled-paper product |
| `sheet` | `#FDFCF8` | Report pages, review panels, sheets only — never list rows |
| `hairline` | `#E4E0D2` | 1px rules & framed-object borders — never darker |
| `ink` | `#22261F` | Primary text; **primary button fill** (paper text) |
| `text-2` | `#6E7365` | Secondary text, meta |
| `text-3` | `#A3A796` | Faint (placeholders, months without data) |
| `moss` | `#567D46` | THE accent. ≤10% of any screen: brand mark, verified figures, provenance threads, active states, links, focus rings |
| `amber` | `#C99038` | Needs-review / low-confidence states only |
| `red` | `#B4503E` | Rejected documents / validation failures only |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: moss never fills a button or a surface; `ink` is the only
high-emphasis fill; amber/red appear only where they mean review or rejection.
GreenTally deliberately commits to this single daylight world — there is no
dark theme; the report and the app share one paper.

## Type — exact specimen

Faces: **Spectral** (500/600) for display and report headings · **Public Sans**
(400/600) for UI · **IBM Plex Mono** (500) for every figure, factor, and unit.
All self-hosted woff2, preloaded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (headline tCO2e) | IPM 500 | `clamp(36px, 10vw, 56px)` / 1.0 | −0.01em, tabular; unit at 40% size |
| H1 (report title) | Spectral 600 | `clamp(26px, 7vw, 40px)` / 1.15 | −0.01em |
| H2 (screen title) | Spectral 600 | 22 / 1.2 | 0 |
| Title (row) | PS 600 | 16 / 1.3 | 0 |
| Body | PS 400 | 16 / 1.55 | 0 |
| Secondary | PS 400 | 13 / 1.45 | 0 |
| Label | PS 600 | 11 / 1.2 | +0.08em, uppercase |
| Data (quantities, factors) | IPM 500 | 13 / 1.2 | 0, tabular figures |
| Button | PS 600 | 15 / 1 | 0 |

Every quantity, factor, and emission figure is mono tabular with its unit:
`128.4 tCO2e`, `41,882 kWh`, `0.383 kgCO2e/kWh (eGRID 2024, RFCW)`.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **8** (controls: buttons, inputs, chips) · **12** (panels, review
  cards) · **20** (sheets). Nothing else. Report pages are square-cornered.
- Elevation: none. Depth is `sheet` on `paper` plus hairlines; only the sheet
  scrim shadows.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `gauge` (footprint), `file-stack` (documents), `table`
(spend), `file-check` (report), `question-list` (answers), `upload`, `flame`
(scope 1), `bolt` (scope 2), `link-chain` (scope 3), `magnifier` (review),
`check`, `thread` (provenance: a dot with a descending line), `download`,
`plus`, `chevron-right`. Nav at 22px, inline at 18px. **No emoji, anywhere,
ever** — and no leaf glyphs; the brand mark is a tally stroke, not foliage.

## Component construction (exact)

- **Primary button:** `ink` fill, `paper` text, radius 8, height 48 mobile
  (full-width in thumb zone), PS 600 15. Press: scale 0.98 + fill `#33382E`.
  Disabled: `#D8D4C4` fill, `text-3` text.
- **Secondary:** transparent, 1px hairline, `ink` text. Press: border `#CFCABA`.
- **Quiet action:** text-only moss, no underline; press dims to 80%.
- **Input:** `sheet` fill, hairline border, radius 8, height 48, 16px text.
  Focus: border moss + 2px offset ring at 25% moss.
- **Chips (year / site filters):** height 36, radius 8, hairline; active =
  moss 1px border + moss text. Never filled.
- **Headline block:** NOT a card — the top of the Footprint screen itself.
  Label `REPORTING YEAR 2025`, then `128.4 tCO2e` Display, then mono scope
  split `S1 22.1 · S2 63.9 · S3 42.4 (SCREEN)` in `text-2`.
- **Coverage meter:** 12 month cells, 12px, radius 4, in a hairline track —
  filled `ink` at 85% when a month has all sources, amber when partial, empty
  `#EDEAE0`. Mono caption `9 OF 12 MONTHS COMPLETE`.
- **Document rows:** NO boxes. Full-bleed hairline rows ≥56px: `file-stack`
  glyph, Title ("March electricity — Consolidated Edison"), mono meta
  (`4,182 kWh · MAR 01–31`), right status: moss `check` (accepted), amber
  `magnifier` (needs review), red text (rejected).
- **Review panel:** `sheet`, radius 12, padding 16: bill image left (zoomable),
  extracted fields right as Label + mono value + confidence in `text-2`
  (`kWh 4,182 · 99%`); low-confidence fields get an amber underline and focus
  first. Accept is the primary button.
- **Report page (print + screen):** `sheet`, square corners, 1px hairline
  frame; Spectral headings, ruled tables, mono figures; every table footnoted
  with factor citations in Secondary. The PDF is this component printed.
- **Answer row:** Label framework tag (`CDP-STYLE C6.1`), question in Body,
  answer in Body on `sheet`, mono source refs beneath; Copy is a quiet action.
- **Bottom tab bar (mobile):** height 56 + safe-area, `paper` 96% + blur,
  hairline top. Footprint / Documents / Report / Answers at 22px icons + 10px
  PS 600 labels; active = `ink` + 2px moss dot; inactive = `text-3`.

## The signature — the provenance thread
Tap any figure — the headline total, a scope row, a questionnaire answer's
number — and a 1px moss thread draws downward from the digit in 240ms
`ease-out-quart`, pinning a provenance sheet: source line ("March bill ·
4,182 kWh"), factor ("0.383 kgCO2e/kWh · eGRID 2024 · RFCW"), arithmetic, all
in mono. The tapped figure gains a 1.5px moss underline while the thread is
open; dismissing retracts the thread in 160ms. Numbers with provenance are the
brand; this is the only drawn animation in the app. Everything else is state
feedback ≤240ms.

## Mobile layout (390×844 — primary spec)
- **Footprint (money screen):** gutter 20. Top: year chip row + site filter.
  Headline block, coverage meter, then Label `BY SCOPE` and hairline rows —
  `flame` "Scope 1 — fuel `22.1 tCO2e`", `bolt` "Scope 2 — electricity
  `63.9 tCO2e`" (location/market toggle inline), `link-chain` "Scope 3 —
  spend screen `42.4 tCO2e`". Each row's figure opens the provenance thread.
  Primary button **Upload bills** pinned above the safe-area until coverage
  is complete; then it becomes **Generate report**.
- **Documents:** upload drop target at top (dashed hairline, `upload` glyph),
  then document rows grouped by month; needs-review rows float to the top
  with the amber `magnifier`.
- **Review:** the review panel full-screen; bill image pinch-zoomable; Accept
  primary in the thumb zone; "Reject document" as quiet red text action.
- **Answers:** framework chip row (CDP-style / EcoVadis-style / Custom), then
  answer rows; a `READY 14 OF 22` mono progress caption under the title.

## Responsive
≥768px: two-column — nav rail left, content 640px; the review panel goes
side-by-side (image left, fields right); gutters 32. ≥1024px: Footprint gains
a 12-month emissions bar chart (ink bars, moss only on the selected month);
Report renders as true spreads at page width; max content 1120 centered. No
desktop spectacle — the provenance thread is the signature at every size.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Document rows enter with 24ms stagger, opacity
+ 4px rise. Coverage cells fill with an 80ms crossfade as extractions land.
Status changes (extracting -> accepted) crossfade 150ms — no spinners inline;
extracting rows show a 2px indeterminate hairline pulse. Chips crossfade 150ms.
Targets ≥44px, ≥8px apart; destructive actions (reject document, unlock
period) are hold-to-confirm (600ms radial fill). Pull-to-refresh re-checks
extraction jobs.

## Reduced motion & fallback
Provenance thread → the sheet appears instantly, thread drawn complete, no
retraction animation. Coverage fills and crossfades → instant swaps. Stagger →
≤100ms opacity fade. The hairline pulse → a static `EXTRACTING` label. Every
state carried by motion (accepted, needs review, grounded) is also plain text
in the row — nothing is motion-only.
