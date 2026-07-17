# RigRent Design — "The Yard Manifest"

Art direction anchored in the product's world: the rental yard at 6am —
canvas tarps, kraft manifests on clipboards, chalk quantities on the
warehouse wall. A light, workmanlike paper system where quantities are
the heroes: big tabular counts, availability bars like chalk gauges,
stencil-flavored headers. Nothing precious — this is software for
people who load trucks.

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

## Palette

| Token | Hex | Use |
|---|---|---|
| `kraft` | `#F4F1E9` | App ground (manifest paper) |
| `sheet` | `#FCFBF7` | Cards, panels |
| `line` | `#DDD8CA` | Hairlines only |
| `ink` | `#23241F` | Primary text; primary button fill |
| `dim` | `#6E6D62` | Secondary text |
| `faint` | `#A5A395` | Tertiary, disabled |
| `canvas` | `#7A8248` | THE accent: availability gauges, active states, focus (≤10%) |
| `rust` | `#B0603F` | Semantic: overbooked / damaged / overdue only |
| `pine` | `#4E7A5A` | Semantic: returned-clean / released only |

Hard rules: `canvas` never fills a button or a surface; `ink` is the
only high-emphasis fill (kraft text on it); `rust` carries conflict
meaning only — the overbooked line is the one place the UI raises its
voice. Light-only in v1: yards work in daylight.

## Type — exact specimen

Faces: **Public Sans** (400/500/700 — the U.S. gov workhorse grotesk;
utilitarian, zero startup flavor) for display and UI · **IBM Plex Mono**
(500) for every quantity, rate, date, and serial. Both self-hosted
woff2, preloaded.

| Role | Face/weight | Mobile size/lh | Notes |
|---|---|---|---|
| Display (counts) | Public Sans 700 | 30/34 | digits via Plex Mono 500 |
| H2 | Public Sans 700 | 22/28 | -0.01em |
| Title (row) | Public Sans 500 | 16/22 | |
| Body | Public Sans 400 | 16/24 | |
| Secondary | Public Sans 400 | 13/18 | `dim` |
| Placard (status) | Public Sans 700 | 11/14 | +0.08em, uppercase |
| Mono (qty/money/dates) | Plex Mono 500 | 13–15 | tabular-nums |

## Space, radii, hairlines

4px scale. Radii: 8 (cards/inputs), 6 (chips), 2 (gauges) — three.
1px `line` hairlines; rows separated by space + hairline, never boxes
in boxes. Touch targets ≥ 44px; driver check-off rows 56px.

## Signature detail — the chalk gauge

Every item line carries a thin availability gauge: a 4px track in
`line`, filled in `canvas` to booked/owned for the quote's window, with
the fraction beside it in Plex Mono ("32/40"). Overbooked: the overrun
segment renders `rust` and the line names the conflicting order. The
gauge is the product's argument rendered — the landing device animates
this exact component.

## Motion

One signature: **the gauge fill** — 180ms `cubic-bezier(0.25, 1, 0.5,
1)` when a quantity changes; overbooked state snaps (no ease) — a
conflict should feel abrupt. Check-off rows settle with a 120ms tick.
Everything else 120–160ms opacity/transform. Reduced motion: final
states instantly.

## Screens (MVP)

1. **Inventory (`/items`)** — item rows: name, owned count, category,
   the next-30-days mini-gauge; edit sheet with damage fee schedule.
2. **Quote builder (`/orders/new`)** — event window picker at top
   (drives everything), line rows with live gauges, totals + deposit
   footer. The overbooked block is inline, not a toast.
3. **Order detail** — status ribbon (draft → closed), lines with
   gauges, contract/sign state, deposit state chip (held / captured /
   released with amounts), checks + photo pairs per line, claims.
4. **Customer quote page (`/q/[token]`)** — kraft paper document:
   lines, terms, damage fee schedule, signature + initials canvas,
   card field for the hold. Reads like a manifest, signs like a
   contract.
5. **Calendar (`/calendar`)** — month view; day cells stack order
   chips; the busiest-Saturday density is the point. Week view lists
   runs.
6. **Run sheet (`/runs/[id]`)** — stop order, per-truck load list
   (aggregated quantities in display type), driver check-off rows with
   camera buttons.
7. **Returns (`/returns`)** — due-back-today queue; check-in flow per
   line: clean/damaged/missing steppers, in-photos, claim drafting.
8. **Landing** — kraft world, the gauge device running four beats
   (see README), photo-pair damage receipt, pricing, honest FAQ.
   CTA verbatim: "Start free — 14 days".

## Empty / loading / error

Empty states name the next action ("Add your first item — start with
the thing you own the most of"). Loading = skeleton rows in `sheet`.
Errors are sentences with the fix inline; the overbooked error always
names the conflicting order number.
