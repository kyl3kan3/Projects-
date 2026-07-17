# MatPass — Design Specification (v5, redline level)

## Vision
The dojo wall, kept honestly: canvas-white grounds like a fresh gi, charcoal
ink, and crimson used the way a belt uses its color — rarely, and only where
rank lives. The interface has a mat's discipline: flat, swept, nothing
decorative. The satisfying moment is earned advancement — a stripe sliding
onto a belt bar and seating with a snap.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `canvas` | `#F6F5F1` | The ground. Every screen — gi-canvas white |
| `card` | `#FCFBF8` | Student cards, grading panels, sheets only |
| `hairline` | `#E4E1D9` | 1px dividers & panel borders — never darker |
| `ink` | `#262421` | Primary text AND primary button fill (charcoal) |
| `ink-2` | `#6C6963` | Secondary text |
| `ink-3` | `#9E9A92` | Faint (timestamps, placeholders) |
| `crimson` | `#A63B32` | THE accent. <=10% of any screen: the stripe on the belt bar, links, active states, focus rings, eligibility-met marks |
| `green` | `#3F7A52` | Recovered / paid / confirmed only |
| `amber` | `#B3873A` | Near-miss / past-due / paused only |
| `red-flag` | `#8F3B33` | Retention flags / failed payment escalation only (deliberately adjacent to crimson but darker — the alarm is family, not brand) |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: `crimson` never fills a button or a surface; `ink` is the only
high-emphasis fill (canvas text on it). Belt colors on belt bars are data
(each rank's `belt_color_hex` from the curriculum), rendered as thin
authentic bands — they are content, not UI accent, and they never leak into
chrome. Committed to the single canvas-light world; the kiosk shares it at
higher contrast (arm's length, gym lighting). No dark theme in v1, by choice.

## Type — exact specimen

Faces: **Archivo** (500/600/700 — including SemiExpanded 700 for display; an
athletic, signage-grade grotesk) for display, UI, and body · **Fragment Mono**
(400) for every count, date, and requirement figure. Both self-hosted woff2,
preloaded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (marketing hero) | Archivo SemiExpanded 700 | `clamp(32px, 8.5vw, 54px)` / 1.06 | −0.01em |
| Kiosk student name | Archivo 700 | 28 / 1.15 | −0.01em |
| Hero stat (classes count) | FM 400 | `clamp(34px, 9.5vw, 52px)` / 1.05 | 0, tabular |
| H2 (screen title) | Archivo 700 | 22 / 1.2 | −0.01em |
| Title (student row) | Archivo 600 | 16 / 1.3 | 0 |
| Body | Archivo 500 | 16 / 1.5 | 0 |
| Secondary | Archivo 500 | 13 / 1.45 | 0 |
| Label | Archivo 700 | 11 / 1.2 | +0.08em, uppercase |
| Data / counts / dates | FM 400 | 13 / 1.2 | 0, tabular figures |
| Button | Archivo 700 | 15 / 1 | 0 |

Requirement math is always mono: "18 / 24 classes · 61 / 90 days". The kiosk
uses the same specimen scaled up one step — legible at arm's length.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**
  (kiosk: 24).
- Radii: **8** (controls: buttons, inputs, chips) · **12** (student cards,
  grading panels) · **20** (sheets, the kiosk student card). Nothing else.
- Elevation: none. Depth is `card` on `canvas` plus hairlines; only sheet
  scrims shadow.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `belt-bar` (brand mark — a horizontal belt with one stripe),
`door-check` (kiosk), `roster-rows` (students), `ladder-ranks` (curriculum),
`grading-list` (events), `flag-drop` (retention), `family-cluster`,
`calendar-class`, `card-payment`, `horn-flat` (announce), `signoff-pen`,
`pause-band`, `download`, `chevron-right`, `plus`. Nav renders at 22px,
inline at 18px (kiosk 26px). **No emoji, anywhere, ever** — a promotion gets
the stripe animation, not a party emoji.

## Component construction (exact)

- **Primary button:** `ink` fill, `canvas` text, radius 8, height 48 mobile /
  56 kiosk, Archivo 700 15. Press: scale 0.98 + fill `#33302C`. Disabled:
  `#DAD6CD` fill, `ink-3` text.
- **Secondary:** transparent, 1px hairline, `ink`. Press: border `#CBC7BD`.
- **Quiet action:** text-only, `crimson`, no underline; press dims to 80%.
- **Input:** `card` fill, hairline border, radius 8, height 48 (kiosk
  search: 56, 18px text). Focus: border `crimson` + 2px offset ring at 25%
  crimson.
- **The belt bar (the product's recurring object):** height 12, radius 4,
  full row width: the rank's `belt_color_hex` as the band, earned stripes as
  3px `canvas`-gapped vertical bars at the right end (white-on-dark belts
  per tradition; dark-on-light for white/yellow belts — computed contrast).
  Below it, the progress hairline (2px): fills `crimson` toward the next
  requirement, with mono "18 / 24" at the right. The belt bar appears on
  student rows, kiosk cards, and grading candidates identically.
- **Student rows (roster):** NO boxes. Full-bleed rows >=56px, hairline
  between: Title(16) name, belt bar beneath, Secondary "Okafor family ·
  3x/week" in `ink-3`; flag glyph in `red-flag` at row end when an open
  retention flag exists.
- **Kiosk student card:** `card`, radius 20, padding 24: name at 28/700,
  belt bar large (height 16), today's class pre-selected as a chip row,
  one primary **Check in**. After the tap: the class counter ticks and the
  progress hairline advances — then auto-returns to search in 2.5s.
- **Grading candidate rows:** hairline rows: name + belt bar, then the
  requirement math in mono — met values in `ink`, missing deltas in `amber`
  ("2 classes short"); eligibility state as a pill. Batch review screen
  lists pending promotions with from -> to belt bars side by side.
- **Retention flag card:** `card`, radius 12: name Title, "last seen 19
  days ago · was 3x/week" with the mono figures, family contact line,
  outcome chip row (Contacted / Recovered / Lost) — 44px chips.
- **Status pill:** height 28, 6px dot + Label(11): `crimson` "ELIGIBLE",
  `amber` "NEAR MISS" / "PAST DUE" / "PAUSED", `green` "CONFIRMED" /
  "RECOVERED", `red-flag` "FLAGGED".
- **Bottom tab bar (dashboard):** height 56 + safe-area, `card` at 96% +
  blur, hairline top: `roster-rows` / `grading-list` / `flag-drop` /
  `card-payment` at 22px + 10px labels; active = `ink` + 2px `crimson` dot;
  inactive = `ink-3`. The kiosk has NO tab bar — it is a single-purpose
  surface.

## The signature — the stripe seats (four beats)
On promotion (grading batch or mat promotion) — and in miniature on every
kiosk check-in — <=800ms total, mobile/kiosk-capable:

1. **The counter ticks** — the mono class count increments with a one-digit
   odometer roll (120ms).
2. **The bar fills** — the crimson progress hairline advances to its new
   value (`ease-out-quart`, 200ms).
3. **The stripe slides** — on an actual promotion, a stripe slides in from
   the right along the belt and **seats with a snap** (`spring-snappy`,
   ~180ms, 2px overshoot) — the tape-on-belt moment.
4. **The record line** — a mono ledger line fades up beneath ("Blue · 2nd
   stripe · Jul 17 2026 · Prof. Reyes") — on the wall AND on record.

Check-ins play beats 1-2 only. Grading batches stagger at most 3 stripe
seats, 100ms apart, then "14 promotions recorded". No confetti, no belt
emoji, no fireworks — the snap is the celebration.

## Mobile layout (390×844 — primary spec)
- **Roster (home):** gutter 20. Label "THIS WEEK" + hero stat: mono
  check-ins count with Secondary "142 check-ins · 7 flagged · 3 gradings
  ready", then filter chips (program), then student rows with belt bars.
  Thumb-zone primary: **Check in a student** (desk fallback); search
  pinned atop.
- **Student detail:** belt bar large + requirement math, promotion timeline
  (mono dates, from->to, grader), attendance sparkline (12 weeks), family
  block with billing state pill, notes. Quiet actions: promote on the mat,
  pause, flag outcome.
- **Grading event:** header (date, programs, candidate count), Eligible /
  Near-miss segmented list, invite + confirm states; event day flips rows
  to promote / hold / no-show; completing opens the batch review sheet.
- **Retention:** open flag cards sorted by days-since-seen; outcomes are
  one tap + optional note; recovered flags fold into a quiet monthly tally
  ("4 of 7 recovered").
- **Kiosk (tablet landscape or portrait, 24px gutter):** search field 56px
  + on-screen keyboard, result cards with photo/belt bar, the kiosk student
  card, auto-return. Offline banner ("3 check-ins queued — will sync") in
  `amber`, never blocking.
- **First run:** three cards — pick/adjust a curriculum template (BJJ,
  karate, TKD ladders preloaded), import students (CSV with rank columns),
  print the kiosk setup QR (opens the device-token flow). Ends with a
  sample grading event assembled from the imported data.

## Responsive
>=768px: roster becomes list + student-detail panes; grading events show
candidates and review side by side; gutters 32. >=1024px: left rail replaces
the tab bar; the retention list gains the attendance sparkline column; max
content width 1120 centered. The stripe-seat beats remain the signature at
every size; no desktop spectacle.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Rows enter with 24ms stagger, opacity + 4px
y-slide only. Chips crossfade 150ms; sheets 320ms `spring-gentle`. Targets
>=44px everywhere and >=56px on the kiosk (kids' fingers, gym conditions).
Destructive/record actions (revoke kiosk, reverse a promotion, mark lost)
are hold-to-confirm (600ms fill) and always audit-logged. Kiosk check-in
must feel instant: optimistic UI with the queued-sync banner as the honest
fallback. Haptic on the stripe seat, native only, never load-bearing.

## Reduced motion & fallback
Stripe seat -> the stripe appears seated with a <=100ms fade; counter ->
direct swap; batch -> single summary line ("14 promotions recorded").
Stagger -> <=100ms opacity fade. Eligibility, flags, and billing states are
always plain text + pill in the row — nothing is motion-only.
