# SafetyDeck — Design Specification (v5, redline level)

## Vision
A jobsite at 6:40am: dark, cold, and about to get busy. SafetyDeck is warm
near-black grounds, industrial type, mono timestamps, and one hard-hat yellow
rationed to the things that keep people safe — the active talk, the signature
line, the expiring cert. The interface must work with gloves, in glare, with
one bar of signal or none.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `tarmac` | `#17150F` | The ground. Every screen — warm pre-dawn black |
| `panel` | `#211E15` | Talk cards, incident sheets, cert matrix frame only |
| `hairline` | `#2D2A1D` | 1px dividers & card borders — never brighter |
| `text` | `#F0EDE3` | Primary text |
| `text-2` | `#A39D8A` | Secondary text |
| `text-3` | `#6B665A` | Faint (timestamps, placeholders) |
| `paper` | `#F4F1E6` | **Primary buttons** (tarmac text), key numerals |
| `hardhat` | `#D9A62E` | THE accent. ≤10% of any screen: active-talk marker, the signature line, links, focus rings, the sign-off stamp |
| `green` | `#4E9B6B` | Signed / compliant / valid only |
| `orange` | `#C4703B` | Expiring soon / talk missed only |
| `red` | `#C1503F` | Expired / recordable incident / overdue only |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: `paper` is the only high-emphasis fill; `hardhat` never fills a
button or a surface and never carries semantic meaning (warning states are
`orange`/`red` — the accent stays brand-only). Committed to the single dark
world: the crew flow runs pre-dawn and the binder PDFs are the light
artifacts; there is no light app theme in v1, by choice.

## Type — exact specimen

Faces: **Barlow** (400/500/600 — DIN-descended, made for signage) for display
and UI · **IBM Plex Mono** (500) for every timestamp, count, case number, and
expiry date. Both self-hosted woff2, preloaded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (marketing hero) | BA 600 | `clamp(32px, 8.5vw, 56px)` / 1.08 | −0.01em |
| Hero stat (crew count) | IPM 500 | `clamp(32px, 9vw, 44px)` / 1.05 | 0, tabular |
| H2 (screen title) | BA 600 | 22 / 1.2 | −0.01em |
| Title (talk/employee row) | BA 600 | 16 / 1.3 | 0 |
| Body (talk text) | BA 400 | 17 / 1.6 | 0 — read aloud outdoors, one size up |
| Secondary | BA 400 | 13 / 1.45 | 0 |
| Label | BA 600 | 11 / 1.2 | +0.08em, uppercase |
| Data / dates / counts | IPM 500 | 13 / 1.2 | 0, tabular figures |
| Button | BA 600 | 16 / 1 | 0 — crew buttons one size up, gloves |

Talk body text is the one deliberate oversize in the portfolio: it is read
aloud to a circle of people in daylight glare.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **8** (controls: buttons, inputs, chips) · **12** (talk cards,
  incident sheets) · **20** (sheets, photo viewers). Nothing else.
- Elevation: none. Depth is `panel` on `tarmac` plus hairlines; only the
  sheet scrim shadows.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `megaphone-flat` (talks), `clipboard-cross` (incidents),
`card-badge` (certs), `binder-rings` (binder), `gear` (settings), `pen-line`
(sign), `camera`, `map-pin`, `clock-eight`, `cloud-off` (offline), `cloud-up`
(syncing), `check`, `alert-triangle`, `download`, `chevron-right`, `plus`.
Nav renders at 22px, inline at 18px; crew-flow icons at 24px (gloves).
**No emoji, anywhere, ever** — a completed sign-off gets `check`, not a
thumbs-up.

## Component construction (exact)

- **Primary button:** `paper` fill, `tarmac` text, radius 8, height 52 in the
  crew flow / 48 in the dashboard (full-width in thumb zone), BA 600 16.
  Press: scale 0.98 + fill `#E2DFD0`. Disabled: `#2A2718` fill, `text-3` text.
- **Secondary:** transparent, 1px hairline, `text`. Press: border `#3A3624`.
- **Quiet action:** text-only, `hardhat`, no underline; press dims to 80%.
- **Input:** `tarmac` fill, hairline border, radius 8, height 48, 16px text.
  Focus: border `hardhat` + 2px offset ring at 25% hardhat.
- **Offline banner:** full-width `panel` strip under the header, `cloud-off`
  glyph + "Working offline — 3 sign-offs will sync" in Secondary. Never a
  modal, never red: offline is a normal state here.
- **Talk card (crew flow):** `panel`, radius 12, padding 20: hazard Label
  ("FALL PROTECTION · 5 MIN"), talk Title, Body text at 17/1.6. A 2px
  `hardhat` left border marks the active talk — the accent's main home.
