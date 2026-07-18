# StimTrack — Design Specification (redline level)

## Vision
A precision instrument on a porcelain bench. The identity is **Porcelain lab**:
light-first, a cool porcelain-white ground with the faintest warm cast, near-black
ink, hairline grid discipline, and ONE deep marine-viridian accent — the
desaturated green-blue of lab glass over deep water. It reads like the best piece
of clinical equipment in the room: calm, exact, trustworthy at 6 a.m. before a
monitoring appointment. It is emphatically not a fertility-cute app: no pastels,
no baby imagery, no rounded bubbliness. The interface keeps a level voice at all
times — except once. The trigger-shot countdown is the one moment the app raises
its voice, and everything else is quiet so that moment lands.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md fully: no purple (~250–310° banned), no emoji anywhere,
no gradients or glows on controls, single SVG icon set, space-before-boxes,
hairlines not borders, 4px scale, ≤3 radii, real content everywhere, fonts must
load. Native Expo app, iOS-first, 390×844 primary spec. Loss-aware register:
in an ended cycle the accent recedes, semantic color disappears, and copy goes
neutral — the design system itself grieves correctly.

---

## Color — exact values and usage ratios

Light is the hero expression (a lab is lit); dark is the fully specified
lab-at-night companion for 5 a.m. injections and 11 p.m. countdowns. Both ship.

### Light (primary)
| Token | Hex | Use |
|---|---|---|
| `paper` | `#F7F5F1` | The ground. Porcelain with the faintest warm cast — never default grey |
| `card` | `#FFFFFF` | Raised surfaces: framed objects, sheets, the countdown face |
| `hairline` | `#E4E1D8` | 1px grid rules, dividers, framed-object strokes |
| `ink` | `#1B1D1B` | Primary text — near-black with a breath of green-grey |
| `ink-2` | `#5A605B` | Secondary text |
| `ink-3` | `#9AA09A` | Faint: placeholders, disabled, axis labels |
| `viridian` | `#2E6B5C` | THE accent — deep marine-viridian, desaturated sea green-blue. Active states, links, selected chips, chart line, confirmed states, brand. ≤10% of any screen |
| `signal` | `#B4432A` | SEMANTIC ONLY — trigger-shot criticality, overdue doses, the countdown under T−1h. Never decoration, never brand |

Primary button (light ground): `ink` fill, `paper` text.

### Dark — graphite lab-at-night (fully specified)
| Token | Hex | Use |
|---|---|---|
| `paper` | `#161817` | Ground — graphite with a faint green-grey bias, never black |
| `card` | `#1F2220` | Raised surfaces |
| `hairline` | `#31352F` | Dividers & framed-object strokes |
| `ink` | `#ECEDE8` | Primary text — porcelain white, faintly warm |
| `ink-2` | `#A4AAA2` | Secondary text |
| `ink-3` | `#6C726B` | Faint |
| `viridian` | `#5C9E8B` | The same accent lifted to read on graphite — still desaturated, still marine |
| `signal` | `#D96A4E` | Trigger criticality/overdue, lifted for dark contrast |

Primary button (dark ground): `ink` off-white fill, `paper` ink text.

> **Color law (v5):** no purple, no lavender, no framework-default hexes. All
> values are custom-mixed and slightly desaturated. Viridian is anchored in the
> product's real world — lab glassware, deep water, surgical green — and is
> deliberately distinct from MenoCompass's Twilight (teal-ink grounds + amber
> signal): here the ground is porcelain, the accent is a deep sea green, and
> there is no amber anywhere. `signal` exists for exactly one meaning —
> time-criticality (the trigger ladder, overdue doses) — and its scarcity is
> what makes the countdown feel like the app raising its voice.

Hard rules: `viridian` never fills a large surface or a primary button. `signal`
never appears outside criticality contexts — not in charts, not in branding, not
in empty states. In an ended cycle (loss state), both accent and signal are
retired from that cycle's surfaces: its archive renders in ink tones only.
The cycle summary PDF renders as a light paper document (`#FDFCF9` paper,
`#1B1D1B` ink, `#2E6B5C` accents) regardless of app theme — it is read in a
consult room.

## Type — exact specimen

