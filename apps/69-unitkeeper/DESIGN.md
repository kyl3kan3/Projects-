# UnitKeeper Design — "The Yard at Dusk"

Art direction anchored in the product's world: a clean storage yard at
closing time — concrete grays, galvanized steel, one roll-door orange
accent. The unit map is the hero: a calm grid of rectangles that reads
like the yard itself from the office window. Statuses are paint, not
pixels — flat fills, stenciled labels, nothing glossy.

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

## Palette

| Token | Hex | Use |
|---|---|---|
| `concrete` | `#EFEEEA` | App ground |
| `slab` | `#F9F8F5` | Cards, panels |
| `line` | `#D8D6CE` | Hairlines, map gridlines |
| `ink` | `#262622` | Primary text; primary button fill |
| `dim` | `#6B6B64` | Secondary text |
| `faint` | `#A1A099` | Tertiary, disabled |
| `rolldoor` | `#C86428` | THE accent: overdue units, active states, focus (≤10%) |
| `galv` | `#7A8791` | Occupied-unit fill (galvanized) |
| `moss` | `#5E8558` | Semantic: paid / resolved only |
| `liencard` | `#8F3F33` | Semantic: lien-stage units and hard-stop text only |

Hard rules: `rolldoor` marks overdue and active —
never buttons or surfaces; `ink` is the only high-emphasis fill
(concrete text on it). Vacant units render as outlined slab; occupied
as `galv` fill with concrete labels; the map's color IS the status
system.

## Type — exact specimen

Faces: **Public Sans** (400/500/700) for display and UI · **IBM Plex
Mono** (500) for unit labels, money, dates, and gate codes. Both
self-hosted woff2, preloaded.

| Role | Face/weight | Mobile size/lh | Notes |
|---|---|---|---|
| Display | Public Sans 700 | 30/36 | -0.01em |
| H2 | Public Sans 700 | 22/28 | |
| Title (row) | Public Sans 500 | 16/22 | |
| Body | Public Sans 400 | 16/24 | |
| Secondary | Public Sans 400 | 13/18 | `dim` |
| Placard (status/stencil) | Public Sans 700 | 11/14 | +0.1em, uppercase |
| Mono (units/money/codes) | Plex Mono 500 | 13–15 | tabular-nums |

## Space, radii, hairlines

4px scale. Radii: 6 (cards/inputs), 3 (map units — near-square, like
doors), 999 (dots) — three. 1px `line` hairlines; the map grid uses
2px gaps, not borders. Touch targets ≥ 44px.

## Signature detail — the timeline rail

The lien case renders as a vertical rail of dated steps: each step a
square node with its statute citation in secondary type beneath, the
completed steps filled ink with dates in mono, the current step
outlined `rolldoor`, and future steps locked with the hard-stop
sentence in `liencard` ("Sale eligible June 28 — not before —
Tex. Prop. Code §59.044"). The disabled action button is part of the
design: restraint rendered. The landing device animates this rail.

## Motion

One signature: **the door flip** — a unit changing status flips its
fill with a 160ms vertical wipe (top to bottom, like a roll door).
The lien rail advances with a 140ms node fill + date stamp. Everything
else 120–160ms opacity/transform. Reduced motion: instant fills.

## Screens (MVP)

1. **The map (`/map`)** — the facility grid from `map_position`;
   status fills; hover/tap shows unit, tenant, balance; filter chips
   (overdue, lien, vacant by size); the occupancy line in the header
   ("142 of 160 — $18,420/mo").
2. **Unit file (`/units/[id]`)** — tenancy, ledger (append-only rows,
   balance running in mono), gate code with issue/revoke, documents,
   the lien rail when open.
3. **Move-in (`/units/[id]/move-in`)** — the ten-minute flow: tenant
   form → lease preview → send-to-phone link state → payment state →
   done. Progress as plain numbered steps.
4. **Tenant link (`/t/[token]`)** — mobile-first: lease reading +
   signature, card/ACH setup, receipts, current balance. Plain
   language.
5. **Delinquency (`/delinquency`)** — the ladder board: tenancies by
   ladder day, next automatic step and date, lien-eligible flags;
   one-tap "open lien case".
6. **Lien case (`/liens/[id]`)** — the timeline rail full-height;
   step actions (generate notice → mark sent with tracking); the
   packet export.
7. **Rates (`/rates`)** — street rates by size; tenant rate changes
   with notice generation and effective dates.
8. **Landing** — concrete world, the map-to-lien-rail device (see
   README), a generated-notice receipt, pricing, honest FAQ (no gate
   hardware integration in v1; notices are documents, we are not your
   lawyer). CTA verbatim: "Start free — 14 days".

## Empty / loading / error

Empty states name the next action ("Draw your map — rows and unit
sizes, ten minutes"). Loading = the map skeleton grid. Lien-engine
unknowns never guess: a state without reviewed rules says so plainly
and links the manual-mode checklist instead.
