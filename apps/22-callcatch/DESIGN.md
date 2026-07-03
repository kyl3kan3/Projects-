# CallCatch — Design Specification (v3, redline level)

## Vision
A dispatcher's desk that never sleeps, built for people who work with their
hands. The buyer is a plumber or salon owner checking a phone at arm's length
in daylight, so this reads as dependable equipment: high-visibility numerals
at signage weight, work-gear orange rationed to live activity only, and one
recurring truth — a call that would have been lost, visibly caught.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `slate` | `#131A22` | The ground. Every screen. |
| `panel` | `#1B2530` | Job-ticket cards, sheets, grouped panels only |
| `hairline` | `#2A3644` | 1px dividers & borders — never brighter |
| `text` | `#EEF2F6` | Primary text |
| `text-2` | `#8C99A8` | Secondary text |
| `text-3` | `#5B6672` | Faint (missed-call ash, timestamps) |
| `paper` | `#F3F5F7` | **Primary buttons & the money numerals** (slate text on it) |
| `orange` | `#E87722` | THE accent. ≤10% of any screen: live activity ONLY — on-air bar, active call edge, brand mark, active tab |
| `green` | `#3ECF8E` | Money semantic only — recovered value, booked confirmations |
| `cyan` | `#39C7DD` | Rescue semantic only — the text-back reflex line and SMS events |
| `red` | `#F26D6D` | Failures only (call dropped, number unreachable) |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: orange never fills a button or a surface — if nothing is live,
there is no orange on screen; `paper` is the only high-emphasis fill; green
appears only on dollar values and booked states.

## Type — exact specimen

Faces: **Archivo** (700/800, incl. tabular figures) for display and numerals ·
**Inter** (400/500/600) for UI · **IBM Plex Mono** (400/500) for data. All
self-hosted woff2, preloaded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Money numeral (tally) | Archivo 800 | `clamp(48px, 14vw, 64px)` / 1.0 | −0.01em, tabular |
| Display (marketing) | Archivo 800 | `clamp(34px, 9vw, 60px)` / 1.05 | −0.01em |
| H2 (screen title) | Archivo 700 | 24 / 1.15 | 0 |
| Title (ticket caller) | Inter 600 | 17 / 1.3 | 0 |
| Body | Inter 400 | 16 / 1.55 | 0 |
| Secondary | Inter 400 | 13 / 1.45 | 0 |
| Label (stamps, statuses) | Inter 600 | 11 / 1.2 | +0.08em, uppercase |
| Data (durations, times, numbers) | IBM Plex Mono 500 | 13 / 1.2 | 0, tabular figures |
| Button | Inter 600 | 15 / 1 | 0 |

High-visibility rule: the money numeral and primary button text hold AAA
contrast on `slate`; nothing the owner needs is below 16px or below AA.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **10** (controls: buttons, inputs, chips) · **12** (job tickets,
  panels) · **20** (sheets). Nothing else.
- Elevation: none. Depth is `panel` on `slate` plus hairlines; the sheet scrim
  is the only shadow.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `phone-in` (answered), `phone-missed`, `message` (SMS rescue),
`calendar`, `play` (listen), `pause`, `wrench` (job type), `clock` (urgency),
`person`, `chevron-right`, `check`, `settings`, `mic` (test call), `dollar`
(value estimate). Tab bar 22px, ticket stamps 16px. **No emoji, anywhere,
ever** — urgency renders as a mono chip (`URGENT`), job types as Labels.

## Component construction (exact)
- **Primary button:** paper fill, slate text, radius 10, height 48 mobile
  (full-width in thumb zone), Inter 600 15. Press: scale 0.98 + fill
  `#DFE4E9`. Disabled: `#2A3644` fill, `text-3` text. Never orange-filled.
