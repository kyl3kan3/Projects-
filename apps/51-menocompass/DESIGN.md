# MenoCompass — Design Specification (redline level)

## Vision
A lit clinical instrument, read in a dim room. The identity is **Twilight**: deep
teal-ink grounds, one warm amber-gold signal glowing like a dial, data set in
tabular mono. It is dark-first by conviction — hormonal insomnia and the 3 a.m.
night-sweat log are the product's home turf, and the interface should feel like
an instrument you can read half-asleep without being blinded. It is emphatically
not a wellness app: no pink, no soft pastels, no literary serif, nothing cute.
It reads as *credible* — the register of a precision medical tool a good clinician
would trust — while staying warm enough for a frightened, exhausted user at 3 a.m.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md fully: no purple (~250–310° banned), no emoji anywhere,
no gradients/glows on controls (one exception: a faint amber halo on a *selected*
check-in tile, ≤1 per screen, is the single sanctioned glow), single SVG icon set,
space-before-boxes, hairlines not borders, 4px scale, ≤3 radii, real content
everywhere, fonts must load. Native Expo app, iOS-first, designed for readers over
44 — generous sizes, high contrast, big targets (brain fog is a documented symptom;
the UI compensates for it).

---

## Color — exact values and usage ratios

Dark is the hero expression; light is the first-class daytime companion. Both ship.

### Dark (primary)
| Token | Hex | Use |
|---|---|---|
| `paper` | `#0E1618` | The ground. Deep teal-ink, never black. Every screen |
| `card` | `#16232A` | Raised surfaces: tiles, rows, wells |
| `hairline` | `#26383E` | 1px dividers & framed-object strokes |
| `ink` | `#E9F1EE` | Primary text (soft, faintly cool white) |
| `ink-2` | `#93A8A8` | Secondary text |
| `ink-3` | `#5C7176` | Faint: placeholders, disabled, axis labels |
| `ember` | `#E8A552` | THE signal — amber-gold. Active states, selected severity, dose-change markers, links, brand. ≤10% of any screen |
| `sage` | `#6FB79A` | Semantic "logged / taken" only |
| `claret` | `#E0755F` | Semantic "skipped / missed" only |

Primary button (dark ground): `ink` off-white fill, `paper` ink text.

### Light (daytime)
| Token | Hex | Use |
|---|---|---|
| `paper` | `#F1F4F3` | Ground — cool off-white with a faint teal bias (chosen, not default grey) |
| `card` | `#FFFFFF` | Raised surfaces |
| `hairline` | `#DBE4E2` | Dividers |
| `ink` | `#12201F` | Primary text — deep teal-ink |
| `ink-2` | `#4E605D` | Secondary |
| `ink-3` | `#8A9E9A` | Faint |
| `ember` | `#B26A12` | The same amber signal, deepened to an ochre that reads on white |
| `sage` | `#3C7B61` | Taken |
| `claret` | `#BB4E37` | Missed |

Primary button (light ground): `ink` fill, `paper` text.

> **Color law (v5):** no purple, no lavender, no framework-default hexes. All values
> are custom-mixed and slightly desaturated. The amber signal is grounded in the
> product's real world — heat, the hot flash reclaimed as a lit indicator — not a
> Tailwind orange. Severity is encoded as ember at four weights (0 = hairline
> outline, 1 = 30%, 2 = 60%, 3 = 100%): one hue, four opacities, learnable at a glance.

Hard rules: `ember` never fills a large surface or a primary button. Severity dots
and dose-change markers are the accent's main home. Semantic `sage`/`claret` carry
meaning only, never decoration. The printed doctor report is the deliberate
exception to the whole palette — it renders as a **light paper document** (cream
`#FBF8F1`, ink `#1B2A28`, ochre `#B26A12` accents) regardless of app theme, because
a clinician reads it on paper.

## Type — exact specimen

Faces: **Bricolage Grotesque** (600/700, self-hosted variable) for the display
voice — technical, warm, un-literary; **Inter** (400/500/600) for UI/body;
**JetBrains Mono** (500/600) for data. All bundled via expo-font; a silent
system-font fallback is a failed build.

| Role | Face/weight | Size/lh | Tracking |
|---|---|---|---|
| Display (greetings, report title) | Bricolage 700 | 30 / 35 | −0.4 |
| H2 (screen/section titles) | Bricolage 600 | 21 / 26 | −0.3 |
| Title (symptom, med names) | Inter 500 | 17 / 22 | 0 |
| Body | Inter 400 | 16 / 24 | 0 |
| Secondary | Inter 400 | 14 / 20 | 0 |
| Label | Inter 600 | 11 / 13 | +0.9, uppercase |
| Data (values, dates, gaps) | JBM 500 | 14 / 17 | 0, tabular |
| Big datum (cycle gap) | JBM 600 | 36 / 36 | 0, tabular |
| Button | Inter 600 | 16 / 16 | 0 |

