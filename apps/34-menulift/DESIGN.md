# MenuLift — Design Specification (v3, redline level)

## Vision
A well-set table, not a tech demo. The food photo and the dish name are the
heroes; chrome, controls, even the brand recede like a good waiter. Two
surfaces — the owner dashboard (a working tool) and the guest menu (the
soul) — and the guest menu lives in a warm paper-light world because menus
are read at arm's length in dim dining rooms.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icons only, space-before-boxes, hairlines, real content, 4px
scale, fonts must load.

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `paper` | `#F5EFE3` | Guest menu ground (light) — warm, like good menu stock |
| `candlelight` | `#191411` | Guest menu dim variant ground; dashboard dark ground |
| `ink` | `#2B241C` | Primary text on paper; **primary-button fill in the light world** (paper text on it) |
| `ink-2` | `#6E6355` | Secondary text (descriptions, section notes) |
| `ink-3` | `#A2968A` | Faint (timestamps, placeholders, disabled) |
| `hairline` | `#E4DAC8` | 1px dividers on paper — never darker |
| `hairline-dim` | `#33291F` | 1px dividers on candlelight |
| `tomato` | `#C05A3E` | THE accent, rationed: 86-state sweeps, active states, links, the stars-quadrant dot ring. **Prices are never tomato.** |
| `amber` | `#B8863B` | Low-stock warning states only |
| `basil` | `#5F7E4E` | "Back on menu" confirmations only |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: tomato ≤10% of any screen; food photos are the only saturated
surfaces — the chrome stays in ink and paper. The dashboard may run
candlelight full-time (kitchens are dim too); the guest menu ships both,
following the device theme, with the dim ink ramp `#EDE6D8` / `#B4A892` /
`#7C6F5F` (same roles, contrast AA proven).

## Type — exact specimen

Faces: **Fraunces** (display + dish names, 400/500/600, optical size on) ·
**Public Sans** (UI, 400/500/600) · **Spline Sans Mono** (500, tabular) for
every price and count — prices are data: mono, tabular, never bold-sans.
All self-hosted woff2, preloaded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (marketing hero) | Fraunces 600 | `clamp(34px, 9vw, 60px)` / 1.05 | −0.01em |
| Dish name (guest) | Fraunces 500 | 19 / 1.25 | 0 |
| H2 (screen title) | Public Sans 600 | 22 / 1.2 | −0.01em |
| Body | Public Sans 400 | **17 / 1.5** guest · 16 / 1.55 dashboard | 0 |
| Secondary | Public Sans 400 | 13 / 1.45 | 0 |
| Label | Public Sans 600 | 11 / 1.2 | +0.08em, uppercase |
| Data / price | Spline Sans Mono 500 | 15 / 1.2 | 0, tabular figures |
| Button | Public Sans 600 | 15 / 1 | 0 |

Guest-menu body is 17px minimum — dim-room legibility is a feature. Prices
right-align on the mono column so a scanning eye runs down them like a
receipt.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **8** (controls: buttons, inputs, chips) · **12** (panels, the review
  card) · **18** (sheets and **food photos** — the largest radius belongs to
  the hero surface). Nothing else.
- Elevation: none; depth is panel-vs-ground plus hairlines. Sheet scrim only.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `qr`, `camera`, `relight` (the enhance spark — a starburst
over a lens, never called "magic"), `slash-86`, `grid-matrix`, `upload-csv`,
`tag-dietary`, `clock-daypart`, `chevron-right`, `plus`, `eye`, `printer`.
Nav at 22px, inline at 18px. **No emoji, anywhere, ever** — dietary tags are
typeset labels (GF, V, VG, DF in Label type inside a hairline pill).

## Component construction (exact)

- **Primary button (light world):** `ink` fill, `paper` text, radius 8, height
  48 mobile (full-width in thumb zone), Public Sans 600 15. Press: scale 0.98 +
  fill `#3A3128`. On candlelight: `paper` fill, `ink` text. Disabled: hairline
  fill, `ink-3` text.
- **Secondary:** transparent, 1px hairline border, `ink`. Press: border `#CBBFA9`.
- **Quiet action:** text-only, tomato, no underline; press dims to 80%.
- **Input:** ground fill, hairline border, radius 8, height 48, 16px text.
  Focus: border tomato + 2px offset ring at 25% tomato.
- **Chips (daypart / section filter):** height 36, radius 8, hairline; active =
  tomato 1px border + tomato text. Scroll in their own `overflow-x:auto` row.
- **Guest menu item row:** NOT a card. Full-bleed row, 16px vertical padding,
  hairline between rows. Dish name Fraunces 500 19; description 2-line clamp;
  price mono, right-aligned; dietary labels after the name in Label type.
  Photo, when present, 64×64 at radius 18, left. 86'd items stay visible:
  struck through, desaturated, mono note "86'd tonight".
