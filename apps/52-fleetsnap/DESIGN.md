# FleetSnap — Design Specification (v5, redline level)

## Vision
A well-kept shop: swept floor, labeled bins, a torque wrench that clicks.
FleetSnap is instrument-panel calm on shop paper — cool gray grounds, gauge
steel used like a calibration mark, mono odometers and timers everywhere.
The satisfying moment is mechanical: the walkaround finishing under 90
seconds and the ROADWORTHY stamp landing with the elapsed time beside it.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `shop` | `#F5F6F7` | The ground. Every screen — cool shop paper |
| `card` | `#FCFDFD` | Vehicle tiles, inspection records, ticket panels only |
| `hairline` | `#E1E4E7` | 1px dividers & tile borders — never darker |
| `ink` | `#20272E` | Primary text AND primary button fill |
| `ink-2` | `#5E6973` | Secondary text |
| `ink-3` | `#95A0A9` | Faint (timestamps, VINs, placeholders) |
| `gauge` | `#52789C` | THE accent. ≤10% of any screen: the ROADWORTHY stamp, links, active states, focus rings, the stopwatch |
| `green` | `#3E8560` | Roadworthy / resolved / on-schedule only |
| `amber` | `#B3872F` | Service due / in shop / draft pending sync only |
| `red` | `#B04A3C` | Out of service / critical defect / overdue only |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: `gauge` never fills a button or a surface; `ink` is the only
high-emphasis fill (shop text on it); semantic colors carry vehicle/defect
state only. Committed to the single light world — walkarounds happen
outdoors and the spec targets AAA contrast for sun-glare readability; no
dark theme in v1, by choice. The driver's inspection page shares the
identical theme: one fleet, one paper.

## Type — exact specimen

Faces: **Barlow** (400/500/600 — the DIN/highway-signage lineage, honest
industrial warmth) for display and UI · **Red Hat Mono** (500) for every
odometer, timer, VIN, unit number, and ticket number. Both self-hosted
woff2, preloaded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (marketing hero) | BR 600 | `clamp(32px, 8.5vw, 54px)` / 1.08 | −0.015em |
| Hero stat (fleet ready) | RHM 500 | `clamp(34px, 9.5vw, 52px)` / 1.05 | −0.01em, tabular |
| H2 (screen title) | BR 600 | 22 / 1.2 | −0.01em |
| Title (vehicle/ticket row) | BR 600 | 16 / 1.3 | 0 |
| Body | BR 400 | 16 / 1.55 | 0 |
| Secondary | BR 400 | 13 / 1.45 | 0 |
| Label | BR 600 | 11 / 1.2 | +0.08em, uppercase |
| Data / odometers / timers | RHM 500 | 13 / 1.2 | 0, tabular figures |
| Button | BR 600 | 15 / 1 | 0 |

All odometers, durations, and ticket numbers are mono tabular, always. The
inspection stopwatch ("1:28") renders mono in `gauge` — the accent's
quietest recurring home.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **8** (controls: buttons, inputs, chips, photo thumbs) · **12**
  (vehicle tiles, inspection records, ticket panels) · **20** (sheets,
  photo viewer). Nothing else.
- Elevation: none. Depth is `card` on `shop` plus hairlines; only the sheet
  scrim shadows.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `truck-side` (vehicles), `clipboard-check` (inspections),
`wrench-flat` (tickets), `gauge-dial` (odometer/reminders), `camera`,
`stamp-ring` (roadworthy — a ring with a check), `triangle-flag` (defects),
`timer`, `pen-line` (signature), `file-lines` (exports), `send`,
`download`, `chevron-right`, `plus`, `gear`.
Nav renders at 22px, inline at 18px. **No emoji, anywhere, ever** — a
passed inspection gets `stamp-ring`, not a checkmark emoji.

## Component construction (exact)

- **Primary button:** `ink` fill, `shop` text, radius 8, height 48 mobile
  (full-width in thumb zone), BR 600 15. Press: scale 0.98 + fill `#2A323A`.
  Disabled: `#D7DBDE` fill, `ink-3` text.
- **Secondary:** transparent, 1px hairline, `ink`. Press: border `#C9CED3`.
- **Quiet action:** text-only, `gauge`, no underline; press dims to 80%.
- **Input:** `card` fill, hairline border, radius 8, height 48, 16px text.
  Focus: border `gauge` + 2px offset ring at 25% gauge. The odometer input
  is mono, 24px, right-aligned — the one big typed field.
- **Chips (board filter: All / Due / In shop / OOS):** height 36, radius 8,
  hairline; active = `gauge` 1px border + `gauge` text.
- **Vehicle tile:** `card`, radius 12, padding 16: unit number Title +
  mono plate right, status pill, last-inspection line ("pre-trip · 6:42am ·
  Reyes" in `ink-3`), service-due line mono ("oil due in 240 mi" — `amber`
  when due). Tiles are the one sanctioned card — everything inside is
  hairline rows.
