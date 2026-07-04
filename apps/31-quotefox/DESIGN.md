# QuoteFox — Design Specification (v3, redline level)

## Vision
A jobsite tool, not a pitch deck. QuoteFox is used in driveways and attics,
in gloves and sunlight, so it reads like good test equipment: dark iron
grounds, big legible figures, one hi-vis orange used the way it's used on a
jobsite — to mark exactly where the action is. The estimate assembling
itself is the only theater; everything else is quiet and fast.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icons only, space-before-boxes, 4px scale, hairlines, real
content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `iron` | `#16120D` | The ground. Every dark screen. Warm near-black, mixed toward the accent's world |
| `toolbox` | `#211A12` | Sheets, grouped stat panels, proposal preview card only |
| `hairline` | `#31281C` | 1px dividers & panel borders — never brighter |
| `text` | `#F1ECE3` | Primary text |
| `text-2` | `#A79B87` | Secondary text |
| `text-3` | `#6E6353` | Faint (timestamps, placeholders, unit labels) |
| `paper` | `#F4EFE6` | **Primary buttons** (iron text on it), proposal page ground, hero numerals |
| `hi-vis` | `#CD7A29` | THE accent. ≤10% of any screen: the record ring, running total, active states, links, the send sweep |
| `amber` | `#D9A43C` | Waiting states only: unviewed proposals, `needs_pricing` rows, upload retries |
| `red` | `#CE5B45` | Failed / expired / declined only |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: `hi-vis` never fills a button or surface — it marks, it doesn't paint.
`paper` is the only high-emphasis fill; amber and red carry meaning only.
The homeowner proposal page is the light theme: ground `paper`, text `#211A12`, hairline `#E5DECF`; primary buttons there are **ink** fill with paper text.

## Type — exact specimen

Faces: **Archivo** (400/500/600) for display and UI · **IBM Plex Mono**
(500/600) for every figure and amount. Both self-hosted woff2, preloaded.
Archivo's grotesque width holds up at jobsite glance distance.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (marketing hero) | Archivo 600 | `clamp(34px, 9vw, 60px)` / 1.06 | −0.015em |
| Hero stat (running total) | IPM 600 | `clamp(36px, 10vw, 56px)` / 1.0 | −0.01em, tabular; cents 60% size |
| H2 (screen title) | Archivo 600 | 22 / 1.2 | −0.01em |
| Title (row: line item, job) | Archivo 500 | 16 / 1.3 | 0 |
| Body | Archivo 400 | 16 / 1.55 | 0 |
| Secondary | Archivo 400 | 13 / 1.45 | 0 |
| Label | Archivo 600 | 11 / 1.2 | +0.08em, uppercase |
| Data / amounts | IPM 500 | 13 / 1.2 | 0, tabular figures |
| Button | Archivo 600 | 15 / 1 | 0 |

All money and quantities are mono tabular, always, right-aligned in rows. The running total's `$` is `hi-vis`; everywhere else `$` inherits text color.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **8** (controls: buttons, inputs, chips) · **12** (panels, photo
  thumbnails, stat groups) · **20** (sheets & the record capsule). Nothing else.
- Elevation: none. Depth is `toolbox` vs `iron` plus hairlines. Only the sheet
  scrim shadows.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `mic` (record), `square` (stop), `camera`, `book` (price
book), `rows` (line items), `send`, `signature` (accepted), `card` (deposit),
`pencil` (edit), `flag` (needs pricing), `clock` (follow-up), `check`,
`chevron-right`, `plus`. Nav 22px, inline 18px. **No emoji, anywhere, ever** —
a paid deposit gets `card` + a hi-vis figure, not a money bag.

## Component construction (exact)

- **Primary button:** paper fill, iron text, radius 8, height 48 mobile
  (full-width in thumb zone), Archivo 600 15. Press: scale 0.98 + fill
  `#E4DECF`; disabled `#2C241A` fill, `text-3` text.
- **Secondary:** transparent, 1px hairline, `text`. Press: border `#3D3324`.
- **Quiet action:** text-only, hi-vis, no underline; press dims to 80%.
- **Input:** iron fill, hairline border, radius 8, height 48, 16px text.
  Focus: border hi-vis + 2px offset ring at 25% hi-vis.
- **Chips (job filter: All / Drafts / Sent / Won):** height 36, radius 8,
  hairline; active = hi-vis 1px border + hi-vis text.
- **Stat block:** Label(11) over IPM value — no box, no accent bar. Grouped
  stats may share one `toolbox` panel (radius 12, pad 16), never nested.
- **Line-item rows:** NO boxes. Full-bleed rows ≥56px, 16px vertical padding,
  hairline between: Title(16) item name, mono amount right, Secondary
  ("2 × $170.00 · from 02:14 in walkthrough") in `text-3`. `needs_pricing`
  rows: amber `flag` glyph + amber dashed 1px underline under the empty
  amount — never a filled amber surface.