Faces: **Archivo** (600/700, self-hosted variable, OFL) for the display voice —
a precise grotesk with instrument-panel bones; **Inter** (400/500/600) for
UI/body; **JetBrains Mono** (500/600) for every clinical number — doses, E2
values, follicle sizes, dates, and the countdown digits. All bundled via
expo-font; a silent system-font fallback is a failed build.

| Role | Face/weight | Size/lh | Tracking |
|---|---|---|---|
| Display (cycle-day headline, countdown label) | Archivo 700 | 30 / 35 | −0.4 |
| H2 (screen/section titles) | Archivo 600 | 21 / 26 | −0.3 |
| Title (med names, event titles) | Inter 500 | 17 / 22 | 0 |
| Body | Inter 400 | 16 / 24 | 0 |
| Secondary | Inter 400 | 14 / 20 | 0 |
| Label | Inter 600 | 11 / 13 | +0.9, uppercase |
| Data (values, doses, dates) | JBM 500 | 14 / 17 | 0, tabular |
| Big datum (cycle day, E2, follicle count) | JBM 600 | 36 / 36 | 0, tabular |
| Countdown digits (the signature) | JBM 600 | 64 / 64 | 0, tabular |
| Button | Inter 600 | 16 / 16 | 0 |

Minimum body size anywhere is 14. Archivo carries brand at the two largest
roles; everything operational is Inter; **every clinical number in the app is
mono with tabular figures — no exceptions.**

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`. Screen gutter **20**.
- Radii: **8** (controls) · **12** (cards) · **20** (sheets). Nothing else.
- Elevation: none. Depth is `card` on `paper` plus hairline — the porcelain
  bench is flat and lit. The only shadow is the sheet scrim at 45%.
- Hairline grid discipline: section rules run full-bleed; data tables use
  hairline row rules and JBM columns that actually align (tabular figures).

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Glyphs: `syringe` (injection), `pill` (oral), `vial` (labs), `probe` (scan),
`calendar`, `clock` (trigger/timing), `snowflake` (freeze/storage), `bank`
(storage facility), `circle-dots` (follicles), `chart`, `file-text` (summary),
`bell`, `bell-off` (silenced), `check`, `x`, `plus`, `pencil`, chevrons,
`settings`, `lock`, `share`, `archive` (ended cycles). Tab bar 22px, inline
18px. No emoji, ever.

## Component construction (exact)

- **Primary button:** `ink` fill (light) / `ink` off-white fill (dark),
  radius 8, height 52, Inter 600 16. Press: scale 0.98 + selection haptic.
  Disabled: `hairline` fill, `ink-3` text.
- **Secondary:** transparent, 1px hairline, `ink` label. Press: border `ink-2`.
- **Quiet action:** text-only `viridian`; press dims to 75%.
- **Protocol day row (calendar core):** full-bleed, hairline between, min 56px:
  JBM cycle-day column (`CD 7`) left in `ink-3`, event glyph + Title, right JBM
  time. Today's row carries a 2px `viridian` left rule. Trigger day carries a
  2px `signal` left rule and a `clock` glyph — the calendar's only red.
- **Med row:** 64px: kind glyph, med Title + dose/route in JBM Data, right
  next-due JBM or `viridian` check when logged; overdue flips time to `signal`.
  Taken/Skip inline actions, 44px targets.
- **Dose-change marker (chart + timeline):** 1.5px vertical `viridian` rule
  with a 6px square at the top axis and a JBM date label.
- **Scan entry sheet:** radius 20, numeric-first: JBM 36 value fields with unit
  labels, per-ovary follicle chips (JBM sizes, add-chip), lining field. Built
  for a parking-lot entry in under a minute.
- **Trend chart (E2 / lead follicle):** 2px `viridian` line on a hairline grid,
  JBM `ink-3` axis labels, scan-day ticks only, dose-change markers, no junk.
- **Storage card (one of the few true cards):** `card`, radius 12: `snowflake`
  glyph, kind + count in Title, facility Secondary, right column JBM annual fee
  and renewal date; renewal ≤30 days out shows a Label chip `RENEWAL SOON` in
  `ink` on `hairline` (not signal — storage is never an emergency register).
- **Loss-aware end flow:** a plain sheet, ink only, no accent: "End this
  cycle" → typed reason list → single confirmation ("Everything goes quiet
  now."). One press-and-hold, everything silences. The archived cycle renders
  monochrome with an `archive` glyph. No red, no crossed-out imagery, ever.
- **Paywall:** annual card (`card`, viridian hairline, "7 days free" Label)
  above monthly and Cycle Pass; single primary **Start free week**; restore as
  quiet action. No timers, no fake strikethroughs.
- **Bottom tab bar:** height 56 + safe-area, `card` at 96% + blur, hairline
  top. Today / Calendar / Meds / Labs / Settings; active = `ink` icon + 2px
  `viridian` dot.

## The signature — the trigger-shot countdown
The one moment the app raises its voice. Inside T−24h, Today grows a full-width
countdown band; tapping it (or the ladder notification) opens the full-screen
countdown: `card` face on `paper`, "TRIGGER" Label, the clinic-assigned time in
JBM Data, and the remaining time in JBM 600 64 tabular digits ticking every
second — a hairline ring around the face fills clockwise as T−0 approaches.
At T−1h the digits and ring switch from `ink` to `signal` — the only large
signal-colored moment in the product — and the tick gains a soft haptic pulse
each minute. Confirmation is a press-and-hold button (**Hold to confirm —
injected**, 1200ms fill along the button, success haptic); on release the ring
completes in `viridian`, the digits stop, and a JBM timestamp line is written
beneath ("Confirmed 21:32"). The screen then stands down to the calm register.
Reduced motion: no ring animation, no per-second flicker — a static time
display refreshed each minute and a plain confirm button. This countdown is
the screenshot the product is marketed on: **the $20,000 reminder**.

## Mobile layout (390×844 — primary spec)
- **Today:** Display cycle-day headline ("Cycle day 7 — stim day 5") + date;
  the countdown band when inside T−24h; today's protocol events as day rows;
  today's meds with inline Taken/Skip; prep-note quick add ("Ask about the
  Menopur dose"); quiet "Log a scan" action after monitoring events.
- **Calendar:** the day-indexed protocol timeline, past faded, today ruled in
  viridian, trigger day ruled in signal; add/edit event sheet; cycle-phase
  Label headers (STIMULATION · TRIGGER · RETRIEVAL · TRANSFER); switching
  between cycles via a top chip row (history is a Plus surface).
- **Meds:** prescription rows grouped by time of day; dose-change action on
  every row (creates the dated event); the trigger prescription pinned at top
  with its `clock` glyph and exact time; adherence week-dots per med.
- **Labs:** scan list newest-first with JBM value columns; E2 and lead-follicle
  charts with dose-change markers; per-ovary follicle detail on row tap;
  "Cycle summary PDF" action (Plus) rendering the one-page document.
- **Settings:** reminder defaults + quiet hours (with the explicit line
  "Quiet hours never apply to your trigger reminder"), storage tracker,
  export/backup/delete, restore purchases, the reliability explainer ("Try it:
  airplane mode. Everything works."), reference library, End this cycle.

## Dark mode
Same structure, tokens swapped per the tables above — graphite lab-at-night.
The 5 a.m. injection flow belongs to dark: from the notification, Meds opens
pre-scrolled to the due dose with 56px targets — log and back to bed in two
taps, the viridian check the only color. The countdown at night renders its
digits in `ink` off-white until T−1h, then `signal`; screen-dimming is never
fought (no forced brightness).

## Motion
- Standard: 200ms `ease-out` for state, 300ms `ease-in-out` for
  navigation/sheets. Stagger children 20–40ms, ≤8 at once.
- Dose logging: 120ms check settle + selection haptic. No springs on data entry.
- The countdown is the only choreographed sequence (ring fill, per-second tick,
  hold-to-confirm fill). `prefers-reduced-motion` collapses everything to fades
  ≤250ms and replaces the live tick with minute-refresh static text.
- Loss states end all motion: an ended cycle's surfaces do not animate.

## Voice
Level, exact, adult. "Confirmed", "logged", "as instructed by your clinic" —
never "your journey", never cheerleading ("You've got this!" is banned), never
medical advice, no exclamation marks anywhere. The app states times and facts
in mono and lets them carry the weight. Empty states teach: "No scans yet.
After your first monitoring appointment, log E2 and follicle counts here and
they will chart across your cycle." Loss register: plain, warm, brief —
"Everything is quiet now. Your data is kept until you decide otherwise."
