# ParseFlow — Design Specification (v3, redline level)

## Vision
ParseFlow turns a messy PDF into clean, confidence-scored JSON — documented
like Stripe, priced per page. The docs *are* the product, so typography and
code presentation get fashion-brand attention: a hard paper/carbon split,
syntax color used like reagent dye — sparingly, meaningfully.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

Two grounds, one seam. The document/input side is paper; the code/output
side is carbon. The seam between them is a hard 1px rule, `#31353C`.

| Token | Hex | Use |
|---|---|---|
| `paper` | `#FAFAF8` | Light ground: document input, docs prose, marketing left |
| `paper-hairline` | `#E7E4DC` | 1px dividers on paper |
| `ink` | `#17181C` | Text on paper; **primary button fill on paper** |
| `ink-2` | `#6B6E76` | Secondary text on paper |
| `carbon` | `#0C0D10` | Dark ground: JSON output, code wells, dashboard |
| `carbon-hairline` | `#1F2228` | 1px dividers on carbon |
| `text` | `#E8EAED` | Text on carbon |
| `text-2` | `#8B919B` | Secondary text on carbon |
| `paper-btn` | `#F2F3F0` | **Primary buttons on carbon** (ink text) |
| `green` | `#10B981` | THE accent. ≤10%: brand mark, provenance boxes, confidence-high underlines, active states, links |
| `amber` | `#C98A2E` | Semantic: confidence 0.70–0.89 only |
| `gray-conf` | `#9CA3AF` | Semantic: confidence <0.70 — the honest unknown |

Syntax dye, scoped to code/JSON blocks only, never UI: keys `#7DD3FC`,
strings `#FDE68A`, numbers `#F0ABFC`. Hard rules: green never fills a button
or a surface; ink-filled primaries on paper, `paper-btn` primaries on carbon;
syntax colors never leak outside a code well.

## Type — exact specimen

Faces: **Instrument Sans** (500/600) for display and UI · **JetBrains Mono**
(400/500) for all code, JSON, and readings — the JSON is the brand's face.
Both Google-Fonts-loadable, self-hosted/embedded (docs preload woff2).

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (marketing) | IS 600 | `clamp(30px, 8.5vw, 52px)` / 1.1 | −0.02em |
| H2 (docs section) | IS 600 | 22 / 1.25 | −0.01em |
| Title (row/panel) | IS 600 | 16 / 1.3 | 0 |
| Body (docs prose) | IS 400 | 16 / 1.6 | 0 |
| Secondary | IS 400 | 13 / 1.45 | 0 |
| Label | IS 600 | 11 / 1.2 | +0.08em, uppercase |
| Code / JSON | JBM 400 | 14 / 1.7 | 0, tabular figures, 8%-opacity indent guides |
| Reading (parse time, usage) | JBM 500 | 13 / 1.2 | 0, tabular figures |
| Hero curl | JBM 500 | `clamp(15px, 4vw, 20px)` / 1.7 | 0 |
| Button | IS 600 | 15 / 1 | 0 |

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**;
  docs measure ~65ch.
- Radii: **8** (controls: buttons, inputs, chips) · **10** (code wells, JSON
  wells) · **16** (sheets, the drop target). Nothing else.
- Elevation: none. The split, the seam rule, and hairlines do all the depth
  work. Code wells on paper recess via `#F1F0EB` fill, not shadow.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `braces` (brand: `{ }` + folded corner), `file-text`,
`upload`, `scan`, `copy`, `check`, `key`, `bolt` (webhook), `book` (docs),
`play` (run), `terminal`, `shield` (retention), `clock`, `chevron-down`,
`chevron-left`, `menu`, `x`, `gauge` (usage). Nav renders at 20px, inline in
prose at 16px. **No emoji, anywhere, ever** — status in the webhook log is a
Label chip (`DELIVERED`, `RETRY 2`), not a colored dot emoji.

## Component construction (exact)

- **Primary button (paper side):** ink fill, `paper` text, radius 8,
  height 48, IS 600 15. Press: scale 0.98 + fill `#26272D`. Disabled:
  `#DDDBD3` fill, `ink-2` text.
- **Primary on carbon:** `paper-btn` fill, ink text — same geometry.
- **Secondary:** transparent, 1px hairline (side-appropriate), local text
  color. Press: border one step brighter.
- **Quiet action:** text-only green; press dims to 80%.
- **Input:** local ground fill, hairline border, radius 8, height 48, 16px.
  Focus: border green + 2px offset ring at 25% green.
