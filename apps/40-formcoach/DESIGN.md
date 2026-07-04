# FormCoach — Design Specification (v3, redline level)

## Vision
A garage gym at night, chalk on iron. FormCoach looks like the place it lives:
near-black rubber and steel, chalk-white numerals, and one plate-red accent
that appears only where the bar drifted. The wow is the traced bar path over
your own footage — everything around it stays quiet enough to read between
sets with a heart rate of 150.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load. Native Expo app (Reanimated 3 + Skia +
expo-haptics).

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `iron` | `#151314` | The ground. Every screen — a single dark world |
| `rubber` | `#1D1B1C` | Rep cards, sheets, the review filmstrip only |
| `hairline` | `#2B2829` | 1px dividers & framed-object borders — never brighter |
| `text` | `#F0EDE9` | Primary text |
| `text-2` | `#9B948E` | Secondary text, meta |
| `text-3` | `#5F5A56` | Faint (placeholders, expired clips) |
| `chalk` | `#F4F1EC` | **Primary buttons** (iron text), timer + load numerals, the ideal-path guide line |
| `plate` | `#C24747` | THE accent. ≤10% of any screen: brand mark, fault markers, the bar-path deviation, active tab dot, links |
| `amber` | `#D9A03F` | Marginal states only (framing marginal, borderline depth) |
| `green` | `#4E9B6F` | Clean-rep confirmation only |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: plate never fills a button or a surface; `chalk` is the only
high-emphasis fill; amber/green appear only where they mean marginal or clean.
No glows — a PR gets the bar-path trace, not fireworks. Single dark world by
choice: gyms are not daylight products.

## Type — exact specimen

Faces: **Archivo** (500/600/700, incl. condensed widths for display) for UI ·
**JetBrains Mono** (500/600) for every load, rep count, timer, and metric.
Both bundled with the app — no silent system fallback.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (load numeral) | JBM 600 | `clamp(40px, 11vw, 56px)` / 1.0 | 0, tabular; unit at 45% size |
| H2 (screen title) | Archivo 700 | 22 / 1.15 | −0.01em |
| Title (row/card) | Archivo 600 | 16 / 1.3 | 0 |
| Body (cue text) | Archivo 500 | 16 / 1.5 | 0 |
| Secondary | Archivo 500 | 13 / 1.45 | 0 |
| Label | Archivo 600 | 11 / 1.2 | +0.08em, uppercase |
| Data (metrics, dates) | JBM 500 | 13 / 1.2 | 0, tabular figures |
| Rest timer | JBM 500 | `clamp(32px, 9vw, 44px)` / 1.0 | 0, tabular |
| Button | Archivo 700 | 15 / 1 | 0 |

All loads and metrics mono tabular: `142.5 kg`, `REP 4 · −4 CM`, `90 SEC`.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **10** (controls: buttons, inputs, chips) · **14** (rep cards, clip
  frames) · **24** (sheets). Nothing else.
- Elevation: none. Depth is `rubber` on `iron` plus hairlines; only the sheet
  scrim shadows.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `barbell` (record), `path` (a traced J-curve line), `list`
(log), `trend` (progress), `camera-level` (framing), `play`, `pause`,
`scrub-handle`, `check`, `alert-flag` (risk), `share`, `chevron-right`,
`plus`, `gear`, `lock` (premium). Tab bar at 22px, inline at 18px. **No
emoji, anywhere, ever** — a PR is a chalk numeral and a clean trace, never a
flexed arm.

## Component construction (exact)

- **Primary button:** `chalk` fill, `iron` text, radius 10, height 52,
  full-width in the thumb zone, Archivo 700 15. Press: scale 0.98 + fill
  `#E2DED7` + `Haptics.selectionAsync`. Disabled: `#332F30` fill, `text-3`
  text.
- **Secondary:** transparent, 1px hairline, `text`. Press: border `#3A3637`.
- **Quiet action:** text-only plate, no underline; press dims to 80%.
- **Chips (lift select, week filter):** height 36, radius 10, hairline;
  active = plate 1px border + plate text. Never filled.
- **Framing coach:** live camera full-bleed; a 1.5px chalk silhouette guide;
  status Label top-center — `FRAMING GOOD` (green), `MARGINAL` (amber),
  `MOVE PHONE LEFT` (text). Arm button stays disabled until good/overridden.
