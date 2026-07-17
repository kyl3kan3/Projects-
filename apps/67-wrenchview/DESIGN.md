# WrenchView Design — "The Service Bay at 7am"

Art direction anchored in the product's world: a clean shop's bay
before the first car — graphite floors, tool-chest steel, one
grease-bronze accent like a worn brass fitting. The tablet UI is
gloves-friendly: huge verdict targets, unmissable states. The
customer report flips to a light paper ground — the shop works in
graphite; the customer reads on paper.

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

## Palette

| Token | Hex | Use |
|---|---|---|
| `graphite` | `#1A1C1E` | Shop-side ground |
| `chest` | `#232629` | Cards, sheets (tool-chest steel) |
| `line` | `#33373B` | Hairlines only |
| `linen` | `#F1EFE9` | Primary text on graphite; primary button fill |
| `dim` | `#9CA0A0` | Secondary text |
| `faint` | `#5F6367` | Tertiary, disabled |
| `bronze` | `#B98032` | THE accent: active item, focus, read receipts (≤10%) |
| `go` | `#5E8A5C` | Verdict green only |
| `caution` | `#C3922E` | Verdict yellow only |
| `stop` | `#B0483A` | Verdict red only |
| `paper` | `#F6F4EE` | Customer report ground |
| `ink` | `#232019` | Customer report text |

Verdict colors are semantic ONLY — they never decorate chrome. On the
customer report, verdicts render as urgency groups (Now / Soon /
Watch) with the same three semantics on paper.

Hard rules: `bronze` never fills a button or a surface; `linen` is
the shop-side high-emphasis fill (graphite text on it); the customer
report's primary button is `ink` on paper.

## Type — exact specimen

Faces: **Archivo** (500/600/700 — shop-signage grotesk) for display
and UI · **JetBrains Mono** (500) for measurements, prices, and RO
numbers. Both self-hosted woff2, preloaded.

| Role | Face/weight | Size/lh | Notes |
|---|---|---|---|
| Display | Archivo 700 | 30/34 | -0.01em |
| H2 | Archivo 600 | 22/28 | |
| Title (item) | Archivo 600 | 17/24 | tablet-legible at arm's length |
| Body / finding sentences | Archivo 400* | 16/25 | *400 via Archivo regular |
| Secondary | Archivo 500 | 13/18 | `dim` |
| Placard (status) | Archivo 600 | 11/14 | +0.08em, uppercase |
| Mono (mm/32nds/$/RO) | JetBrains Mono 500 | 14–16 | tabular-nums |

## Space, radii, hairlines

4px scale. Radii: 10 (cards), 8 (inputs), 999 (verdict buttons) —
three. 1px `line` hairlines. Tablet targets ≥ 56px; the three verdict
buttons are 64px circles — gloves.

## Signature detail — the verdict rail

Each inspection item renders a three-stop rail (green/yellow/red
circles); the tapped verdict fills and the rail collapses to that
single stop with the photo count beside it. The customer report
reuses the stop as each finding's urgency mark. The board shows each
vehicle as a compressed rail summary (2R 3Y 20G). One element,
everywhere, including the landing device.

## Motion

One signature: **the verdict snap** — tapping a verdict fills the
stop with a 100ms scale-settle and collapses the rail 140ms
ease-out-quart; red additionally pulses once (opacity 0.7→1, 180ms)
— the only pulse in the system. Approval toggles on the customer
report settle 120ms with the running total counting. Reduced motion:
instant states, no pulse.

## Screens (MVP)

1. **Bay flow (tablet, `/bay`)** — one item at a time: item label
   huge, the verdict rail, camera button, measurement keypad (mm /
   32nds / CCA), note; progress strip along the top; next/back
   swipes. Faster than paper or it loses.
2. **Advisor board (`/board`)** — vehicle rows: RO#, vehicle,
   rail summary, state placard (IN BAY / READY / SENT / VIEWED /
   DECIDED), sent+viewed timestamps in mono, waiting-too-long flags
   in bronze.
3. **Findings + estimate (`/inspections/[id]`)** — findings list with
   editable sentences and photos; estimate lines per finding (labor/
   parts/tax in mono); Send panel with the SMS preview.
4. **Customer report (`/r/[token]`)** — paper ground: shop header,
   vehicle, urgency groups (Now/Soon/Watch) with photos full-bleed
   in cards, each line's Approve/Decline, the sticky running total,
   submit. Reads like a clear letter, not an invoice ambush.
5. **Vehicle history** — prior inspections, declined lines with
   "still open" flags, next-visit talking points.
6. **Templates (`/templates`)** — group/item editor with canned
   phrases per verdict.
7. **Landing** — graphite-to-paper split device (see README), the
   authorization-record receipt, pricing, honest FAQ (works beside
   your SMS; keep Tekmetric/Mitchell). CTA verbatim: "Book a
   10-minute demo".

## Empty / loading / error

Empty states name the next action ("Load a template and start the
first inspection"). Media uploads show per-photo progress; a failed
upload never blocks the verdict (photo retries in the background).
The customer link expired page gives the shop's phone number — the
fallback is always a human.