- **Status pill:** height 28, 6px dot + Label(11): `text-3` "DRAFT", `text-2`
  "SENT", amber "VIEWED", hi-vis "ACCEPTED" and "DEPOSIT PAID" (filled dot +
  check), red "EXPIRED".
- **Record button (the walkthrough capture control):** the one oversized
  control in the product. 72px capsule (radius 20) centered in the bottom
  thumb zone, paper fill, iron `mic` glyph. Recording: fill swaps to iron,
  1.75px hi-vis ring breathing opacity 60→100% over 2s, mono elapsed timer
  beneath, live level meter as a 2px hi-vis hairline widening with input.
  Tap = pause; hold 600ms = end (radial fill confirm). Flanked by `camera`
  (56px, secondary style) — both reachable one-handed.
- **Bottom tab bar:** height 56 + safe-area, `toolbox` at 94% + blur, hairline
  top. Four items (Jobs · Price book · Proposals · Settings) at 22px icons +
  10px Archivo 600 labels; active = `text` + 2px hi-vis dot; inactive = `text-3`.

## The signature — the estimate drafting itself
When a draft opens (or resolves live after a walkthrough), the estimate types
itself: line items enter one row at a time, top to bottom, 24ms stagger, each
row an opacity + 4px x-slide (`ease-out-quart`, 200ms) with the mono amount
landing last. As rows land, the running total odometer-ticks upward — digits
roll vertically with `spring-gentle`, ≤600ms per settle, batched to at most
one roll per 400ms. On **Send proposal**, a 1.5px `hi-vis` underline sweeps
left→right beneath the total in 240ms `ease-out-quart`, then fades over 400ms
— the bid is out. Max 8 rows animate; further rows appear instantly. This is the
entire brand animation — no glow, no confetti. Everything else is state feedback ≤240ms.

## Mobile layout (390×844 — primary spec)

- **Jobs (home):** gutter 20. Top: brand mark + chip row. Stat band: "QUOTED
  THIS WEEK `$18,640`" (hero, `$` hi-vis) over "Avg. time to send `2h 41m`".
  Then Label "JOBS" and hairline rows: "Deleon residence — panel upgrade" ·
  `$4,850.00` right · pill "VIEWED" · Secondary "sent 6:12pm from the
  driveway". Primary **New walkthrough** pinned above the safe-area.
- **Capture:** near-empty screen, iron. Job address in H2; photo thumbnails
  (radius 12) rail as taken; live transcript last line in `text-3` ("...code
  requires a GFCI within six feet of the.."). Record capsule + camera in the
  thumb zone. Per-asset upload state: amber dot = retrying, `check` = landed.
- **Estimate review:** the signature screen. Running total hero, odometer-
  live. Rows type in: "R-410A condenser, 3-ton — `$3,120.00`", "Condenser pad
  replacement — `$340.00`", flagged "Crane lift for roof unit — `needs
  pricing`" (amber flag, dashed underline). Each row's Secondary cites its
  transcript moment. Bottom bar: secondary **Edit items** · primary **Send proposal**.
- **Proposal (homeowner, light theme):** paper ground, contractor logo +
  license block, scope paragraph, photo strip, hairline line-item rows, IPM
  600 total, terms, then ink-filled **Accept & pay deposit**; typed-name
  field beneath. Reads like fine paperwork, not an app.
- **Price book:** search pinned top; category Label headers; hairline rows
  "Breaker, 20A AFCI · each · `$68.00`" with `pencil` on tap. **Add item**
  as a quiet action per category header.

## Responsive
≥768px: Jobs gains a proposal-timeline rail right, stat band becomes three
across, gutters 32. ≥1024px: left rail replaces the tab bar; estimate review
becomes editor-left / live proposal-preview-right (the homeowner's light
page, rendered small); max content width 1120 centered. Capture stays a
phone experience — desktop shows a QR handoff, not a fake desktop recorder.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Row entrances 24ms stagger, opacity + 4px
x-slide only — estimates never bounce. Chips and pills crossfade 150ms. The
record ring breathing is the only ambient motion, and only while recording.
Targets ≥44px, ≥8px apart; record capsule 72px because gloves. Destructive
actions (delete line item, withdraw proposal) are hold-to-confirm (600ms
radial fill). Swipe left on a line item reveals **Remove** (also in the row
overflow — gestures never the only path). Haptics native-only, never load-bearing.

## Reduced motion & fallback
Typed-in rows → all rows present immediately, single ≤100ms opacity fade.
Odometer → direct number swap; send sweep → 100ms hi-vis underline fade;
record ring breathing → static ring. Every animated state (drafting, sent,
accepted, deposit paid) is also plain text in the row and the pill.
