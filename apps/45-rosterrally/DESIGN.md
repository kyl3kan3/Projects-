# RosterRally — Design Specification (v5, redline level)

## Vision
A community field house at night, not a sports-media brand. RosterRally is run
by a volunteer at a kitchen table after the kids are asleep, so it reads calm
under floodlights: deep pitch-dark ground, scoreboard-plain type, one rationed
turf green where the season is healthy, and a conflict pennant you can trust.
The excitement belongs to the games; the software's job is quiet certainty.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `pitch` | `#121711` | The ground. Every registrar-console screen |
| `clubhouse` | `#1A2117` | Panels: receipt grids, schedule day groups, roster sheets only |
| `hairline` | `#283024` | 1px dividers & panel borders — never brighter |
| `text` | `#EDF2E9` | Primary text |
| `text-2` | `#92A08B` | Secondary text |
| `text-3` | `#5D6957` | Faint (timestamps, placeholders) |
| `chalk` | `#F3F6EF` | **Primary buttons** (pitch text on them), hero numerals |
| `turf` | `#4A8A3C` | THE accent. ≤10% of any screen: paid states, active tab dot, links, the pennant-clear sweep |
| `amber` | `#D9A13B` | Soft conflicts, waitlists, pending payments only |
| `red` | `#C2513F` | Hard conflicts, failed payments, no-shows only |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: `turf` never fills a button or a surface; `chalk` is the only
high-emphasis fill; amber/red mean conflict or money trouble only. Parent
link-pages (registration, schedule, volunteer claim) run a DAYLIGHT inversion
of the same palette — ground `#F5F7F2`, ink `#1A2117`, same turf/amber/red —
because parents open these outdoors at 2pm; the console stays dark for the
kitchen-table night shift. Both themes ship complete.

## Type — exact specimen

Faces: **Archivo** (400/500/600/700, including SemiExpanded 700 for display)
for everything UI · **IBM Plex Mono** (500/600) for every time, score-style
count, fee, and jersey number. Both self-hosted woff2, preloaded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (season hero, marketing) | Archivo SemiExp 700 | `clamp(30px, 8vw, 50px)` / 1.08 | −0.01em |
| Hero stat (registered count) | IPM 600 | `clamp(36px, 10vw, 56px)` / 1.0 | −0.01em, tabular |
| H2 (screen title) | Archivo 700 | 22 / 1.2 | −0.01em |
| Title (row) | Archivo 600 | 16 / 1.3 | 0 |
| Body | Archivo 400 | 16 / 1.55 | 0 |
| Secondary | Archivo 400 | 13 / 1.45 | 0 |
| Label | Archivo 600 | 11 / 1.2 | +0.08em, uppercase |
| Data (times, fees, counts) | IPM 500 | 13 / 1.2 | 0, tabular figures |
| Button | Archivo 600 | 15 / 1 | 0 |

Times are always mono 24h-optional (`SAT 9:00A`), fees mono (`$185.00`),
counts mono (`142 / 160`). Division labels are Label style: `U10 BOYS`.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **8** (controls: buttons, inputs, chips) · **12** (panels: receipt
  grid, roster sheet, day groups) · **20** (sheets). Nothing else.
- Elevation: none. Depth is `clubhouse` on `pitch` plus hairlines; only sheet
  scrims shadow. Daylight pages: white panels, same hairline logic.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `whistle` (season), `roster-rows` (rosters), `calendar-grid`
(schedule), `megaphone` (comms), `hand-raise` (volunteers), `pennant`
(conflict), `check`, `card` (payments), `clock`, `map-pin` (venue), `send`,
`eye` (read), `chevron-right`, `plus`, `download`. Nav renders at 22px,
inline at 18px. **No emoji, anywhere, ever** — a win state gets `check`,
never a trophy emoji; announcements are typeset, not decorated.

## Component construction (exact)

- **Primary button:** `chalk` fill, `pitch` text, radius 8, height 48 mobile
  (full-width in thumb zone). Press: scale 0.98 + fill `#E2E7DC`. Disabled:
  `#2A3226` fill, `text-3` text. Daylight pages: `#1A211F`-ink fill, chalk text.
- **Secondary:** transparent, 1px hairline, `text`. Press: border `#33402D`.
- **Quiet action:** text-only `turf`, no underline; press dims to 80%.
- **Input:** `pitch` fill, hairline border, radius 8, height 48, 16px text.
  Focus: border `turf` + 2px offset ring at 25% turf.
