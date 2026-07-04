# BidBoard — Design Specification (v5, redline level)

## Vision
A drafting room at 9pm, lights on, numbers becoming comparable. BidBoard is
dark slate grounds, structural typography, mono money, and one I-beam steel
blue rationed to the moments that matter: the low number, the live link, the
award. The signature is the grid itself snapping into alignment — leveling
made visible.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `slate` | `#14181D` | The ground. Every GC screen |
| `panel` | `#1B2129` | Leveling grid frame, bid cards, sheets only |
| `hairline` | `#262E38` | 1px dividers, grid rules, card borders — never brighter |
| `text` | `#E9EDF2` | Primary text |
| `text-2` | `#93A0AD` | Secondary text |
| `text-3` | `#5C6873` | Faint (timestamps, empty cells, placeholders) |
| `paper` | `#F2F4F6` | **Primary buttons** (slate text), key numerals |
| `steel` | `#46698C` | THE accent. ≤10% of any screen: per-line low highlight, links, active states, focus rings, the level snap |
| `amber` | `#D19A3D` | Pending / no-response / needs-mapping only |
| `green` | `#3F9B6E` | Submitted / awarded only |
| `red` | `#C25B4E` | Declined / scope gap / overdue only |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: `paper` is the only high-emphasis fill; `steel` never fills a
button or a surface; semantic colors carry bid status only. The **sub portal**
runs the inverted day theme — ground `#F4F5F6`, ink `#1B2129`, hairline
`#DFE3E8`, primary buttons ink-filled — because subs read it outdoors on
phones; same tokens, flipped, both themes get equal care.

## Type — exact specimen

Faces: **Archivo** (400/500/600) for display and UI · **JetBrains Mono**
(500) for every amount, quantity, date, and CSI code. Both self-hosted woff2,
preloaded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (marketing hero) | AR 600 | `clamp(32px, 8.5vw, 56px)` / 1.08 | −0.015em |
| Hero stat (apparent low) | JBM 500 | `clamp(32px, 9vw, 48px)` / 1.05 | −0.01em, tabular |
| H2 (screen title) | AR 600 | 22 / 1.2 | −0.01em |
| Title (package/sub row) | AR 600 | 16 / 1.3 | 0 |
| Body | AR 400 | 16 / 1.55 | 0 |
| Secondary | AR 400 | 13 / 1.45 | 0 |
| Label | AR 600 | 11 / 1.2 | +0.08em, uppercase |
| Data / money / cells | JBM 500 | 13 / 1.2 | 0, tabular figures |
| Button | AR 600 | 15 / 1 | 0 |

All money is mono tabular, always. Plug values render in `text-3` italic mono
with a superscript `p` — a plug must never impersonate a real bid.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **8** (controls: buttons, inputs, chips) · **12** (bid cards, grid
  frame) · **20** (sheets). Nothing else.
- Elevation: none. Depth is `panel` on `slate` plus hairlines; only the sheet
  scrim shadows.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `columns` (leveling), `hard-hat` (subs), `blueprint`
(projects/plans), `gear` (settings), `send` (invite), `bell-ring` (reminder),
`arrow-down-narrow` (low bid), `scale` (level), `question` (Q&A), `trophy-flat`
(award — a flat pennant, not a cup), `download`, `link`, `check`, `x-small`,
`chevron-right`, `plus`. Nav renders at 22px, inline at 18px. **No emoji,
anywhere, ever** — an award gets `trophy-flat`, not a party popper.

## Component construction (exact)

- **Primary button:** `paper` fill, `slate` text, radius 8, height 48 mobile
  (full-width in thumb zone), AR 600 15. Press: scale 0.98 + fill `#DFE4E9`.
  Disabled: `#232B34` fill, `text-3` text. Portal (light): ink `#1B2129` fill,
  paper text.
- **Secondary:** transparent, 1px hairline, `text`. Press: border `#313B47`.
- **Quiet action:** text-only, `steel`, no underline; press dims to 80%.
- **Input:** `slate` fill, hairline border, radius 8, height 48, 16px text.
  Focus: border `steel` + 2px offset ring at 25% steel.
- **Status board rows (per sub):** NO boxes. Full-bleed rows ≥56px, hairline
  between: Title(16) sub name, trade Label under it, status pill right,
  Secondary "invited Mar 4 · opened Mar 5" in `text-3`.
- **Status pill:** height 28, 6px dot + Label(11): `amber` "NO RESPONSE" /
  "NEEDS MAPPING", `green` "SUBMITTED" / "AWARDED", `red` "DECLINED",
  `text-2` "OPENED".
