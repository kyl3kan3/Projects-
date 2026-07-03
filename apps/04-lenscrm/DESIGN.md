# LensCRM — Design Specification (v3, redline level)

## Vision
A gallery after hours. LensCRM makes a solo photographer feel like they run a
prestige studio — charcoal walls, museum lighting, the client's own work as the
hero of every screen. The business machinery (leads, contracts, invoices) is
staged like exhibition placards beside the art: quiet, serifed, inevitable.
Brass is gilding, never paint.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `wall` | `#141414` | The ground. Every admin screen. |
| `panel` | `#1D1D1B` | Sheets, signing panels, grouped placards only |
| `hairline` | `#2A2A27` | 1px dividers & frame borders — never brighter |
| `text` | `#F0EEE9` | Primary text |
| `text-2` | `#9C9890` | Secondary text |
| `text-3` | `#5F5C55` | Faint (timestamps, placeholders) |
| `paper` | `#F5F4F1` | **Primary buttons** (wall text on it); the ground of client-facing pages |
| `brass` | `#C9A227` | THE accent. ≤10% of any screen: active tab, 1px rules, small-caps labels, the aperture glyph, favorite ticks |
| `fern` | `#7BA05B` | Paid / signed / delivered only |
| `clay` | `#C96C55` | Overdue / declined only |

Hard rules: brass never fills a button or a surface — it is 1px rules, glyphs,
and small text only; `paper` is the only high-emphasis fill on dark. Client
pages (galleries, booking, contracts) run on `paper` ground with `#1B1B19`
text; primary buttons there are **ink** (`#1B1B19`) fill with paper text.

## Type — exact specimen

Faces: **Fraunces** (500/600, opsz auto) for display · **Inter** (400/500/600)
for UI · **IBM Plex Mono** (500) for data. All self-hosted woff2, preloaded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (hero, gallery title) | Fraunces 600 | `clamp(30px, 8vw, 54px)` / 1.1 | −0.01em |
| H2 (screen title) | Fraunces 600 | 24 / 1.15 | −0.005em |
| Title (card/row) | Inter 600 | 16 / 1.3 | 0 |
| Body | Inter 400 | 16 / 1.55 | 0 |
| Secondary | Inter 400 | 13 / 1.45 | 0 |
| Placard label | Inter 600 | 11 / 1.2 | +0.08em, uppercase |
| Data / dates / balances | IPM 500 | 13 / 1.2 | 0, tabular figures |
| Invoice total (stationery display) | Fraunces 500 | 28 / 1.1 | 0, old-style figures |
| Button | Inter 600 | 15 / 1 | 0 |

Line-item math and dates stay mono tabular; only the invoice's headline total
earns Fraunces old-style figures — stationery, not spreadsheet.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **8** (controls: buttons, inputs, chips) · **12** (placard cards) ·
  **16** (sheets). Photographs are square-cornered — art is never rounded.
- Elevation: none. Depth is `panel` vs `wall` and hairlines; only the sheet
  scrim shadows.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `today` (sun-dial), `leads` (funnel), `sessions` (calendar),
`galleries` (frame), `more` (ellipsis), `aperture` (6-blade brand glyph),
`heart` (proofing), `comment`, `pen` (sign), `send`, `download`, `receipt`,
`clock`, `check`, `chevron-left`, `plus`. Nav renders at 22px, inline at 18px.
**No emoji, anywhere, ever** — a booked lead gets the `check` glyph in fern,
not a celebration.

## Component construction (exact)

- **Primary button:** paper fill, `wall` text, radius 8, height 48 mobile
  (full-width in thumb zone), Inter 600 15. Press: scale 0.98 + fill `#E7E5E0`.
  Disabled: `#2E2E2B` fill, `text-3` text.
- **Secondary:** transparent, 1px hairline, `text`. Press: border `#3A3A36`.
- **Quiet action:** text-only, brass, no underline; press dims to 80%.
- **Input (admin):** wall fill, hairline border, radius 8, height 48, 16px
  text. Focus: border brass + 2px offset ring at 25% brass. Client-facing
  contract inputs are hairline-underlined only (guest-book style).
