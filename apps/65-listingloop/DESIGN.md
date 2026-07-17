# ListingLoop Design — "The Closing File"

Art direction anchored in the product's world: the title company's
closing file — manila folder stock, typewritten labels, one keybox-
maroon accent like the stamp on a recorded deed. Calm, procedural,
exact: the timeline is the hero, dates are typeset like instrument
numbers, and nothing decorates. This is escrow-grade software.

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

## Palette

| Token | Hex | Use |
|---|---|---|
| `manila` | `#F5F1E6` | App ground (folder stock) |
| `sheet` | `#FCFAF3` | Cards, panels |
| `line` | `#E2DCC9` | Hairlines, timeline rules |
| `ink` | `#26231C` | Primary text; primary button fill |
| `dim` | `#6F6A5B` | Secondary text |
| `faint` | `#A49E8B` | Tertiary, disabled |
| `keybox` | `#8C3B4A` | THE accent: the today marker, at-risk dates, active states (≤10%) |
| `cedar` | `#5E7F5A` | Semantic: met / clear-to-close only |
| `amberline` | `#A97E2F` | Semantic: waiting / needs-doc only |

Hard rules: `keybox` never fills a button or a surface — it is the
today marker, at-risk dates, and focus. `ink` is the only
high-emphasis fill (manila text on it). Missed dates are `keybox`
text with the word MISSED — no alarm banners; the file states facts.
Light-only: closing files live on desks.

## Type — exact specimen

Faces: **Source Serif 4** (600 — deed-stamp authority) for display ·
**Public Sans** (400/500) for UI/body · **IBM Plex Mono** (500) for
every date, price, and file number. All self-hosted woff2, preloaded.

| Role | Face/weight | Mobile size/lh | Notes |
|---|---|---|---|
| Display | Source Serif 4 600 | 30/36 | -0.005em |
| H2 | Source Serif 4 600 | 22/28 | |
| Title (row) | Public Sans 500 | 16/22 | |
| Body | Public Sans 400 | 16/24 | |
| Secondary | Public Sans 400 | 13/18 | `dim` |
| Placard (status) | Public Sans 500 | 11/14 | +0.08em, uppercase |
| Mono (dates/prices) | Plex Mono 500 | 13–15 | tabular-nums |

## Space, radii, hairlines

4px scale. Radii: 8 (cards/inputs), 6 (chips), 2 (timeline nodes) —
three. 1px `line` hairlines; the timeline is a single ruled line with
node ticks, not a boxed gantt. Touch targets ≥ 44px.

## Signature detail — the deal line

Each deal renders as one horizontal ruled line: date nodes as small
squares (met = filled `cedar`, upcoming = outlined ink, at-risk
within 3 days = `keybox`), the today marker as a thin `keybox`
vertical, labels beneath in mono. The pipeline stacks deal lines into
a wall of timelines. Anchor-edit previews ghost the moving nodes at
40% with connector arrows — the diff drawn, not just listed. The
landing device animates this exact element.

## Motion

One signature: **the unfurl** — on deal open, nodes place left to
right (40ms stagger, 160ms settle each); recompute previews ghost-
slide nodes to their new positions (180ms ease-out-quart) before
apply. Everything else 120–160ms opacity/transform. Reduced motion:
final states, diffs as listed rows.

## Screens (MVP)

1. **Pipeline (`/deals`)** — stacked deal lines with address + status
   placard; sort by next critical date; the at-risk-this-week rail.
2. **Deal file (`/deals/[id]`)** — the timeline full-width on top;
   below: checklist (tasks with owners and doc placeholders), parties
   rail, commission lines, activity log. One screen, the whole file.
3. **Anchor edit sheet** — date inputs; the diff preview renders
   ghosted nodes + the reason sentences ("Appraisal moved May 2 → May
   6 — 2 holidays observed"); Apply / cancel.
4. **Templates (`/templates`)** — task editor with date-rule builder
   (anchor, offset, business days, holiday observance) written as a
   sentence the TC can read back.
5. **Party portal (`/p/[token]`)** — done / next / needed-from-you
   with inline upload; the deal line in read-only miniature. No
   login, plain language.
6. **Commissions (`/commissions`)** — per-month expected totals as
   plain rows; per-deal line math.
7. **Landing** — manila world, the unfurl device (see README), the
   recompute-diff receipt, pricing, honest FAQ (not an e-sign tool;
   plays beside Dotloop/SkySlope). CTA verbatim: "Start free — 14
   days".

## Empty / loading / error

Empty states name the next action ("Open your first file — pick the
buyer-side template"). Loading = skeleton lines. Date-engine errors
never guess: an unresolvable rule renders "needs a date" in
amberline with the rule sentence, waiting for the TC.
