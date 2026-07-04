# ClauseCompass — Design Specification (v5, redline level)

## Vision
A reading room, not a robot lawyer. ClauseCompass turns a hostile document
into a legible one, so the design is typographic before it is anything else:
vellum paper, a lawyerly serif for the contract's own words, plain sans for
ours, and one oxblood — the color of redline ink — rationed to where the
document bites. Sober enough that "not legal advice" reads as integrity.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `vellum` | `#FAF7F1` | The ground. Every screen — warm paper, never pure white |
| `sheet` | `#FFFFFF` | Framed objects only: the contract pane, report pages, clause cards |
| `hairline` | `#E9E3D7` | 1px rules & card borders — never darker |
| `ink` | `#241F1B` | Primary text and **primary buttons** (vellum text on them) |
| `text-2` | `#756E64` | Secondary text |
| `text-3` | `#A39B8F` | Faint (timestamps, placeholders, "not analyzed") |
| `oxblood` | `#8E3B34` | THE accent — redline ink. ≤10% of any screen: HIGH flags, strikethroughs, active states, links, the compass mark |
| `amber` | `#BE8A2E` | CAUTION flags only |
| `sage` | `#57755B` | OK / market-standard clauses only |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: `oxblood` never fills a button or a surface; `ink` is the only
high-emphasis fill. Oxblood is deliberately BOTH the brand accent and the
HIGH-severity mark — here the accent *is* redline ink; amber and sage exist
only as severities. One light world, committed: contracts are read on paper,
and the report must print faithfully.

## Type — exact specimen

Faces: **IBM Plex Serif** (400/500/600) for contract quotes and display ·
**IBM Plex Sans** (400/500/600) for UI and our explanations · **IBM Plex
Mono** (500) for clause references, section numbers, and figures. One family,
three voices — the document, the guide, the citation. All self-hosted woff2,
preloaded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (report title, marketing) | Serif 600 | `clamp(30px, 8vw, 46px)` / 1.12 | −0.01em |
| Contract quote | Serif 400 | 16 / 1.6 | 0 |
| H2 (screen title) | Sans 600 | 22 / 1.2 | −0.01em |
| Title (clause name) | Sans 600 | 16 / 1.3 | 0 |
| Body (our explanations) | Sans 400 | 16 / 1.55 | 0 |
| Secondary | Sans 400 | 13 / 1.45 | 0 |
| Label | Sans 600 | 11 / 1.2 | +0.08em, uppercase |
| Data / citations | Mono 500 | 13 / 1.2 | 0, tabular figures |
| Button | Sans 600 | 15 / 1 | 0 |

The rule that carries the product: **the contract's words are always serif,
inside a quote block; our words are always sans.** A reader always knows what
the document says versus what we say about it. Citations are mono: `§4.2 · P.7`.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **8** (controls: buttons, inputs, severity chips) · **12** (clause
  cards, quote blocks) · **18** (sheets). Nothing else.
- Elevation: none. The report page alone carries 0 2px 10px rgba(36,31,27,0.05)
  — a document on a desk. Everything else is hairlines on vellum.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `compass` (brand/overview), `upload-doc`, `clause-brackets`