- **Signature pad:** full-width, height 160, `tarmac` fill, hairline border,
  radius 8; a 1px `hardhat` baseline rule with the employee's name in
  Label beneath — you sign *on the yellow line*. Strokes render in `text`.
  Clear (quiet action) and **Sign** (primary) beneath.
- **Roster rows (sign-off queue):** NO boxes. Full-bleed rows ≥56px, hairline
  between: Title(16) name, mono status right — `green` check + "07:12" when
  signed, `text-3` "waiting" otherwise.
- **Attendance matrix (dashboard):** `panel` frame, radius 12, in its own
  `overflow-x:auto` track: rows = employees, columns = weeks, cells 24px —
  `green` filled dot signed, `text-3` ring absent, `orange` ring talk missed.
  Mono week labels.
- **Cert rows:** hairline rows: Title name + cert Label, mono expiry right
  ("EXPIRES 08/14/26"), status dot left (`green`/`orange`/`red`). Expired
  rows also get a 2px `red` left border.
- **Incident intake:** one question per screen, Body-size question, big
  option buttons (height 52), rule text cited in Secondary beneath; progress
  as mono "4/9" — never a percent bar.
- **Status pill:** height 28, 6px dot + Label(11): `green` "SIGNED" /
  "VALID", `orange` "EXPIRING" / "MISSED", `red` "EXPIRED" / "RECORDABLE".
- **Bottom tab bar (dashboard):** height 56 + safe-area, `panel` 94% + blur,
  hairline top: megaphone-flat / clipboard-cross / card-badge / binder-rings
  at 22px + 10px labels; active = `text` + 2px `hardhat` dot; inactive =
  `text-3`. The crew flow has NO tab bar — it is a single linear task.

## The signature — the sign-off stamp
When a crew member signs and taps **Sign**: their ink strokes replay once
(SVG stroke-dashoffset draw, ≤400ms, `ease-out-quart`), then a mono timestamp
stamps in beneath the baseline (`07:12 · MAR 16`) with a single 4px settle
(`spring-snappy`), the roster row flips to its `green` check, and the header
counter ticks "6 OF 9 SIGNED". When the last crew member signs, the talk
card's `hardhat` left border sweeps top→bottom once (300ms) and the completed
state reads "CREW SIGNED · 07:19". That is the entire brand animation — the
record becoming real. No confetti, no badge rain. Everything else is state
feedback ≤240ms.

## Mobile layout (390×844 — primary spec)
- **Crew flow (the product):** linear, no nav. 1) Talk screen: hazard label,
  title, body at 17/1.6, huddle-photo button, **Start sign-off** primary in
  thumb zone. 2) Roster: tap-your-name rows. 3) Signature pad per person,
  auto-advancing through the queue. 4) Done screen: "8 of 8 signed · 07:19",
  sync status line (`cloud-up` or `cloud-off` + queued count). Offline banner
  whenever applicable.
- **Dashboard home (talks tab):** Label "THIS WEEK" + mono compliance stat
  ("11 OF 12 CREWS SIGNED"), then crew rows: Title crew name, mono
  talk/status, `orange` dot on missed. Thumb-zone primary: **Send this
  week's talk**.
- **Incidents:** case rows (mono case number, employee, date, RECORDABLE
  pill where derived); primary **Log incident** starts the one-question-
  per-screen intake; severe answers surface the 8/24-hour duty screen with
  the deadline clock in mono.
- **Certs:** the cert rows grouped by soonest expiry; filter chips (All /
  Expiring / Expired); primary **Add cert** (camera-first: photo the card,
  then type the dates).
- **Binder:** date-range chips (12 months / YTD / custom), contents manifest
  as hairline checklist rows, primary **Export binder**; past exports listed
  with mono dates beneath.

## Responsive
≥768px: dashboard becomes two-pane (list + detail); attendance matrix gains
visible weeks; gutters 32. ≥1024px: left rail replaces the tab bar; the cert
matrix and 300 log render as full tables; max content width 1120. The crew
flow stays a single centered column at every size — it is a phone flow even
on a tablet. No desktop spectacle.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Rows enter with 24ms stagger, opacity + 4px
y-slide only. Sync states crossfade 150ms (`cloud-off` -> `cloud-up` ->
check). The signature pad has zero latency budget: strokes render
immediately, no smoothing animation. Targets ≥48px in the crew flow (gloves),
≥44px elsewhere, ≥8px apart; destructive actions (delete cert, void
sign-off — appends a correction, never erases) are hold-to-confirm 600ms.
Pull-to-refresh re-checks the outbox. Haptic on stamp settle, native only,
never load-bearing.

## Reduced motion & fallback
Signature replay → strokes appear complete, timestamp fades in ≤100ms.
Counter ticks → direct swap. Border sweep → instant full border. Stagger →
≤100ms opacity fade. Sync/offline states are always text + glyph, never
motion-only; the signed/missed/expired states are always readable as plain
text in the row.