Minimum body size anywhere is 14. Bricolage carries brand at the two largest
roles; everything operational is Inter; everything numeric is mono.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`. Screen gutter **20**.
- Radii: **10** (controls) · **14** (cards) · **22** (sheets). Nothing else.
- Elevation: none in light; in dark, depth is `card` lifted off `paper` plus
  hairline. The only shadow is the sheet scrim at 45%.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Glyphs: `flame` (vasomotor), `moon` (sleep), `cloud` (mood/fog), `bolt` (energy),
`drop` (cycle), `heart` (physical), `patch`, `pill`, `vial` (labs), `chart`,
`file-text` (report), `bell`, `check`, `x`, `plus`, chevrons, `settings`, `lock`,
`share`, `calendar`. Tab bar 22px, inline 18px. No emoji, ever.

## Component construction (exact)

- **Primary button:** `ink` off-white fill (dark) / `ink` fill (light), `radius 10`,
  height 52, Inter 600 16. Press: scale 0.98 + `buttonPressed` fill + selection
  haptic. Disabled: `hairline` fill, `ink-3` text.
- **Secondary:** transparent, 1px hairline, `ink` label. Press: border `ink-3`.
- **Quiet action:** text-only `ember`; press dims to 75%.
- **Check-in tile (core control):** `card`, radius 10, min-height 64, 2-col grid;
  domain glyph in `ink-2`, symptom Title 17, right-aligned 4-dot severity row
  (ember outline/30/60/100%). Selected: 1.5px ember stroke **plus the one
  sanctioned faint ember halo**. Logged-today: glyph turns `sage`. On dark this
  glow is the screen's focal warmth.
- **Medication row:** full-bleed, hairline between, 64px: kind glyph, med Title +
  dose Secondary, right JBM next-due or `sage` check; overdue in `claret`.
- **Dose-change marker (chart signature):** 1.5px vertical ember rule with a 6px
  diamond at the top axis and a JBM date label. Every trend chart draws them.
- **Trend chart:** 2px `ink` line on a hairline grid, JBM `ink-3` axis labels,
  weekly ticks only, no chart junk.
- **Heat strip:** rows of 12–16px rounded-2px squares, severity opacity ramp in
  ember over `card`; the at-a-glance 90-day object, also embedded in the report.
- **Insight card:** `card`, Label "OBSERVED" in ember, Body with the delta figure
  in JBM ember, footer "Correlation, not causation — bring it to your clinician."
- **Paywall:** annual card (`card`, ember hairline + faint ember glow, "7 days free"
  Label) above monthly; single primary **Start free week**; restore as quiet action.
  No timers, no fake strikethroughs.
- **Bottom tab bar:** height 56 + safe-area, `card` at 96% + blur, hairline top.
  Today / Trends / Meds / Report / Settings; active = `ink` icon + 2px ember dot.

## The signature — the report render
Tapping **Generate report** slides the sheet up and typesets the page top-to-bottom
over 900ms — title, heat-strip rows sweeping in at 60ms stagger, sparklines drawing
along their paths, the regimen table fading up — like watching a lab print. On the
dark app, the light paper report rising into view is the visual: warmth and
authority emerging from the teal dark. Then the share button arms (ember).
Reduced motion: the assembled page fades in at 250ms. This is the entire brand
animation and the screenshot the product is marketed on.

## Mobile layout (390×844 — primary spec)
- **Today:** Display greeting + date; yesterday-prefill notice; check-in grid of
  active symptoms; "Today's meds" rows with inline Taken/Skip; cycle quick-log;
  quiet "Add a note about today."
- **Trends:** 7/30/90-day chips; heat strip first; per-symptom charts sorted by
  recent severity with dose-change markers; cycle section — gap chart + JBM big
  datum + "IRREGULAR IS NORMAL HERE"; insight cards (Plus).
- **Meds:** regimen cards with adherence week-dots + change-dose (timeline event);
  labs table + add-result.
- **Report:** the page-object preview; date-range chips; **Generate report** →
  signature render → share sheet. Free tier: preview blurred with the paywall over it.
- **Settings:** reminders, Apple Health, export/backup/delete, the privacy explainer
  ("Try it: airplane mode. Everything works."), restore, the cited education guide.

## Light mode
Same structure, tokens swapped per the tables above. The amber signal deepens to
ochre for contrast on white. The 3 a.m. use case belongs to dark: from a
notification, the check-in opens pre-scrolled to night sweats with 56px severity
tiles — log and back to sleep in two taps, the amber dots the only bright thing.

## Motion
- Standard: 200ms `ease-out` for state, 300ms `ease-in-out` for navigation/sheets.
- Severity taps: 120ms opacity step + selection haptic. No springs on data entry.
- The report render is the only choreographed sequence. `prefers-reduced-motion`
  collapses everything to fades ≤250ms.

## Voice
Plain, adult, evidence-flavored. "Observed", "logged", "since your dose change" —
never "your journey", never exclamation marks, never medical advice. Empty states
teach: "No labs yet. When you get bloodwork, log it here and it will chart beside
your symptoms."