- **Schema chips:** height 36, radius 8, hairline; `invoice · receipt ·
  bank_statement · id_card · resume · custom` in JBM 13. Active = green 1px
  border + green text. Row scrolls horizontally, no scrollbar.
- **Code well:** radius 10, JBM 14/1.7, padding 16, copy button top-right
  (28px hit area inside a 44px target); on paper the well is `#F1F0EB` with
  ink code; on carbon it is `#101216` with syntax dye.
- **JSON field rows:** inside the output well, each extracted field carries
  a **3px confidence underline** under its value: green ≥0.90, amber
  0.70–0.89, `gray-conf` below. Underline, never background fill.
- **Drop target (playground):** dashed 1px hairline, radius 16, `upload`
  glyph 24px in `ink-2`, "Drop a PDF or image · 10 pages max" Secondary.
- **API-key row:** hairline row, JBM `pf_live_••••••••3F9A`, reveal button;
  revealed keys re-redact after 20s (a 1.5px green countdown ring on the
  copy button).
- **Usage meter (dashboard):** a vertical 4px track, 120px tall, hairline
  with `text-2` fill; tier marks etched as 8px hairline ticks at 15k/100k;
  JBM reading beside it: `9,412 / 15,000 PAGES`.

## The signature — provenance & confidence
Honesty rendered as design, exactly: tap (or hover) a JSON field and its
source region on the document highlights with a 1.5px green box that draws
its stroke in 150ms `ease-out-quart` (fill green at 8%); the field's row
simultaneously gets a green left rule (2px). The reverse works — tap a
document region, the JSON scrolls to and marks its field. Confidence
underlines (3px, colors above) are always present, and fields below 0.70
render their value in `gray-conf` with a `LOW CONFIDENCE — REVIEW` Label.
Cheap SVG overlay, fully touch-native. This interaction *is* the wow.

## Mobile layout (390×844 — primary spec)
Developers integrate on a laptop but *evaluate* on a phone.

- **The split becomes a stack:** paper input on top, carbon output below,
  the 1px seam between. Wide JSON scrolls in its own `overflow-x:auto` well;
  the page never scrolls sideways.
- **Marketing hero:** the curl command as hero copy in a carbon well —
  `curl -X POST https://api.parseflow.dev/v1/parse -F "file=@invoice.pdf"
  -F "schema=invoice"` — with its real response beneath (`"vendor_name":
  {"value": "Acme GmbH", "confidence": 0.98}`); primary **Try the
  playground** in the thumb zone; then the honest-accuracy section showing a
  field we *lose* on (`"total": 1249.00 · 0.61` in gray).
- **Playground (money screen):** drop target up top; schema chips; parse
  runs and the output well fills; reading beneath in JBM: `1.84s · 3 PAGES ·
  $0.03`. Provenance taps work on the stacked layout. "Copy as code" flyout:
  curl / Python / Node.
- **Docs:** top bar + `menu` opening a full-height nav sheet (Quickstart,
  Authentication, Parse, Batch & webhooks, Schemas, Errors). Prose at 65ch,
  every response example carries confidence underlines.
- **Dashboard:** carbon throughout — key rows, usage meter, webhook delivery
  log rows (`inv_8231 · DELIVERED · 204 · 112ms`), spend cap input.

## Responsive
≥768px the seam turns vertical: paper left / carbon right, 50/50 in the
playground, 60/40 in docs (prose/code). ≥1024px docs add a left nav rail;
max width 1440 with the seam always full-height. **Optional desktop-only
enhancement (marketing hero):** "the dissolve" — three field values lift off
the scanned invoice, arc across the seam, and dock into the JSON tree, the
smudged total landing at `0.61` gray. Canvas, lazy behind a static
before/after poster, pointer-only, never in the mobile or app bundle.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Playground parse: a 1px green scan-beam
passes down the document preview (500ms, once) as JSON lines assemble
top-to-bottom (40ms stagger, ≤10 lines then instant). Copy: glyph swaps to
`check` in green for 1.2s. Key reveal: characters resolve left → right over
300ms. Presses: `dur-micro`, scale 0.97, no glow — lab restraint. Targets
≥44px; provenance is tap-first (no hover dependency); swipe between sample
docs (invoice / receipt / statement) with chips as the equivalent.

## Reduced motion & fallback
Scan-beam and line assembly → the JSON fades in complete (100ms); provenance
boxes appear instantly without stroke animation (the link itself is
retained — it is function). Key resolve → plain show/hide with the 20s
re-redact kept. Desktop dissolve → its static poster. Errors are full JSON
objects (`{"error": {"code": "page_limit_exceeded", ...}}`) typeset as
carefully as success.