- **Secondary:** transparent, 1px hairline, `text`. Press: border `#3A4756`.
- **Quiet action:** text-only orange (live contexts) or `text-2`; press 80%.
- **Job-ticket card (activity feed):** `panel` fill, radius 12, hairline
  border, padding 16, min-height 88. Row 1: caller ("Mrs. Alvarez —
  (512) 555-0198" Title 17) + mono time right (`14:32`). Row 2: Label stamps
  on a hairline chip row — `WATER HEATER` · `URGENT` · est. value in green
  mono (`~$850`). A live ticket (call in progress) carries a 2px orange left
  edge — the only ticket decoration.
- **On-air bar:** 44px, pinned top, `panel` at 94% + blur, 2px orange bottom
  edge; caller number mono, live transcription ticker 13/`text-2` (one line,
  batched), 44px "Listen" with `play`, joins muted.
- **Rescue timeline row:** missed event (ash `phone-missed`) → a 24px cyan
  reflex line (2px, drawn left→right 200ms) → SMS event (cyan `message`,
  `+5s` mono). The $99-tier hero, rendered in the feed exactly like this.
- **Rocker toggle:** 52×32, radius 10 (not pill), paper knob; flip snaps
  `spring-snappy` with a 1-frame orange arc at the hinge.
- **Transcript (call detail):** two-column dispatch log — caller left in
  `text`, AI right in `text-2`, hairlines between turns, mono timestamps;
  confidence-gated moments flagged inline: Label `TOOK A MESSAGE` +
  "pricing beyond profile" 13/`text-3`. Lives in its own scroll container.

## The signature — the catch
Every real caught call lands in the feed with one firm, restrained move: the
ticket slides up 16px and settles with `spring-snappy` (stiffness 400, damping
34) plus a 1px overshoot nudge — the weight of a ticket hitting a spike. Its
fields then stamp in as the AI captures them — job type, urgency, value — each
120ms (opacity 0→1, scale 0.96→1), 80ms apart, in capture order. The monthly
recovered value rolls up once, 600ms `ease-out-quart`, green. No mascot, no
confetti; the snap is the whole feeling, 60fps on a cheap Android.

## Mobile layout (390×844 — primary spec)
- **Nav:** bottom tab bar 56px + safe-area (`phone-in` Activity · `check`
  Caught · `calendar` Calendar · `settings` Setup), 22px glyphs, 10px Inter
  600 labels; active = `text` + 2px orange dot.
- **Home (money screen):** top third is the tally — Label `CAUGHT THIS MONTH`,
  Archivo 800 numeral `31` in paper, then `≈ $11,400 recovered` in green mono
  16 — legible at arm's length. Beneath: the activity feed, newest first,
  job-ticket cards at 12px gaps. On-air bar docks above it all when live.
- **Call detail:** header (caller, mono duration `4:12`), audio scrubber with
  a speaker-colored waveform (caller `text-2`, AI orange @60%), the dispatch
  log, then a full-width 48px primary "Call back" in the thumb zone.
- **Setup wizard:** business profile as a laminated info card (`panel`, radius
  12) filling field-by-field; vertical packs as hairline rows — "Plumbing kit
  — 42 FAQs loaded" with a mono count; final step is the test call: a 48px
  primary "Call my AI" with `mic`, and the live transcript appearing below —
  the trust moment, staged.

## Responsive
Phone-first. ≥768px: the feed sits beside the calendar strip and on-air dock,
gutters 32; setup gains a live preview pane. ≥1024px: max width 1120 centered.
The marketing hero runs a recorded demo-call player styled as a job ticket —
real audio with a mono transcript, never a rendered scene — above the plain
question "How many calls did you miss this week?".

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Ticket arrival `spring-snappy`; field stamps
`dur-micro`; value roll-up once per session. On-air bar's orange edge pulses
opacity 60→100% at speech cadence (never faster than 1Hz). Rescue reflex line
draws 200ms. Targets ≥44px; primary actions full-width in the thumb zone;
haptic tick on a new catch (push-driven). Every gesture has a button.

## Reduced motion & fallback
Catch snap → ticket appears in place with a one-frame cyan flash on new items.
Field stamps → all fields render at once. Value roll-up → direct set + green
flash. On-air ticker → batched line swaps; edge pulse off. Every number and
state is fully readable with zero motion.
