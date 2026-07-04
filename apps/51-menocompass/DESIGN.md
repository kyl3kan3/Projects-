# MenoCompass — Design Specification (redline level)

## Vision
A clinical instrument with warmth — the design register of a beautifully typeset lab notebook, not a wellness app. Calm warm neutrals, one ember accent, data marks drawn like a medical chart a good doctor would hand you. Nothing cutesy, nothing pastel-pink "for her," and absolutely nothing purple. The product must read as *credible* at arm's length: this audience trusts paper, clinicians, and evidence — the UI borrows their materials.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md fully: no purple (~250–310° banned), no emoji anywhere, no gradients/glows on controls, single SVG icon set, space-before-boxes, hairlines not borders, 4px scale, ≤3 radii, real content everywhere, fonts must load. Native Expo app, iOS-first, designed for readers over 44 — generous sizes, high contrast, big targets (brain fog is a documented symptom; the UI compensates for it).

---

## Color — exact values and usage ratios

Light mode is primary (this demographic reads in daylight); dark mode is a first-class night companion (3 a.m. night-sweat logging).

| Token | Light | Dark | Use |
|---|---|---|---|
| `paper` | `#F7F4EE` | `#171512` | The ground. Every screen. Warm, never pink |
| `card` | `#FFFDF9` | `#1F1C18` | Elevated surfaces: check-in tiles, report preview |
| `hairline` | `#E3DDD2` | `#332E27` | 1px dividers & framed-object strokes |
| `ink` | `#26221C` | `#EDE8DF` | Primary text |
| `ink-2` | `#6E675C` | `#9C9486` | Secondary text |
| `ink-3` | `#A39B8D` | `#635C51` | Faint: placeholders, disabled, axis labels |
| `ember` | `#B4552D` | `#D06A3E` | THE accent, ≤10% of any screen: active states, selected severity, dose-change markers, links, the brand mark |
| `sage` | `#5E7A5A` | `#7C9877` | Semantic "logged/taken" only — never decorative |
| `claret` | `#8C3A31` | `#B0524A` | Semantic "skipped/missed" only, sparing; destructive confirms via system dialog |

> **Color law (v5):** no purple, no lavender, no framework-default hexes. All values above are custom-mixed and slightly desaturated — ember is a terracotta anchored in the product's real world (warmth, heat, the hot flash made useful), not a Tailwind orange.

Hard rules: `ember` never fills a large surface or a primary button; primary buttons are `ink` fill with `paper` text (light mode) / `paper` fill with ink text (dark). Severity is encoded as ember at 4 opacities (0 = hairline outline only, 1 = 30%, 2 = 60%, 3 = 100%) — one hue, four weights, learnable at a glance.

## Type — exact specimen

Faces: **Source Serif 4** (400/600, self-hosted) for editorial and report headings · **Inter** (400/500/600) for UI · **JetBrains Mono** (500) for data. All bundled via expo-font; a silent system-font fallback is a failed build.

| Role | Face/weight | Size/lh | Tracking |
|---|---|---|---|
| Display (screen greetings, report title) | Source Serif 4 600 | 28 / 1.25 | 0 |
| H2 (section titles) | Inter 600 | 20 / 1.25 | −0.01em |
| Title (symptom names, med names) | Inter 500 | 17 / 1.3 | 0 |
| Body | Inter 400 | 16 / 1.5 | 0 |
| Secondary | Inter 400 | 14 / 1.45 | 0 |
| Label | Inter 600 | 11 / 1.2 | +0.08em, uppercase |
| Data (values, dates, gaps) | JBM 500 | 14 / 1.2 | 0, tabular figures |
| Big datum (cycle gap, streak of days logged) | JBM 500 | 34 / 1.0 | 0, tabular |
| Button | Inter 600 | 16 / 1 | 0 |

