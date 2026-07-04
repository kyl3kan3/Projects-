# TenantFile — Design Specification (v5, redline level)

## Vision
A well-kept house file, not a property-management ERP. TenantFile replaces the
shoebox, so it looks like what the shoebox wished it was: warm daylight paper,
plain-spoken type a 58-year-old duplex owner reads without glasses, and one
front-door blue that marks where action lives. Calm is the feature — the
product's promise is "it's handled, and it's on file."

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `porch` | `#F5F6F2` | The ground. Every screen — soft warm gray-green daylight |
| `card` | `#FFFFFF` | Framed objects only: photo threads, the lease sheet, listing preview |
| `hairline` | `#E2E4DD` | 1px dividers & card borders — never darker |
| `ink` | `#22282B` | Primary text and **primary buttons** (porch text on them) |
| `text-2` | `#6C7377` | Secondary text |
| `text-3` | `#9CA29F` | Faint (timestamps, placeholders) |
| `frontdoor` | `#3F6E9E` | THE accent. ≤10% of any screen: active states, links, the file-line, focus rings, unread thread dots |
| `rent-green` | `#3E7D53` | Paid / signed / screened-clear states only |
| `amber` | `#C2903A` | Due soon / pending signature / open request only |
| `red` | `#AE4B3C` | Late / broken / flagged-report states only |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: `frontdoor` never fills a button or a surface; `ink` is the only
high-emphasis fill; rent-green/amber/red carry ledger meaning only. One light
world, deliberately — landlord dashboard, tenant page, and listing page all
share the same daylight paper (the tenant page must feel like a receipt, not
an app).

## Type — exact specimen

Faces: **Hanken Grotesk** (400/500/600/700) for display and UI · **JetBrains
Mono** (500) for every amount, date, and unit label. Both self-hosted woff2,
preloaded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (listing headline, marketing) | HG 700 | `clamp(30px, 8vw, 46px)` / 1.12 | −0.015em |
| Hero stat (collected / balance) | JBM 500 | `clamp(32px, 8.5vw, 46px)` / 1.05 | −0.01em, tabular |
| H2 (screen title) | HG 600 | 22 / 1.2 | −0.01em |
| Title (row) | HG 600 | 16 / 1.3 | 0 |
| Body | HG 400 | 16 / 1.55 | 0 |
| Secondary | HG 400 | 13 / 1.45 | 0 |
| Label | HG 600 | 11 / 1.2 | +0.08em, uppercase |
| Data / money | JBM 500 | 13 / 1.2 | 0, tabular figures |
| Button | HG 600 | 15 / 1 | 0 |

Rent, dates, and unit labels are always mono: `$1,850.00`, `AUG 2026`,
`UNIT 2B`. Body text never drops below 16 — this audience will not squint.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **10** (controls: buttons, inputs, chips) · **14** (cards: threads,
  lease sheet, photo tiles) · **20** (bottom sheets). Nothing else.
- Elevation: none. Depth is `card` on `porch` plus hairlines; only sheet
  scrims shadow. Photos get radius 14 and a hairline, never a drop shadow.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `house` (properties), `key` (listings/vacancy), `ledger-book`
(rent), `wrench` (maintenance), `folder-file` (the File), `camera`,
`signature` (e-sign), `shield-check` (screening), `bell`, `send`, `check`,
`clock`, `chevron-right`, `plus`, `download`. Nav renders at 22px, inline at
18px. **No emoji, anywhere, ever** — a paid month gets `check`, not a
money-bag.

## Component construction (exact)

- **Primary button:** `ink` fill, `porch` text, radius 10, height 48 mobile
  (full-width in thumb zone). Press: scale 0.98 + fill `#2E3538`. Disabled:
  `#D7DAD3` fill, `text-3` text.
- **Secondary:** transparent, 1px hairline, `ink`. Press: border `#CBCFC7`.
- **Quiet action:** text-only `frontdoor`, no underline; press dims to 80%.
- **Input:** `card` fill, hairline border, radius 10, height 48, 16px text.
  Focus: border `frontdoor` + 2px offset ring at 25% frontdoor.
- **Rent ledger strip:** 12 month cells per tenancy year, height 32, radius 6,
  hairline-separated: paid = rent-green fill + porch check; due = amber ring;
  late = red fill at 85%; future = `porch`. Mono month initials beneath.