- **86 toggle row (dashboard):** row layout as above plus a 44×44 toggle
  right. Off: hairline ring. On: tomato ring + `slash-86`, name struck (see
  signature), row desaturates to `ink-3`. Un-86: basil check flashes 240ms.
- **Before/after review card — the one true card:** radius 12, hairline
  border, panel fill. The photo pair under a draggable split slider (handle
  44px, tomato hairline divider), Label captions "PHONE SNAP" / "ENHANCED",
  then primary **Approve photo**, secondary **Retake**. Nothing auto-publishes.
- **Matrix quadrant chart:** 2×2 field, hairline axes, mono axis Labels
  "POPULARITY" (y) and "MARGIN" (x). Dots = dishes, 10px, `ink-2` fill; stars-
  quadrant dots get a 1.5px **tomato ring** — the only tomato on the chart.
  Quadrant Labels STARS / PLOWHORSES / PUZZLES / DOGS at the corners. Tap a
  dot: bottom sheet with the item's numbers and its recommendation sentence.
- **Status pills:** height 28, 6px dot + Label(11): `ink` "LIVE", tomato
  "86'D", `ink-3` "DRAFT", amber "ENHANCING".
- **Bottom tab bar (dashboard):** height 56 + safe-area, panel fill at 94% +
  blur, hairline top. Four items — Menu, 86 Board, Photos, Matrix — 22px icons
  + 10px Public Sans 600 labels; active = full text color + 2px tomato dot.

## The signature — the 86 sweep
Flipping a dish to 86'd draws a **1.5px tomato strikethrough across the dish
name, left to right, in 240ms `ease-out-quart`**, while the row desaturates
to `ink-3` over the same 240ms; a mono counter in the 86-board header ticks
up — "3 items 86'd tonight" — with a single-digit roll ≤200ms. Un-86ing
un-draws the line right to left and ticks the counter down. A Secondary note
under the board states the propagation honestly: "live menus update in
seconds" (<10s, measured). Rate-limited to one sweep at a time; batch changes
settle instantly with only the last row animating. This is the entire brand
animation — no confetti, no glow. Everything else is state feedback ≤240ms.

## Mobile layout (390×844 — primary spec)
- **Guest menu:** paper ground, gutter 20. Restaurant name in Fraunces,
  daypart chips ("Dinner" active), sections as Label headers, item rows per
  spec — "Crispy Half Chicken — chili honey, pickled fennel — `$24.00`",
  "Burrata — grilled peach, basil, sourdough — `$16.00` (V)". 86'd row:
  "Grilled Swordfish" struck, "86'd tonight" in mono. No nav, no buttons:
  the menu is the whole screen.
- **Dashboard menu editor:** candlelight ground. H2 "Dinner", sections with
  drag handles (≥44px), item rows with mono price and status pill. Sticky
  **Publish changes** above the safe-area, edit count in mono ("4 edits").
- **86 board (tonight's service view):** counter header ("3 items 86'd
  tonight"), every live item as an 86 toggle row, current 86s pinned —
  "Crispy Half Chicken · 86'd 7:42pm by Dana". One tap restores.
- **Photo review:** queue of before/after cards, newest first; caption "Shot
  6:10pm · enhanced in 41s". Approve is the primary button in the thumb zone.
- **Matrix screen:** the 2×2 chart full-width, then hairline rows grouped by
  quadrant — "DOGS — Shrimp Toast · 9 sold · `$2.10` margin — Cut or
  reinvent". Import date in mono, **New import** quiet action.

## Responsive
The guest menu stays a single column forever — max-width 560, centered, at
every viewport; a menu is a list, not a grid. The dashboard gains columns at
1024: left rail replaces the tab bar, editor center, live phone-width guest
preview right; max width 1200. No desktop spectacle — the 86 sweep is the
signature at every size.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Item rows enter with 24ms stagger, opacity +
4px y-slide only. Chips crossfade 150ms. The review-card slider tracks the
finger 1:1, no easing (a tool, not a toy). Publish: 300ms radial `ink` wipe,
then "Live" in basil for 800ms. Targets ≥44px, ≥8px apart; destructive
actions hold-to-confirm 600ms; pull-to-refresh re-syncs the 86 board.
Haptics on native only, never load-bearing.

## Reduced motion & fallback
The 86 sweep → instant struck state plus the plain-text "86'd" note (already
present for screen readers); counter updates without the roll. Split slider →
side-by-side stills with Labels. Wipes and staggers → ≤100ms opacity fades.
Every animated signal is also plain text in the row; the guest menu functions
identically with JavaScript disabled — it is static HTML first.