- **Record arm:** 72px circle, 2px chalk ring, plate 12px dot when armed;
  auto-start caption in Secondary beneath ("starts when the bar moves").
- **Rep cards (review):** `rubber`, radius 14, padding 16, one per rep:
  Label `REP 4`, verdict Title ("Cut ~4 cm high"), metric row in JBM
  (`DEPTH −4 CM · DRIFT 2 CM`), severity: plate 6px dot (fault), amber
  (borderline), green check (clean). Cards are a horizontal snap rail.
- **Clip frame:** `rubber`, radius 14; video with the Skia overlay; scrubber
  is a 2px hairline track with a 12px chalk handle; rep tick marks beneath
  in `text-3`, faulted reps' ticks in plate.
- **Log rows:** NO boxes. Full-bleed hairline rows ≥56px: Title lift name,
  JBM meta (`5×5 · 142.5 KG · RPE 8`), right: mini path glyph in `text-3`
  (plate if faults), chevron. Expired-clip rows keep metrics, drop the glyph.
- **Progression chart:** hairline axes, chalk 1.5px load line, plate dots
  only on fault sessions; JBM axis labels 11.
- **Flag banner (weekly review only):** `rubber`, radius 14, `alert-flag` in
  amber, Title pattern, Secondary evidence ("visible in 6 of 8 heavy sets"),
  quiet actions: "See reps" · "Dismiss".
- **Bottom tab bar:** height 56 + safe-area, `rubber` 94% + blur, hairline
  top. Record / Log / Progress / You at 22px icons + 10px Archivo 600 labels;
  active = `text` + 2px plate dot; inactive = `text-3`.

## The signature — the bar-path trace
On the review screen, the bar path draws itself over the clip: a 2px chalk
polyline traces the bar's travel in 600ms `ease-out-quart`, then the segments
that deviated past tolerance re-stroke in plate (240ms, `ease-in-out-soft`)
with a small JBM annotation at the worst point (`+6 CM FWD`). Scrubbing the
clip moves a 6px chalk bead along the trace in sync. One draw per analysis,
never looping. `Haptics.impactAsync(Light)` on the plate re-stroke. This is
the entire brand animation — everything else is state feedback ≤240ms.

## Mobile layout (390×844 — primary spec)
- **Record (default tab):** lift chips (Squat / Deadlift / Bench) under the
  title; load stepper as Display JBM numeral with ±44px steppers; framing
  coach fills the middle; arm button bottom-center in the thumb zone. Free
  tier shows `2 OF 3 SETS LEFT THIS WEEK` as a Label under the chips.
- **Review (post-set):** clip frame with the signature trace top; rep-card
  rail beneath; verdict summary row (`3 CLEAN · 2 FLAGGED` in JBM); thumb
  zone: **Log this set** primary, Share as secondary. Rest timer runs in the
  header in JBM, always visible.
- **Log:** session groups with date headers (Label), lift rows per above;
  tapping opens the stored review. Search/filter chips at top.
- **Progress:** per-lift progression chart, fault-rate trend line beneath,
  flag banners at top when active. Paywall sheet (radius 24, grab handle)
  presents annual-hero pricing with plans as hairline-divided rows.

## Responsive
Phone is the product. ≥768px (iPad in a rack corner): review goes two-column
— clip frame left, rep rail vertical right; charts widen; tabs become a slim
left rail. No desktop, no web app, no 3D anywhere.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Rep cards enter with 24ms stagger, opacity +
8px rise. Chips crossfade 150ms. The rest timer ticks without animation —
digits swap. Scrub gestures are direct-manipulation (no easing between finger
and bead). Targets ≥44px, ≥8px apart; recording arm/disarm requires a
deliberate 300ms press-and-hold (gym hands are clumsy); destructive deletes
are hold-to-confirm 600ms. Haptics: selection on press, light impact on
plate re-stroke, success notification when a set logs a PR.

## Reduced motion & fallback
Trace draw → the full path and plate segments appear instantly with the
annotation shown. Card stagger → ≤100ms opacity fade. Scrub bead remains (it
is information, finger-driven). Every fault carried by the trace is also a
text verdict on its rep card — nothing is motion-only. Haptics retained; they
carry feedback when motion is off.