Minimum body size anywhere is 14 — this app is never set small.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`. Screen gutter **20**.
- Radii: **10** (controls: buttons, chips, severity tiles) · **14** (cards) · **22** (sheets). Nothing else.
- Elevation: none. Depth = `card` on `paper` + hairline. The only shadow is the sheet scrim at 35%.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor. Required glyphs: `flame` (vasomotor), `moon` (sleep), `cloud` (mood/fog), `bolt` (energy), `drop` (cycle), `heart` (physical), `patch` (a rounded square with a peel corner), `pill`, `vial` (labs), `chart`, `file-text` (report), `bell`, `check`, `x`, `plus`, `chevron-left/right/down`, `settings`, `lock` (privacy), `share`, `calendar`. Tab bar 22px, inline 18px. No emoji, ever — symptom domains get drawn glyphs.

## Component construction (exact)

- **Primary button:** `ink` fill, `paper` text, radius 10, height 52, Inter 600 16. Press: scale 0.98 + fill `#3A3429` + `Haptics.selectionAsync`. Disabled: `hairline` fill, `ink-3` text.
- **Secondary:** transparent, 1px hairline, `ink` label. Press: border `ink-3`.
- **Quiet action:** text-only `ember`; press dims to 75%.
- **Check-in tile (the core control):** `card`, radius 10, min-height 64, full-width rows in a 2-col grid; domain glyph in `ink-2`, symptom Title 17, and a right-aligned **severity dot row** — four 12px circles (outline, 30%, 60%, 100% ember). Tapping the tile cycles severity; tapping a dot sets it directly. Selected state: 1.5px ember stroke on the tile. Logged-today: glyph turns `sage`.
- **Medication row:** full-bleed, hairline between, 64px: kind glyph, med Title + dose Secondary ("Estradot 50µg · patch, Mon & Thu"), right side JBM next-due ("Thu 08:00") or `sage` check when taken. Overdue: JBM time in `claret`.
- **Dose-change marker (the chart signature):** a 1.5px vertical ember rule through the plot with a 6px diamond at the top axis and a JBM date label. Every trend chart draws them; tapping opens the regimen event.
- **Trend chart:** 2px `ink` line or 6px-gap ember bars on a hairline grid, JBM axis labels in `ink-3`, no chart junk — no legends where one series is obvious, no gridline clutter, weekly ticks only.
- **Heat strip (calendar):** 12 columns × N week-rows of 16px rounded-2px squares, severity opacity ramp in ember; the at-a-glance "your last 90 days" object, also embedded in the report.
- **Insight card:** `card` radius 14, Label "OBSERVED", Body copy with the delta figure in JBM ember, footer Secondary "Correlation, not causation — bring it to your clinician." Never a recommendation.
- **Paywall:** one screen — Display line, three Body benefit rows (report, HRT engine, insights) each with glyph, annual card (`card`, ember hairline, "7 days free" Label) above monthly (plain hairline), single primary button **Start free week**, restore as quiet action. No countdown timers, no strikethrough fake prices — credibility is the brand.
- **Bottom tab bar:** height 56 + safe-area, `paper` at 96% + blur, hairline top. **Today / Trends / Meds / Report / Settings**; active = `ink` icon + 2px ember dot, inactive = `ink-3`.

## The signature — the report render
The one branded moment: tapping **Generate report** slides the sheet up and *typesets the page in front of you* — over 900ms the report assembles top-to-bottom (title, heat strip rows sweep in left-to-right at 60ms stagger, sparklines draw along their paths, the regimen table fades up), like watching a lab print. Then a beat, then the share button arms (ember). Reduced motion: the assembled page simply fades in at 250ms. This animation is the screenshot, the TikTok clip, and the reason the report feels like an artifact rather than an export.

## Mobile layout (390×844 — primary spec)
- **Today:** Display greeting with date ("Tuesday, March 4"); yesterday-prefill notice when applied (Secondary, one line); the check-in grid of the user's active symptoms; below, "Today's meds" — medication rows with inline Taken/Skip; footer quiet action "Add a note about today."
- **Trends:** segmented chips (7/30/90 days); the heat strip first (whole-picture), then per-symptom charts sorted by recent severity, dose-change markers throughout; cycle section at bottom — gap chart + JBM big datum ("Current gap: 47 days") and the honest Label "IRREGULAR IS NORMAL HERE".
- **Meds:** regimen list; "Change dose or schedule" per med (creates the timeline event); adherence week-strip per med (7 dots, sage/claret/hairline); labs section beneath — table rows + "Add result."
- **Report:** preview of the one-pager as a scaled page object on `paper` (it looks like a document, hairline-framed); date-range chips; **Generate report** primary → signature render → share sheet. Free tier sees the page blurred at 8px with the paywall card over it — the report sells itself.
- **Settings:** reminders, Apple Health (Plus), export/backup, delete-all-data (system confirm), privacy explainer ("Try it: airplane mode. Everything works."), restore purchases, about + citations.

## Dark mode
Same structure, tokens swapped per the table. Ember shifts one step lighter for contrast. The 3 a.m. use case: from a notification, the check-in screen opens pre-scrolled to night sweats with the severity row enlarged (56px tiles) — log and back to sleep in two taps.

## Motion
- Standard: 200ms `ease-out` for state, 300ms `ease-in-out` for navigation/sheets.
- Severity taps: 120ms opacity step + selection haptic. No springs on data entry.
- The report render (above) is the only choreographed sequence. `prefers-reduced-motion` collapses everything to fades ≤250ms.

## Voice
Plain, adult, evidence-flavored. "Observed", "logged", "since your dose change" — never "your journey", never exclamation marks, never medical advice. Empty states teach: "No labs yet. When you get bloodwork, log it here and it will chart beside your symptoms."
