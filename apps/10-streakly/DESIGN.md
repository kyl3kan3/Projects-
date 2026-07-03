# Streakly — Design Specification

## 1. Vision
Streakly is one warm loop: tap a habit, land in a focus timer, finish, and the
streak advances. It's a daylight product — cream paper, ember orange, round
tactile shapes — that feels like a beautifully machined kitchen timer, not a
gamified RPG. The craft lives in the feel of completing a habit, not in a mascot.

## 2. Mobile layout (390×844)
Native Expo app; everything is built for one thumb.

- **Nav:** a **bottom tab bar** — Today · Focus · Circles · You (4 tabs, ≥49px,
  labels + line icons, safe-area padded). This is the spine of the app.
- **Today (home):** a compact streak header at top (current streak number + best),
  then the day's habits as pebble cards in a single scrolling column. Completed
  habits sink below a thin "done today" divider. The primary action — checking a
  habit, or **Start focus** — sits on each card and in the bottom third, always
  thumb-reachable.
- **Habit card:** full-width, 24px radius, the habit's color as a left ring/icon;
  a ≥44px circular check on the trailing edge and a small "Focus" button. Tapping
  the card body opens detail; tapping Focus launches the timer pre-filled.
- **Add habit / edit / paywall:** bottom **sheets**, not full pages — dragged up,
  dismissed by swipe-down (with a visible Close button).
- Body ≥16px; streak numerals large but not shouting.

## 3. Identity
| Role | Name | Hex |
|---|---|---|
| Paper | Warm cream | `#FBF6EE` |
| Card | White | `#FFFFFF` |
| Brand | Ember orange | `#F2662D` |
| Focus | Deep teal | `#0F766E` |
| Night base | Charcoal plum | `#1C1720` |
| Text | Ink `#241F1A` / muted `#8A8178` |

- **Display:** `Recoleta` (fallback `Fraunces` soft) — round, warm. **UI &
  numerals:** `Nunito Sans`; streak counts at 800 weight.
- **Logo:** a flame whose inner cutout is a checkmark.
- **Signature detail — the completion.** Checking a habit is the one crafted
  moment: the ring fills clockwise (300ms `ease-out-quart`), the icon pops 1.15→1
  (`spring-snappy`), a haptic notch fires, and the streak numeral rolls up by one
  (odometer, 200ms) with a single spark. Small, reactive, 60fps. A **Rive flame**
  in the Today header is a quiet accent that changes with streak tier (match →
  candle → campfire) — it reacts, it does not perform, and the app is complete
  without it.

## 4. Responsive
Phone is the product. On tablet the Today column centers at ~65ch with stats
alongside; the bottom tabs become a slim side rail ≥768px. No desktop 3D — there
is none anywhere. **First-class widgets** are the real "large surface": iOS
home-screen widgets (small = flame state + count; medium = flame + 3 habit rings)
use 3-frame states, not live animation, and get design attention equal to a screen.

## 5. Motion & touch
- Shared tokens: completion `ease-out-quart` + `spring-snappy`; sheets/cards
  `spring-gentle` at `dur-emphasis`; taps `dur-micro`.
- **Focus timer:** a teal ring counts down with a slow breathing inner glow (4s
  cycle); the last 10s tighten the stroke; completion settles the ring into the
  logged session and auto-checks the linked habit.
- **Heatmap:** month cells fade in row-by-row on open (8ms stagger, ≤8 visible at
  once) from ash to the habit's hue.
- **Streak repair (premium):** press-and-hold to "cup" a guttering flame while a
  relight plays (1.2s), gated behind the paywall sheet; a plain "Repair" button is
  the equivalent.
- **Touch:** targets ≥44px, ≥8px apart; swipe a habit row left for quick
  edit/skip (buttons in detail do the same); pull-to-refresh on Today.
- **Haptics:** notch on completion, soft success on milestone, light tick on tab
  change.

## 6. Key screens (mobile-first)
1. **Today (money screen):** streak header + flame accent, pebble habit cards,
   completed rows sunk below the divider, day-progress arc at the bottom.
2. **Focus:** full-screen teal, the habit icon centered in the breathing ring,
   pause/end as thumb-zone buttons; ending early asks once, gently.
3. **Paywall (sheet):** flame at campfire size, weekly-trial primary, annual as
   value anchor, lifetime de-emphasized; close X always visible.
4. **Circles:** members' streaks as a simple row of small candles; a friend
   completing lights their candle with a soft ping. No feed, no comments.

## 7. Reduced-motion & fallback
Flame → 5 static tier images swapped with an 80ms crossfade. Spark, breathing
glow, heatmap stagger off. Ring fills and streak rolls → instant with a color/number
change. **Haptics retained** — they carry the feedback when motion is removed.