- **Leveling grid:** `panel` frame, radius 12, inside its own
  `overflow-x:auto` track. Row headers (form lines) sticky left, sub columns
  ≥120px, cells JBM 13 right-aligned, 1px hairline grid. Per-row low: cell
  amount in `steel` + 2px `steel` left border on the cell. Missing cell:
  `text-3` em-dash; plug: italic + superscript p. Column footer: adjusted
  total in `paper` at 15, apparent-low column footer gets the steel underline.
- **Inclusion/exclusion matrix:** beneath the grid, same column alignment:
  rows = scope items, filled `text` dot = included, `red` ring = excluded,
  `text-3` dot = unstated. A row with mixed states is the scope-gap signal —
  it also gets a `red` 2px left border.
- **Bid form (portal):** one line per row: description left, amount input
  right (mono, numeric keypad), "Can't price this?" quiet action opening
  excluded / included-elsewhere options. Lump-sum fallback is a visible
  choice, not a failure state.
- **Q&A thread:** hairline rows, question in Body, answer indented 16 with a
  2px `steel` left border, "answered to all bidders" Label beneath.
- **Bottom tab bar (GC, mobile):** height 56 + safe-area, `panel` 94% + blur,
  hairline top: blueprint / columns / hard-hat / gear at 22px + 10px labels;
  active = `text` + 2px steel dot; inactive = `text-3`.

## The signature — the level snap
When a new bid lands on the leveling grid (or the estimator maps an unmapped
row), the affected column's cells slide into row alignment: each cell
translates from 8px offset to 0 with 24ms stagger top-to-bottom (≤8 rows
animate; the rest appear), 240ms `ease-out-quart`. On settle, every row whose
low changed gets a 2px `steel` underline sweep left→right across that cell
(200ms), and the column's adjusted total counts up in ≤400ms. One snap per
bid, batched; rate-limited to one per 3s. This is the entire brand animation —
the moment chaos becomes comparable. Everything else is state feedback ≤240ms.

## Mobile layout (390×844 — primary spec)
- **Projects (home):** gutter 20. Label "BIDDING" + project rows: Title name,
  mono due date ("DUE MAR 21 · 6 DAYS"), coverage line "14 of 22 bids in"
  with a 4px hairline track filled `steel`. Primary button **New project**
  in thumb zone.
- **Package status board:** package header (trade Label, due countdown in
  mono), then sub rows as above. Sticky actions: **Send reminder** (secondary)
  + **Level bids** (primary) above the safe-area.
- **Leveling (mobile):** the grid scrolls horizontally in its track; row
  headers sticky; a Label strip above shows which column is apparent low
  ("LOW: MERIDIAN ELECTRIC · $184,200"). Tapping a cell opens a sheet with
  the raw sub entry, mapping controls, and plug entry — mapping is
  sheet-based on phones, drag-based on desktop.
- **Sub portal (light theme):** GC logo + project header, scope notes, plans
  list (filename + mono size + download), the bid form, inclusion/exclusion
  chips, then full-width **Submit bid** in the thumb zone. Above it, mono
  running total updates as amounts are typed. No nav — the portal is one
  page and a confirmation.
- **First run (GC):** import subs (CSV drop or paste), create first project,
  send first three invites — one card per step, replaced by real data as
  each completes.

## Responsive
≥768px: projects become a two-column board; leveling grid gains room (6-8
sub columns visible); matrix and grid share sticky headers; gutters 32.
≥1024px: left rail replaces the tab bar; leveling gets a right rail with the
needs-mapping tray (drag rows onto form lines); max content width 1280 for
the grid screens, 1120 elsewhere. No desktop spectacle — the snap is the
signature at every size.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Status rows enter with 24ms stagger, opacity
+ 4px x-slide only. Status pill changes crossfade 150ms. Reminder send: the
`bell-ring` glyph tips 8° and back once, 200ms — no continuous ringing.
Award: the winning column's footer underline thickens 2px→3px and holds; no
confetti, ever. Chips crossfade 150ms; sheets 320ms `spring-gentle`. Targets
≥44px, ≥8px apart; destructive actions (delete package, revoke link)
hold-to-confirm 600ms. Portal is equally restrained: the running total
updates instantly, no animation while a sub is typing money.

## Reduced motion & fallback
Level snap → cells appear in place; low-cell underline → static 2px border.
Count-ups → direct number swap. Stagger → ≤100ms opacity fade. Every animated
signal (low bid, scope gap, awarded) is also plain text/border in the cell —
nothing is motion-only.
