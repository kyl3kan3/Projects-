# Streakly — Design Specification

## Design vision
Warmth you can hold. Streakly is a daylight product — cream paper, ember orange,
round tactile shapes — that treats habit-building like tending a small fire.
The flame is the entire emotional engine: it grows with your streak, flickers
when you're at risk, and roars on milestones. Friendly without being childish;
the craft target is "Headspace meets a beautifully machined kitchen timer."

## Brand identity

| Role | Color | Hex |
|---|---|---|
| Paper | Warm cream | `#FBF6EE` |
| Card | White | `#FFFFFF` |
| Brand | Ember orange | `#F2662D` |
| Flame hot | Marigold | `#FFB020` |
| Focus | Deep teal | `#0F766E` |
| Night mode base | Charcoal plum | `#1C1720` |
| Text | Ink `#241F1A` / muted `#8A8178` |

- **Display:** `Recoleta` (fallback `Fraunces` soft) — round, warm, a little storybook.
- **UI & numerals:** `Nunito Sans`; streak counts get 800 weight.
- **Logo:** a flame whose inner cutout is a checkmark. Icon: flame-check on ember.
- **Voice:** encouraging coach who respects you. "Day 12. The streak is real now."

## Art direction
- Shapes are pebble-round: 24px card radii, pill buttons, squircle habit icons.
- Paper texture (2% grain) on backgrounds; shadows are warm-tinted (`#F2662D` at 6%), never gray.
- Color-coding: each habit picks a hue from an 8-color earthy palette; the habit's ring, icon squircle, and history heat cells all inherit it.
- Night mode ("wind-down") swaps to charcoal plum with the flame as the only saturated element.

## The signature moment — "The Flame"
A **Rive-driven flame character** (not a mascot with a face — an elemental,
believable flame) lives at the top of the Today screen. State machine inputs:
`streakLength`, `todayComplete`, `atRisk`, `milestone`. Day 1: a match-head
flicker. Week 1: a steady candle. Day 30: a confident campfire with drifting
sparks (particle emitter, 6–10 sparks). Missing-day risk after 8pm: the flame
leans and gutters, embers dim — no guilt text needed. Completing the last habit
of the day: the flame **draws itself up and flares** (700ms, `ease-anticipate`
crouch then rise), releasing one spark that arcs to the streak counter and
increments it. Milestones (7/30/100): the flame briefly turns teal-white and the
screen's warm shadows deepen — a 2-second private fireworks, no confetti clichés.

## Motion system
- **Habit check:** the squircle's ring fills clockwise (300ms `ease-out-expo`), the icon pops 1.15→1 (`spring-snappy`), haptic notch, and the row exhales downward as completed rows sink below the fold divider.
- **Focus timer:** a teal ring ticks with a breathing inner glow (4s cycle matching box-breathing); the last 10 seconds tighten the ring's stroke width; completion melts the ring into a pool that becomes the session-log entry.
- **Heatmap:** month view cells ignite in sequence on open (row-by-row, 8ms stagger) from ash-gray to the habit's hue.
- **Streak repair (monetized):** the gutted flame gets a "cup the flame" interaction — press-and-hold to shield it while a relight animation plays (1.2s), gated behind the paywall sheet.
- **Circles:** friends' flames render as small candles in a row; when a friend completes today, their candle lights in real time with a soft ping.

## Key screens
1. **Today (money screen):** flame hero at top with streak count; habit list as pebble cards; completed habits sink; bottom shows the day's "close the ring" progress arc.
2. **Focus:** full-screen teal environment, the habit's icon centered in the breathing ring; ambient particles drift upward slowly (6 max); ending early asks once, gently.
3. **Paywall:** the flame at its day-30 campfire size behind frosted glass — "This is your flame at 30 days." Weekly trial hero, lifetime anchor; close X always visible.
4. **Widgets (design them first-class):** small = flame state + count; medium = flame + 3 habit rings; the widget flame uses 3-frame states, not live animation.

## Component language
- Buttons: pills, ember fill, cream text; press = squish to 0.95 with a warm shadow pulse.
- Cards: white on cream, warm shadow, 24px radius; at-risk habit cards get a faint ember underline that breathes.
- Empty state: an unlit match on cream: "Strike your first habit."
- Streak numbers: odometer roll with a spark on increment.

## Reduced motion & fallback
Flame → 5 static states swapped by streak tier with 80ms crossfade. Spark arcs, particles, breathing glows off. Ring fills → instant with color confirmation. Haptics retained.