- **Inspection item row (driver flow):** full-bleed row ≥56px, hairline
  between: item label Title(16), then the pass/fail/NA control — three
  44px segments, hairline-divided; pass fills `ink` on tap (shop text),
  fail fills `red`, NA hairline only. A failed row expands: photo slot
  (64px dashed outline, radius 8) + note field. One screen per item group.
- **The stopwatch:** mono in `gauge`, top-right of the driver header,
  ticking quietly ("0:47"). Never red, never pulsing — it is a measure,
  not a threat.
- **The ROADWORTHY stamp:** 20px circle, 1.5px `gauge` ring, `gauge`
  check, Label "ROADWORTHY" beside it — drawn once per submitted clean
  inspection, with the elapsed time mono beneath ("1:28"). Never green
  (green is the row state; the stamp is the record's mark).
- **Ticket panel:** `card`, radius 12: mono ticket number in `gauge`,
  source line ("from pre-trip · T-12 · brakes"), photo thumbs (radius 8,
  64px), status pill, vendor note, mono cost. Resolution appends the
  certification line — structural, not a footnote.
- **Status pill:** height 28, 6px dot + Label(11): `green` "ROADWORTHY" /
  "RESOLVED", `amber` "DUE" / "IN SHOP" / "SYNC PENDING", `red` "OUT OF
  SERVICE" / "CRITICAL" / "OVERDUE", `ink-3` "DRAFT".
- **Bottom tab bar (office):** height 56 + safe-area, `card` at 96% +
  blur, hairline top: truck-side / clipboard-check / wrench-flat /
  gauge-dial at 22px + 10px labels; active = `ink` + 2px `gauge` dot;
  inactive = `ink-3`.

## The signature — the stamp at 1:28 (four beats)
When a driver submits a clean inspection, one quiet sequence plays on both
the driver's screen and the office board: **(1)** the last item's pass
segment settles (opacity + 4px slide, 160ms), **(2)** the stopwatch stops
and its final time locks bold mono in `gauge` (120ms), **(3)** the
ROADWORTHY stamp lands — scale 1.15→1.0 with `spring-snappy`, ring drawing
0→360° in 240ms — with "1:28" beneath it, and **(4)** the vehicle's board
tile crossfades to READY green with the next service line beneath ("oil in
1,240 mi"), 200ms `ease-out-quart`. A defective submission replaces beats
3-4: the defect flag plants and the ticket number types itself on — the
system visibly catching the problem. Total under a second, no confetti.
Everything else is state feedback ≤240ms.

## Mobile layout (390×844 — primary spec)
- **Fleet board (office home):** gutter 20. Label "TUESDAY · 6 ON THE
  ROAD" + hero stat `11 of 12` roadworthy with a 4px hairline track filled
  `green`, then Secondary "1 out of service · 2 services due". Filter
  chips, then vehicle tiles. Thumb-zone primary: **New work order**;
  **Export DVIRs** quiet action in the header.
- **Driver flow (/drive/[token]):** vehicle confirm sheet (unit, plate,
  photo), then item groups one screen at a time with the item rows above,
  sticky progress footer ("Walkaround · 8 of 12"), odometer screen (mono
  input + last-reading sanity line), signature, submit. The stopwatch
  runs in the header throughout. Offline banner when drafting locally:
  amber "SYNC PENDING" pill until confirmed.
- **Ticket queue:** filter chips (Open / Scheduled / In shop), ticket
  rows (mono number in gauge, Title, vehicle, source, status pill);
  primary **New work order**. Panel view per the component spec.
- **Vehicle detail:** header (unit, plate, mono odometer), service
  timeline as hairline rows (mono dates + odometers), reminders block,
  inspection history with ROADWORTHY stamps, **Export this vehicle**
  quiet action.
- **First run:** three cards — add vehicles (CSV or taps), text the first
  driver link (ends with "Reyes can inspect T-12 right now"), review the
  FMCSA default template. Real data replaces each card as it completes.

## Responsive
≥768px: board becomes a 2-column tile grid; tickets gain a list + detail
split; gutters 32. ≥1024px: left rail replaces the tab bar; board 3-up;
the vehicle detail gains a side-by-side timeline + inspections view; max
content width 1120 centered. The stamp at 1:28 remains the signature at
every size; no desktop spectacle.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Tiles and rows enter with 24ms stagger,
opacity + 4px y-slide only — instruments never bounce. Chips crossfade
150ms; sheets 320ms `spring-gentle`; the photo viewer zooms from the
thumbnail rect. Targets ≥44px, ≥8px apart (pass/fail segments are 44px
minimum — gloved thumbs). Destructive/certifying actions (return to
service, close ticket, revoke driver link) are hold-to-confirm (600ms
fill) and always audit-logged. Pull-to-refresh re-checks sync state.
Haptic on the stamp, native only, never load-bearing.

## Reduced motion & fallback
Stamp → appears complete with a ≤100ms fade, elapsed time already locked;
tile flip → direct state swap; ticket number → appears whole. Stagger →
≤100ms opacity fade. Roadworthy/OOS/due states are always plain text +
pill — nothing is motion-only.