- **Registration progress:** Label "REGISTERED" over mono `142 / 160`, with a
  4px hairline track beneath, `turf` fill proportional; waitlist overflow
  renders as an amber tail segment with mono `+9 WAITLIST`.
- **Schedule rows:** NO boxes. Day groups get a Label date header; games are
  hairline rows ≥56px: mono time left (`9:00A`), Title matchup ("Thunder v
  Rapids · U10B"), Secondary venue ("Miller Park · Field 2") in `text-3`.
  Conflict rows carry the pennant glyph left — amber (soft) or red (hard).
- **Conflict pennant chip:** height 28, radius 8, hairline; `pennant` 14px +
  Label ("FIELD OVERLAP"); tap opens the two clashing rows side-stacked.
- **Receipt grid (comms detail):** `clubhouse` panel, radius 12: household
  rows with channel glyph + status Label — turf "OPENED 6:42P", `text-2`
  "DELIVERED", red "BOUNCED"; "Re-send to 12 unreached" as quiet action.
- **Roster sheet:** `clubhouse` panel, radius 12; player rows with mono
  jersey number cell (36px, hairline right), name Title, drag handle ≥44px.
  Drop target = 2px turf insertion hairline.
- **Volunteer slot row:** hairline row: role Title, mono capacity (`2 / 3`),
  claim state — turf check + household name when claimed.
- **Bottom tab bar:** height 56 + safe-area, `clubhouse` at 94% + blur,
  hairline top. Five items (Season / Rosters / Schedule / Comms / Volunteers)
  at 22px icons + 10px Archivo 600 labels; active = `text` + 2px turf dot.

## The signature — the pennant clear
Conflicts are the product's enemy moment, so resolving one is the brand
animation. When the checker passes after an edit: the red/amber pennant on the
affected row tips forward 12° and lowers (240ms `ease-in-out-soft`), a 1.5px
`turf` underline sweeps the row left→right in 240ms `ease-out-quart`, and the
schedule's conflict counter decrements with a direct swap. On full publish
with zero conflicts, the publish button's border sweeps turf once (400ms) —
the all-clear whistle, silent. No confetti, no bouncing balls. Everything
else is state feedback ≤240ms.

## Mobile layout (390×844 — primary spec)
- **Season (home, console):** gutter 20. Top: club mark + season chip
  ("FALL 2026"). Hero: registration progress block (mono `142 / 160`,
  track, waitlist tail). Beneath: Label "TODAY" with next games as hairline
  rows, then "NEEDS ATTENTION" — "2 hard conflicts · U12 schedule",
  "9 unpaid installments". Primary button contextual: **Resolve conflicts**
  when any exist, else **Send announcement**.
- **Schedule builder:** week strip (mono dates) → day list; add-game sheet
  with venue/field/time pickers; the conflict gate banner sits above publish:
  red "2 HARD · PUBLISH BLOCKED" or turf "ALL CLEAR". Pennant rows jump to
  their clash pair.
- **Comms compose:** audience chips (CLUB / U10 BOYS / THUNDER), subject,
  body, channel toggle with live recipient count ("94 email · 61 SMS");
  send is hold-to-confirm (600ms radial). Sent view is the receipt grid.
- **Parent registration (daylight, their phone):** one child per screen,
  progress dots, waiver acknowledgment as a real checkbox with the text
  inline (never a link-only), fee summary in mono with our fee shown
  honestly, Stripe sheet in the thumb zone. Under 5 minutes is a design
  requirement, not a hope.

## Responsive
≥768px: schedule becomes a week grid (days × fields), roster builder shows
pool + team side-by-side, gutters 32. ≥1024px: left rail nav; center
schedule grid; right rail is the conflict list, always visible while
building; max content width 1200. The pennant clear stays the signature at
every size; no desktop spectacle.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Rows enter with 24ms stagger, opacity + 4px
y-rise. Drag-and-drop roster moves use `spring-gentle` with a 2px turf
insertion line; drops settle ≤200ms. Receipt statuses crossfade 150ms.
Targets ≥44px, ≥8px apart; destructive actions (refund, unpublish, remove
player) hold-to-confirm (600ms radial fill). Swipe on schedule rows reveals
Edit; the button equivalent always visible in row overflow. Haptics
native-only, never load-bearing.

## Reduced motion & fallback
Pennant clear → pennant swaps to check instantly with a 100ms fade; turf
sweep → static underline. Drag reorder falls back to up/down buttons on
every row (also always present — motor accessibility, not just
reduced-motion). Stagger → ≤100ms fade. Every conflict, payment, and receipt
state is always plain text in its row.