(clauses), `flag-small` (flags), `strike-pen` (redlines), `quote-marks`,
`check`, `alert-triangle` (HIGH), `search-missing` (missing clause),
`download`, `mail-draft`, `chevron-right`, `plus`, `gavel-out` ("hire a
lawyer" pointer). Nav 22px, inline 18px. **No emoji, anywhere, ever** —
severity is a chip and a word, never a siren.

## Component construction (exact)

- **Primary button:** `ink` fill, `vellum` text, radius 8, height 48 mobile
  (full-width in thumb zone). Press: scale 0.98 + fill `#2F2925`. Disabled:
  `#DDD6C9` fill, `text-3` text.
- **Secondary:** transparent, 1px hairline, `ink`. Press: border `#D4CCBD`.
- **Quiet action:** text-only `oxblood`, no underline; press dims to 80%.
- **Input:** `sheet` fill, hairline border, radius 8, height 48, 16px text.
  Focus: border `oxblood` + 2px offset ring at 25% oxblood.
- **Severity chip:** height 28, radius 8: 6px dot + Label — sage "OK",
  amber "CAUTION", oxblood "HIGH". Never a filled banner.
- **Clause row (the map):** NO boxes. Hairline rows ≥56px: mono ref left
  (`§4.2`), Title clause type ("IP Assignment"), severity chip right,
  one-line Secondary summary in `text-3`.
- **Quote block:** `sheet`, radius 12, padding 16, 2px `ink` left rule;
  contract text in Serif 16/1.6; mono citation footer (`§4.2 · P.7`).
  Flagged spans inside get a 1.5px oxblood underline (not highlight fill).
- **Explanation block:** plain Body sans on vellum below the quote — Label
  "WHAT IT SAYS" / "WHAT IT MEANS FOR YOU" / "MARKET" sections, hairline-
  separated. Never boxed; the quote is the framed object, our words breathe.
- **Redline card:** `sheet`, radius 12: original phrase in Serif with a
  1.5px oxblood strikethrough, suggested text beneath in Sans 500 on a
  `#F4EFE6` inset (radius 8), "Copy" and "Add to email" quiet actions.
- **Coverage strip:** mono `31 SECTIONS · 28 ANALYZED · 2 BOILERPLATE ·
  1 NOT ANALYZED` — `text-2`, with "not analyzed" in `text-3` linking to
  the honesty note. Always visible on the report.
- **The banner (non-negotiable):** every report page and screen footer:
  Label(11) `NOT LEGAL ADVICE — CLAUSECOMPASS IS A READING TOOL, NOT A LAW
  FIRM.` in `text-2` over a hairline. Never mumbled, never dismissible.
- **Bottom tab bar:** height 56 + safe-area, `vellum` at 96% + blur,
  hairline top. Four items (Contracts / Flags / Redlines / Playbook) at
  22px icons + 10px Sans 600 labels; active = `ink` + 2px oxblood dot.

## The signature — the redline draw
When a flag's suggested redline is revealed: the oxblood strikethrough draws
across the original phrase left→right in 320ms `ease-out-quart` (1.5px, a
0.5px vertical waver like a pen), and the suggested language rises in beneath
(opacity + 8px, 240ms, 60ms after the strike begins). One draw at a time, on
scroll-into-view or tap, once per clause per session. The strike is the
brand: the moment the document stops winning. No glows, no typewriter
effects. Everything else is state feedback ≤240ms.

## Mobile layout (390×844 — primary spec)
- **Upload (first run):** gutter 20. Compass mark + one Serif Display line:
  "Know what you're signing." Drop zone (`sheet`, radius 12, dashed
  hairline) full-width; "or paste text" quiet action; the banner in the
  footer. Primary button **Review this contract** in the thumb zone after
  file select; price stated on the button for per-contract buyers
  ("Review for $19").
- **Processing:** the pipeline as honest steps ("Reading 14 pages…",
  "Mapping 31 sections…", "Scoring against your playbook…") with mono
  counts — real progress from the worker, not a fake bar.
- **Report (the money screen):** header: contract title + counterparty +
  coverage strip. Flag summary: mono `2 HIGH · 5 CAUTION · 19 OK` with
  chips. Then the clause map as hairline rows, HIGH first. Tapping a row
  expands: quote block → explanation sections → redline card with the
  signature draw. Thumb zone: **Export report** primary + "Draft the email"
  quiet action.
- **Draft email:** assembled asks from accepted redlines, editable, polite
  by construction; copy button. Label reminds: "You're sending this — read
  it."

## Responsive
≥768px: two panes — contract text left (serif, continuous, flagged spans
underlined), clause map right; tapping either side scrolls the other
(anchored spans make this exact). Gutters 32. ≥1024px: three columns —
map / document / detail; max content width 1240. Print/PDF of the report is
a first-class layout: banner on every page, page numbers mono.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Clause rows enter with 24ms stagger, opacity
+ 4px y-rise. Row expand is a 240ms height ease (`ease-in-out-soft`) —
documents unfold, they don't bounce. Severity chips crossfade 150ms.
Processing steps tick with a 120ms check draw. Targets ≥44px, ≥8px apart;
"Delete contract" is hold-to-confirm (600ms radial fill) and re-states the
retention promise. No gestures without button equivalents.

## Reduced motion & fallback
Redline draw → strikethrough and suggestion appear instantly with a 100ms
fade. Row expansion → instant. Processing steps → text states only. Stagger
→ ≤100ms fade. Severity, flags, and redlines are always fully expressed in
text and chips — the printed report, which never moves, is the proof that
nothing here depends on motion.
