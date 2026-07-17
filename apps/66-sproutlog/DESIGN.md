# SproutLog Design — "The Cubby Wall"

Art direction anchored in the product's world: the cubby wall by a
home daycare's door — warm cream paint, name labels in a steady hand,
one storytime-blue accent. Warm but adult: this is a licensed
business's tool, not a kids' app — no bubble type, no rainbow
palette, no mascots. The warmth comes from cream paper, soft radii,
and sentences written like a caring adult.

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

## Palette

| Token | Hex | Use |
|---|---|---|
| `cream` | `#F8F4EA` | App ground (the painted wall) |
| `card` | `#FDFBF4` | Cards, sheets |
| `line` | `#E5DECB` | Hairlines only |
| `ink` | `#2A2620` | Primary text; primary button fill |
| `dim` | `#75705F` | Secondary text |
| `faint` | `#A9A28D` | Tertiary, disabled |
| `storytime` | `#4B7BC4` | THE accent: active child chip, tap feedback, focus (≤10%) |
| `clover` | `#5F8A55` | Semantic: paid / signed / complete only |
| `cherry` | `#B0533F` | Semantic: past-due / over-ratio / allergy flags only |

Hard rules: `storytime` never fills a button or a surface; `ink` is
the only high-emphasis fill (cream text on it). `cherry` speaks only
for the three things that matter (money overdue, ratio, allergies).
Light-only: daycare hours are daylight hours.

## Type — exact specimen

Faces: **Nunito Sans** (400/600/700 — round-cornered humanist, warm
without being childish) for display and UI · **IBM Plex Mono** (500)
for times, counts, and money. Both self-hosted woff2, preloaded.

| Role | Face/weight | Mobile size/lh | Notes |
|---|---|---|---|
| Display | Nunito Sans 700 | 28/34 | -0.005em |
| H2 | Nunito Sans 700 | 22/28 | |
| Title (child chip) | Nunito Sans 600 | 16/22 | |
| Body / digest sentences | Nunito Sans 400 | 16/25 | the digest reads like writing |
| Secondary | Nunito Sans 400 | 13/18 | `dim` |
| Placard (status) | Nunito Sans 700 | 11/14 | +0.08em, uppercase |
| Mono (times/counts/money) | Plex Mono 500 | 13–15 | tabular-nums |

## Space, radii, hairlines

4px scale. Radii: 12 (cards, child chips), 8 (inputs), 999 (tap
buttons) — three, softer than the portfolio norm by design. 1px
`line` hairlines. Touch targets ≥ 52px — one thumb, other hand
holding a toddler.

## Signature detail — the day ribbon

Each child's card carries a thin horizontal ribbon of the day: tiny
event marks in chronological order (arrival dot, meal square, nap
band as a filled stretch, diaper tick) in ink, with the nap band in
`storytime` at 30%. The digest email renders the same ribbon as its
header. The ribbon is the daily sheet, drawn.

## Motion

One signature: **the tap bloom** — every log tap blooms a 44px
`storytime` ring from the touch point (240ms, fading) and appends its
mark to the ribbon with a 120ms settle. The digest preview composes
sentence by sentence (60ms staggers). Everything else 120–160ms.
Reduced motion: marks appear instantly, no blooms.

## Screens (MVP)

1. **Day (`/day`)** — the one-thumb screen: ratio header
   ("6 of 8 here"), child chips in arrival order with their ribbons,
   the big tap row per selected child (Arrive/Meal/Nap/Diaper/Photo/
   Note), house-event row. Everything reachable with a thumb.
2. **Meal sheet** — component checklist pre-filled from the menu
   (CACFP: milk/grain/fruit-veg/protein), per-child ate-all/some/none.
3. **Digest preview (`/digest`)** — today's compiled digests per
   family, editable before the send time; the sent ledger below.
4. **Children (`/children`)** — profiles: allergies in `cherry`
   placards, pickups, schedule, tuition; enrollment states.
5. **Money (`/money`)** — invoice rows per family: period, amount,
   autopay state, past-due in `cherry`; late-fee settings; the
   provider's month total in mono.
6. **Binder (`/binder`)** — attendance registers, meal counts, nap
   checks, incidents; date-range export buttons ("March CACFP claim",
   "Inspection binder").
7. **Incident form** — structured what/when/action, signature canvas
   at pickup, PDF to both parties.
8. **Landing** — cream world, the tap-to-digest device (see README),
   the CACFP table receipt, pricing, honest FAQ (not a curriculum
   app; no assessments theater). CTA verbatim: "Start free — 14
   days".

## Empty / loading / error

Empty states name the next action ("Add your first child — the day
screen builds itself from schedules"). Loading = skeleton chips.
Over-ratio is a fact in the header and the log, stated plainly, never
a blocking modal (the provider is holding a child; the software
doesn't lecture).
