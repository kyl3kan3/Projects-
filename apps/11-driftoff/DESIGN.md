# DriftOff — Design Specification (v3, redline level)

## Vision
An instrument for getting *out* of the phone. Navy-black quiet, moonlight type,
motion at breathing tempo — engineered to be looked at less, not more. No
streaks, no red, no urgency; the interface itself lowers your heart rate.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load. Native Expo app, iOS-first (Reanimated 3 +
expo-haptics), designed for a dim room and a half-asleep thumb.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `abyss` | `#050814` | The ground. Every screen. |
| `deep` | `#0B1026` | Sheets, the Begin panel, mixer channel wells only |
| `hairline` | `#1B2140` | 1px dividers & framed-object borders — never brighter |
| `text` | `#DDE3F8` | Primary text |
| `text-2` | `#7A80A8` | Secondary text |
| `text-3` | `#4A5074` | Faint (durations in lists, placeholders) |
| `paper` | `#EEF1FB` | **Primary buttons** (ink `#0B1026` text on them), the wake-time numerals |
| `lavender` | `#8B87D8` | THE accent. ≤10% of any screen: brand mark, active states, the alarm-arc thumb, links, the last star |
| `dawn` | `#F7C59F` | Morning report only — chart fill and one insight line. Never before 5 a.m. UI |

Hard rules: lavender never fills a button or a surface; `paper` is the only
high-emphasis fill. **There is no red anywhere in this app** — destructive
actions confirm via the system dialog in plain text. Ambient gradients exist
only as the ground itself (`deep` → `abyss`), never on components.

## Type — exact specimen

Faces: **Gambetta** (300 italic, Fontshare, self-hosted) for sleep copy ·
**Inter** (400/500/600) for UI · **JetBrains Mono** (500) for times. All
bundled; a system-font fallback is a failed build.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (sleep copy) | Gambetta 300 italic | `clamp(28px, 8vw, 40px)` / 1.25 | 0 |
| H2 (screen title) | Inter 600 | 22 / 1.2 | −0.01em |
| Title (sound name) | Inter 500 | 16 / 1.3 | 0 |
| Body | Inter 400 | 16 / 1.55 (17 after wind-down hour) | 0 |
| Secondary | Inter 400 | 13 / 1.45 | 0 |
| Label | Inter 600 | 11 / 1.2 | +0.08em, uppercase |
| Data (durations, cycles) | JBM 500 | 13 / 1.2 | 0, tabular figures |
| Wake time | JBM 500 | 44 / 1.0 | 0, tabular — the only bold thing at night |
| Button | Inter 600 | 15 / 1 | 0 |

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **12** (controls: buttons, steppers, chips) · **16** (the Begin panel,
  mixer wells) · **24** (sheets). Nothing else.
- Elevation: none. Depth is `deep` vs `abyss` plus hairlines. The only shadow
  is the sheet scrim at 40%.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `moon`, `sun`, `star`, `rain`, `waves`, `wind`, `fire`
(hearth), `train`, `sliders` (mixer), `alarm`, `play`, `pause`, `timer`,
`download` (offline), `bell-off`, `chevron-left`, `chevron-down`, `plus`,
`check`, `lungs` (breathing). Tab bar renders at 22px, inline at 18px.
**No emoji, anywhere, ever** — soundscapes get drawn glyphs, not weather emoji.

## Component construction (exact)

- **Primary button:** `paper` fill, `#0B1026` text, radius 12, height 52
  (56 after wind-down hour), Inter 600 15. Press: scale 0.98 + fill `#DCE1F2`
  + `Haptics.selectionAsync`. Disabled: `#232948` fill, `text-3` text.
- **Secondary:** transparent, 1px hairline border, `text` label. Press:
  border `#2A3156`.
- **Quiet action:** text-only lavender; press dims to 80%.
- **Sound rows:** NO boxes. Full-bleed rows, 60px tall, hairline between:
  glyph 20px in `text-2`, Title 16, `download` glyph when cached, JBM duration
  right (`∞` for loops renders as the word LOOP, Label style). Playing row:
  lavender glyph + a 3-bar level meter (2px bars, lavender, 1.2s cycle).
