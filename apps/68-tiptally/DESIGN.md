# TipTally Design — "The End-of-Shift Till"

Art direction anchored in the product's world: the till drawer counted
at close — receipt-paper white, register mono, one till-green accent
like the cash tray's felt. The aesthetic is the receipt: everything
important is a printed line with the math beside it, totals ruled
above and below. Honest arithmetic as a visual language.

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

## Palette

| Token | Hex | Use |
|---|---|---|
| `receipt` | `#F7F6F0` | App ground (receipt stock) |
| `sheet` | `#FDFCF8` | Cards, panels |
| `line` | `#E0DED2` | Hairlines, ruled totals |
| `ink` | `#232420` | Primary text; primary button fill |
| `dim` | `#6D6E64` | Secondary text |
| `faint` | `#A2A396` | Tertiary, disabled |
| `till` | `#3C8A5E` | THE accent: computed shares, closed states, focus (≤10%) |
| `flag` | `#B3593B` | Semantic: import flags / open disputes only |
| `holdover` | `#9A8433` | Semantic: draft / unlocked-period warnings only |

Hard rules: `till` never fills a button or a surface; `ink` is the
only high-emphasis fill (receipt text on it). Money is never colored
by sign — shares are ink; only states carry color. Light-only: closes
happen under kitchen fluorescents.

## Type — exact specimen

Faces: **Hanken Grotesk** (400/500/600 — warm workmanlike grotesk)
for display and UI · **IBM Plex Mono** (500) for EVERY number: money,
points, hours, percentages — the receipt register. Both self-hosted
woff2, preloaded.

| Role | Face/weight | Mobile size/lh | Notes |
|---|---|---|---|
| Display | Hanken Grotesk 600 | 30/36 | -0.01em |
| H2 | Hanken Grotesk 600 | 22/28 | |
| Title (row) | Hanken Grotesk 500 | 16/22 | |
| Body | Hanken Grotesk 400 | 16/24 | |
| Secondary | Hanken Grotesk 400 | 13/18 | `dim` |
| Placard (status) | Hanken Grotesk 600 | 11/14 | +0.08em, uppercase |
| Mono (all numbers) | Plex Mono 500 | 14–15 | tabular-nums, always |

## Space, radii, hairlines

4px scale. Radii: 8 (cards/inputs), 6 (chips), 0 (derivation rules —
square, like a receipt) — three. 1px `line` hairlines; totals ruled
with a double hairline above (the receipt convention). Touch targets
≥ 44px; the staff page ≥ 48px.

## Signature detail — the derivation strip

Every share renders as a receipt block: the employee line, then the
derivation steps each on its own ruled line in mono ("10 pts × 6.5h
= 65", "65 / 290 = 22.4%", "22.4% × $1,842.00"), then the double-
ruled total in `till`. Expanding is a paper unfold (height animate);
the same block renders in the console, the transparency page, dispute
views, and the landing device. The math IS the interface.

## Motion

One signature: **the tally** — when a shift closes, share totals
count up in sequence (staggered 60ms, each 240ms) and settle with
their double rule drawing in. The derivation unfold is 180ms
ease-out-quart. Everything else 120–160ms opacity/transform. Reduced
motion: totals appear complete, unfolds instant.

## Screens (MVP)

1. **Shifts (`/shifts`)** — service-date rows: meal, pool totals in
   mono, status placard (DRAFT/IMPORTED/FLAGGED/CLOSED/LOCKED),
   flags count in `flag`.
2. **Shift close (`/shifts/[id]`)** — entries table (name, role,
   hours, tips, sales) with flag rows surfaced first and inline
   resolution; pool totals live; the Close button runs the tally.
3. **Shares view** — post-close: derivation strips per participant,
   dispute indicators, recompute (with audit) for adjustments.
4. **Rules (`/pools`)** — per pool: the current version rendered as
   sentences + the points table; the version history rail;
   effective-date picker on edits ("applies from Monday").
5. **Staff page (`/s/[token]`)** — mobile-first: their shifts, their
   derivation strips, the dispute button inside the window (with the
   honest countdown "2 days left to flag").
6. **Disputes (`/disputes`)** — queue with the math attached;
   uphold/adjust flows with required notes.
7. **Exports (`/exports`)** — period picker, format select, the
   pre-export checklist (all shifts closed? disputes resolved?),
   lock confirmation.
8. **Landing** — receipt world, the import-to-derivation device (see
   README), the shown-math receipt, pricing, honest FAQ (we don't
   move money; compliance notes are guidance, not legal advice).
   CTA verbatim: "Start free — 14 days".

## Empty / loading / error

Empty states name the next action ("Set your pool rules, then import
your first shift"). Loading = skeleton receipt lines. Import errors
show the raw row beside the expectation ("column 'Tips' not found —
map it here"); cents that don't sum exactly are a build failure, not
a rounding note.