- **Unit rows:** NO boxes. Full-bleed hairline rows ≥56px: Title(16) address +
  mono unit label, mono rent right, Secondary state ("M. Alvarez · paid Aug 1"
  / "VACANT · 12 applications") in `text-3`, 6px status dot left.
- **Application card (pipeline):** `card`, radius 14, padding 16: name Title,
  mono income ratio ("3.4× RENT"), screening state pill, two quiet actions
  (Invite to screen / Decline).
- **Status pill:** height 28, 6px dot + Label(11): amber "AWAITING SIGNATURE",
  rent-green "SCREENED · CLEAR", red "LATE 6 DAYS".
- **Photo thread:** `card`, radius 14; messages as hairline-divided rows,
  author Label + Body, photo grid tiles 96px radius 8; composer pinned with
  `camera` attach ≥44px.
- **File timeline:** vertical 1.5px `frontdoor` line at left gutter (the
  file-line), event nodes 8px circles on it, mono dates, event summaries in
  Body; kind glyph at 18px per node.
- **Bottom tab bar:** height 56 + safe-area, `porch` at 96% + blur, hairline
  top. Four items (Units / Rent / Requests / File) at 22px icons + 10px HG 600
  labels; active = `ink` + 2px frontdoor dot; inactive = `text-3`.

## The signature — the file-line stitch
Whenever a real-world event lands in a tenancy — application in, report clear,
lease signed, rent paid, request closed — its node stitches onto the File
timeline: the frontdoor line extends 24px in 200ms `ease-out-quart`, the 8px
node pops in with `spring-gentle` (scale 0.6→1), and its mono date fades in.
On the home screen the same event flashes the relevant row's status dot once
(300ms crossfade to its semantic color). Quiet, additive, archival — the
animation literally shows the paper trail growing. Rate-limited to one stitch
per second; batches collapse to sequential stitches, max 4. This is the entire
brand animation.

## Mobile layout (390×844 — primary spec)
- **Units (home):** gutter 20. Top: portfolio name + `bell`. Hero band: Label
  "COLLECTED · AUGUST" over `$5,400 of $5,400` mono (rent-green when whole),
  beside "2 requests open". Then Label "UNITS" and hairline rows — "114 Maple
  · `2B` · `$1,850` · M. Alvarez · paid" / "114 Maple · `1A` · VACANT · 12
  applications". Primary button contextual: **Review applications** when a
  vacancy has news, else hidden.
- **Tenancy detail:** tenant names + mono term ("SEP 2025 – AUG 2026"), the
  12-month ledger strip, then the File timeline (newest first). Thumb zone:
  **Record a payment** primary, "Send reminder now" quiet action.
- **Tenant pay page (their phone):** receipt-plain `card` on `porch`: address
  + unit in mono, balance hero, ledger strip of their year, **Pay $1,850 by
  bank** ink primary in thumb zone, card option beneath with fee shown
  honestly, request-repair quiet action at bottom. No TenantFile chrome above
  the fold — landlord's name is the header.
- **Application review:** applicant cards in pipeline order; tapping opens
  answers + documents; **Invite to screen** primary; decline flows through
  the adverse-action letter sheet (guardrail copy + state source cited).

## Responsive
≥768px: unit rows gain columns (rent, status, last event), ledger strips show
two years, gutters 32. ≥1024px: left rail nav; center is units/ledger; right
rail is the live File feed across the portfolio; max content width 1120. The
stitch stays the signature at every size; no desktop-only spectacle.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Rows enter with 24ms stagger, opacity + 4px
y-rise. Ledger cells fill with a 200ms radial wipe on payment. Pipeline cards
slide 8px on status change (`ease-in-out-soft`, 240ms). Targets ≥44px, ≥8px
apart; destructive actions (decline applicant, void lease, apply late fee)
are hold-to-confirm (600ms radial fill). Pull-to-refresh on ledger and
requests. Haptics native-only, never load-bearing.

## Reduced motion & fallback
Stitch → node appears instantly with a 100ms opacity fade; line pre-drawn.
Ledger wipes → direct fill swap. Stagger → ≤100ms fade. Every animated state
(paid, signed, late, closed) is also plain text in its row — the File is
readable with zero motion, which is exactly its point.