- **Chips (shoot type: Wedding / Newborn / Commercial):** height 36, radius 8,
  hairline; active = brass 1px border + brass text.
- **Lead rows:** NO boxes. Hairline-divided rows ≥56px: Title name, placard
  label stage ("CONSULT"), IPM inquiry date right; swipe advances stage (also
  a stage menu).
- **Session cards:** only for framed objects — the photographer's image bleeds
  edge-to-edge (square corners) with a placard strip below: 1px brass top
  rule, placard label line ("`SAT JUN 21` · RIVERA WEDDING · BALANCE `$1,400`").
  Card body radius 12, padding 16.
- **Task rows:** hairline rows threaded by a 1px brass left rule, 20px checkbox.
- **Status pill:** height 28, 6px dot + placard label: fern "PAID" / "SIGNED",
  brass "AWAITING", clay "OVERDUE".
- **Bottom tab bar:** height 56 + safe-area, `panel` at 94% + blur, hairline
  top. Five items, 22px icons + 10px Inter 600 labels; active = `text` + 2px
  brass dot; inactive = `text-3`.

## The signature — the aperture wipe (kept, refined)
The "e" in the logotype is a 6-blade aperture, and the product's three ritual
moments — delivering a gallery, a contract turning "Executed," opening a
delivered gallery — pass through an SVG iris: six `wall`-colored blades with
1px brass edges close in 180ms `ease-in-out-soft`, hold 40ms, reopen in 180ms
(400ms total). It never plays on routine navigation, only rituals. Pure
SVG/CSS at 60fps on a phone; no WebGL, no parallax. Everything else is state
feedback ≤240ms.

## Mobile layout (390×844 — primary spec)
- **Studio dashboard ("This week on the wall"):** gutter 20. H2 greeting, then
  session cards single column, image-first with placard strips. Below, Label
  "TODAY" and 3–4 brass-threaded task rows ("Send Chen family gallery",
  "Retainer due — Okafor wedding `$800`"). Contextual primary button pinned in
  the thumb zone (**Deliver gallery** / **Send contract** / **Request deposit**).
- **Client gallery (money screen, paper ground):** photographer's logotype
  centered top, edge-to-edge 2-column masonry, tap → full-screen pager with
  heart/comment controls ≥44px bottom. Delivery opens through the iris wipe.
  Must be beautiful enough that clients ask who built it.
- **Deposit-first booking flow:** one sheet (radius 16, grab handle 36×4):
  date row → contract template row → retainer row ("30% · `$450`") → primary
  **Send booking proposal**, with the line "Booking confirms when the deposit
  clears" in Secondary.
- **Contract signing (client, paper ground):** single column, hairline-
  underlined fields, draw/type signature pad ≥120px tall, ink primary **Sign
  contract**; on countersign the placard flips to fern "EXECUTED".
- **Invoice:** stationery — hairline rules, IPM line items, Fraunces old-style
  total, status pill top-right.

## Responsive
≥768px: session cards 2-up, galleries 3-column, gutters 32. ≥1024px: a
persistent left rail (leads pipeline as kanban columns) replaces the tab bar;
galleries become a full-bleed lightbox wall; max content width 1200. The
marketing hero's 2.5D parallax over portfolio work stays desktop-only,
lazy-loaded behind a static poster; on phone the hero is a full-bleed photo
with one iris wipe on entry.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Kanban cards lift on drag (scale 1.03, −1°
tilt) and settle `spring-gentle`; target column brightens 4%. Invoice paid:
the total's underline draws in fern (240ms) and the pill flips one split-flap
tile PROFORMA → PAID — no confetti. Proofing favorite: a brass corner tick
draws in 150ms; the selection count odometer-rolls. Targets ≥44px; hearts,
signature pad, and the primary bar in the thumb zone. Swipe between gallery
photos (‹ › equivalents shown); swipe a lead to advance stage (also a menu).
Native haptics on sign/deliver; web silent.

## Reduced motion & fallback
Iris wipe → 120ms crossfade. Parallax off; hero is a still photograph. Drag
physics → instant placement with a one-frame brass rule flash. Split-flap →
text swap. Signature replay → static rendered signature. Every status (paid,
signed, delivered) is also written text.