- **Mixer channel:** a `deep` well (radius 16, padding 16), one per layered
  sound, max 4: glyph + name + a 44px-tall slider whose track is hairline and
  fill is `text-2` (not lavender — volume is not an event). Muted: well sinks
  12px and dims to 50%.
- **Alarm dial:** 280px circle, hairline ring; the wake *window* is a
  lavender 4px arc; the drag thumb is a 28px `paper` moon disc. A `−/+`
  stepper (12px radius controls, 5-min steps) is the precise equivalent.
- **Sleep-timer chips:** height 36, radius 12, hairline; `15 · 30 · 45 · 60
  min · End of track`. Active = lavender border + lavender text.
- **Bottom tab bar:** height 56 + safe-area, `abyss` 94% + blur, hairline
  top. Tonight / Sounds / Alarm / Morning at 22px icons, 10px Inter 600
  labels. Active = `text` + 2px lavender dot; inactive = `text-3`. Fades to
  24% opacity 20s into a session; any touch restores it.

## The signature — the wind-down dim
Beginning a session starts a real, slow ambient shift, exactly: over 180s the
ground interpolates `deep` → `abyss` (linear, imperceptible per-frame); UI
text opacity eases 100% → 82%; the soundscape's texture drifts behind the
now-playing row — rain = 1px streaks at 8% white falling over a 14s loop,
waves = a 6% white caustic shimmer on a 21s loop (one Skia layer, 60fps).
After 60s without touch, everything fades out over 8s except one 2px lavender
star at 40% opacity — the app's last word. Any touch returns the UI in 400ms
`ease-in-out-soft`. This is the entire brand animation.

## Mobile layout (390×844 — primary spec)
- **Tonight (home):** three tappable things, total. Wake time `6:40` (JBM 44)
  with `WAKE WINDOW 6:30 – 7:00` label under it; the Begin panel (`deep`,
  radius 16) filling the middle-lower screen — Gambetta line "Tonight: rain on
  a tent roof", primary button **Begin wind-down**; below, one now-playing row
  ("Tent rain · 45 min" with the level meter). Nothing else.
- **Sounds:** hairline rows — "Tent rain", "North Sea waves", "Night train",
  "Box fan", "Hearth" (3 free, rest behind the daytime paywall); sticky
  bottom: sleep-timer chips + mixer entry ("Layer sounds", secondary).
- **Alarm:** the dial centered, stepper beneath, "Gentle wake within your
  window" body line; smart/basic toggle as two chips.
- **Morning:** dawn-tinted report — cycle chart as a mountain silhouette
  (fill `dawn` at 18%, stroke `dawn`), `7:12 in bed · 5 cycles · woke 6:38`,
  one insight sentence ("You fell asleep 14 min faster than your average"),
  one action ("Adjust tonight", secondary).
- **Paywall (daytime only):** sheet, radius 24; Annual $59.99 primary with
  `7-DAY FREE TRIAL` label, Monthly $12.99 as a quiet secondary row beneath;
  trial terms in Body, never fine print; close X always visible.

## Responsive
Phone is the whole product. On tablet the Tonight column centers at 480px
with larger type; nothing becomes multi-column. An optional "nightstand mode"
(landscape, plugged in) shows only clock + alarm + now-playing at arm's-length
sizes (wake time at 96px). No desktop, no WebGL — the dim is the signature
everywhere.

## Motion & touch
After the user's wind-down hour, all durations ×2 and easing shifts to
`ease-in-out-soft`; nothing moves faster than 600ms in the evening; tap
targets grow to ≥50px and brightness drops 20% (real function, not
decoration). Breathing guide: a hairline ring scales 1.0→1.18 at 4-7-8 tempo
with haptic swells (not taps) on phase changes. Sliders use `spring-gentle` —
heavy, underwater. Swipe-up ends a session; a visible End button is the
equivalent. No pull-to-refresh (nothing to fetch).

## Reduced motion & fallback
The dim → three discrete ground steps at 0/90/180s with 100ms fades (the
dimming is function and is retained). Texture layer and level meter off;
breathing ring → a text-guided count ("In · 4") with the haptic swells
carrying the tempo. Sliders lose physics, keep function. The last-word star
still appears — via a single 100ms fade.
