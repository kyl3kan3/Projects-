# Streakly — Design Specification (v3, redline level)

## Vision
One warm loop: tap a habit, land in a focus timer, finish, and the streak
advances. A daylight product — cream paper, ink type, one ember accent — that
feels like a beautifully machined kitchen timer, not a gamified RPG. The craft
lives entirely in the feel of completing a habit.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load. Native Expo app (Reanimated 3 + expo-haptics).

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `cream` | `#FAF5EC` | The ground. Every daylight screen. |
| `card` | `#FFFFFF` | Sheets and the focus-stats panel only — never list rows |
| `hairline` | `#E9E1D3` | 1px dividers & framed-object borders — never darker |
| `ink` | `#241F1A` | Primary text; **primary button fill on cream** |
| `text-2` | `#8A8178` | Secondary text, meta |
| `text-3` | `#B7AE9F` | Faint (placeholders, future dates in heatmap) |
| `night` | `#1C1720` | Focus screen ground only |
| `paper` | `#F7F2E8` | **Primary buttons on `night`** (ink text), timer numerals |
| `ember` | `#E85D2A` | THE accent. ≤10% of any screen: flame mark, ring fills, active tab dot, links, completion spark |
| `green` | `#2E8F63` | Success only (freeze earned, milestone toast) |
| `red` | `#C74A3C` | Destructive only (archive habit, leave circle) |

Hard rules: ember never fills a button or a surface; ink is the only
high-emphasis fill on cream, paper the only one on night; habit rows are
monochrome + ember — no per-habit rainbow colors.

## Type — exact specimen

Faces: **Fraunces** (600, soft optics) for display · **Nunito Sans**
(400/600/700) for everything else · **JetBrains Mono** (500) for data.
All Google-Fonts-loadable, bundled with the app — no silent system fallback.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (streak numeral) | Fraunces 600 | `clamp(40px, 11vw, 56px)` / 1.0 | −0.01em |
| H2 (screen title) | Fraunces 600 | 24 / 1.15 | −0.01em |
| Title (habit name) | NS 700 | 16 / 1.3 | 0 |
| Body | NS 400 | 16 / 1.5 | 0 |
| Secondary | NS 400 | 13 / 1.45 | 0 |
| Label | NS 600 | 11 / 1.2 | +0.08em, uppercase |
| Data (counts, dates) | JBM 500 | 13 / 1.2 | 0, tabular figures |
| Timer digits | JBM 500 | `clamp(48px, 13vw, 64px)` / 1.0 | 0, tabular figures |
| Button | NS 700 | 15 / 1 | 0 |

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **12** (controls: buttons, inputs, chips) · **16** (framed panels) ·
  **28** (sheets, the check disc reads as a circle). Nothing else.
- Elevation: flat. One shadow exists in the whole app — the sheet scrim.
  Depth on cream comes from hairlines and the `night` focus world.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `flame`, `check`, `plus`, `timer`, `play`, `pause`,
`chevron-left`, `chevron-right`, `calendar`, `snowflake` (freeze), `wrench`
(repair), `users` (circles), `user`, `bell`, `pencil`, `archive`, `share`,
`download`. Tab bar renders at 22px, inline at 18px. **No emoji, anywhere,
ever** — streak tiers are three drawn flame states, never a fire emoji.

## Component construction (exact)

- **Primary button (cream screens):** ink fill, cream text, radius 12,
  height 52, full-width in the thumb zone, NS 700 15. Press: scale 0.98 +
  fill `#3A332B` + `Haptics.selectionAsync`. Disabled: `#DDD5C6` fill,
  `text-3` text.
- **Primary on `night` (Focus):** `paper` fill, ink text — same geometry.
- **Secondary:** transparent, 1px hairline border, ink text. Press: border
  `#D5CBB9`.
- **Quiet action:** text-only ember, no underline; press dims to 80%.
- **Input:** card fill, hairline border, radius 12, height 48, 16px text.
  Focus: border ember + 2px offset ring at 25% ember.
- **Chips (schedule days, presets):** height 36, radius 12, hairline; active =
  ember 1px border + ember text. Never filled.
- **Habit rows (Today):** NO boxes. Full-bleed rows, 64px tall, hairline
  between: 40px disc (habit glyph in ink on 10% ember tint), Title 16,
  JBM meta (`14 days · 25 min`), trailing 44px check ring (1.75px hairline
  circle). Whole row opens detail; the ring is the completion target.
- **Streak header:** streak numeral (Display) + `BEST 31` label-style caption +
  flame glyph at current tier. No card around it — space does the framing.
- **Heatmap:** 12×7 month grid, 12px cells radius 4(=scale step), filled cells
  ember at 25/55/85% by count, empty `#F1EAE0`.
- **Bottom tab bar:** height 56 + safe-area, cream 96% + blur, hairline top.
  Today / Focus / Circles / You at 22px icons + 10px NS 700 labels. Active =
  ink icon + 2px ember dot; inactive = `text-3`.

## The signature — the completion
Tapping the check ring is the one crafted moment, exactly: the ring strokes
ember clockwise in 280ms `ease-out-quart`; at completion the disc fills ink and
a cream check draws in 120ms; `Haptics.impactAsync(Medium)` fires on the fill
frame; the streak numeral rolls up by one (odometer, 200ms) while a single 4px
ember spark rises 12px and fades over 240ms. The row then sinks below the
"DONE TODAY" hairline divider with a `spring-gentle` FLIP (≤320ms). Nothing
else in the app celebrates. The header flame swaps tier (match → candle →
campfire, three static SVGs) with an 80ms crossfade at streaks 1 / 7 / 30.

## Mobile layout (390×844 — primary spec)
- **Today (money screen):** gutter 20. Streak header ("14" numeral, `BEST 31`,
  candle flame). Below, due habits as hairline rows — "Deep work · 14 days ·
  50 min", "Read 20 pages · 6 days", "Morning run · 2 days" — each with check
  ring + a quiet `timer` glyph that launches Focus pre-filled. Completed rows
  sit under the DONE TODAY divider at 60% opacity. Bottom: primary button
  "Start next focus · Deep work 50:00" pinned above the tab bar.
- **Focus:** full-screen `night`. Habit glyph centered inside a 260px timer
  ring (4px stroke: track `#332B36`, progress ember); JBM digits `41:22`
  beneath; Pause (secondary, paper text) and End as thumb-zone buttons.
  Last 10s: ring stroke thickens to 6px. Completion auto-logs the habit and
  returns to Today where the completion plays.
- **Add habit / paywall:** sheets, radius 28 top, 40×4 grab handle in
  `hairline`, padding 20. Paywall: flame at 48px, plans as hairline-divided
  rows (Monthly $6.99 primary, Annual $39.99 with `SAVE 52%` label chip,
  Lifetime $69.99 last, de-emphasized); close X always top-right.
- **Circles:** members as hairline rows — avatar disc, "Sam K · 30 days",
  small flame at their tier; "2h left to keep the streak" in `text-2` when a
  member is at risk. No feed, no comments.

## Responsive
Phone is the product. ≥768px (tablet) the Today column centers at 560px with
the heatmap and focus stats alongside; tabs become a slim left rail. No
desktop, no 3D. **Widgets are the second surface:** small = flame tier + JBM
count; medium = flame + three habit rings — 3 static states each, drawn in the
same icon language, never animated.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Rows enter with a 12px rise, `spring-gentle`,
30ms stagger ≤6. Sheets spring in 320ms. Heatmap cells fade in row-by-row
(8ms stagger). Streak-repair (premium): press-and-hold 1.2s on the `wrench`
row relights the flame; a plain "Repair" button does the same. Targets ≥44px,
≥8px apart; swipe a habit row left for Edit/Skip (both exist as buttons in
detail); pull-to-refresh on Today. Haptics: selection on press, medium impact
on completion, success notification on milestone, light tick on tab change.

## Reduced motion & fallback
Completion → ring and check appear instantly, numeral swaps with a 100ms fade;
spark and FLIP sink off (row moves instantly). Flame crossfades → hard swap.
Timer ring still updates (it is information), but the 10s thickening is off.
Haptics are retained — they carry the feedback when motion is removed.
