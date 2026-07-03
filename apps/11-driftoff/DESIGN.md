# DriftOff — Design Specification

## 1. Vision
DriftOff is an instrument for getting *out* of the phone. It's a dark, quiet,
sleep-only app — navy-black gradients, moonlight accents, motion at breathing
tempo — engineered to be looked at less, not more. No streaks, no red, no urgency;
the interface itself should lower your heart rate.

## 2. Mobile layout (390×844)
iOS-first Expo app, designed for a dim room and a half-asleep thumb.

- **Nav:** a minimal **bottom tab bar** — Tonight · Sounds · Alarm · Morning
  (4 tabs, low-contrast icons, safe-area padded). It fades to near-invisible once
  a session starts.
- **Tonight (home):** deliberately sparse — one large card, **"Begin wind-down,"**
  filling the middle-to-lower screen so it's the natural thumb target. Above it,
  tonight's alarm time in the app's only bold numerals; below it, the current
  soundscape as a single now-playing row. Total tappable choices: 3.
- **Sounds:** a vertical list of soundscapes; the premium mixer lets you layer up
  to 4, each as a full-width channel row with a large volume slider (drowsy-finger
  sized). A sleep-timer control with fade-out sits at the bottom.
- **Alarm:** a large circular dial; drag the moon thumb across an arc to set the
  wake window; a numeric stepper is the precise equivalent.
- After the user's wind-down hour the whole app **drops brightness ~20% and grows
  tap targets ~15%** — a real function, not decoration.
- Body ≥16px (larger at night); every control ≥44px, most bigger.

## 3. Identity
| Role | Name | Hex |
|---|---|---|
| Base | Abyss | `#050814` |
| Deep | Indigo night | `#0B1026` |
| Brand | Moon silver | `#C7D2FE` |
| Accent | Dusk lavender | `#8B87D8` |
| Dawn | Peach | `#F7C59F` |
| Text | Moonlit `#DDE3F8` / muted `#7A80A8` |

- **Display:** `Gambetta` (fallback `Lora`) light italic for sleep copy —
  whispered serifs. **UI:** `Inter` at reduced contrast (AA still enforced);
  nothing bold at night except the wake time. Morning report uses the peach palette.
- **Logo:** a crescent moon formed by a "D" with an offset counter, one star.
- **Signature detail — the wind-down dim.** Beginning a session doesn't launch a
  scene; it starts a slow, real ambient shift: the Tonight gradient deepens toward
  Abyss over the first three minutes, the soundscape's own faint texture drifts
  (rain = slow streaks, waves = a gentle caustic shimmer) behind the now-playing
  card, and the UI recedes. Cheap CSS/Skia gradient + one low-cost shader layer,
  60fps, phone-native. The app's "last word": set face-up, it fades to a single
  remaining star.

## 4. Responsive
Phone is the whole product (iOS first). On tablet the Tonight card centers with
generous margins; nothing reflows to columns. **No 3D descent scene, no WebGL on
the critical path** — the ambient dim is the signature everywhere. There is no
desktop app; an optional larger-screen "nightstand mode" simply shows the clock,
alarm, and now-playing at arm's-length size.

## 5. Motion & touch
- **Global tempo:** after the wind-down hour, durations ×2 and easing shifts to
  `ease-in-out-soft`; nothing moves faster than 600ms in the evening.
- **Sound mixer:** channels are simple heavy-feeling sliders (`spring-gentle`,
  underwater mass); muting a channel dims and sinks its row 12px.
- **Breathing guide:** a soft ring expands/contracts at 4-7-8 tempo; **haptic
  swells** (not taps) sync to the phases.
- **Morning report:** the one sprightly moment — dawn peach, the sleep-cycle chart
  draws as a gentle mountain silhouette (1s), stage bands fade up in sequence.
- **Touch:** ≥44px (≥50px at night); swipe-up "surface" gesture ends a session
  (a visible End button is the equivalent); no pull-to-refresh (nothing to fetch).

## 6. Key screens (mobile-first)
1. **Tonight (home):** the Begin card, wake time, one now-playing row — three
   choices, deep gradient.
2. **Wind-down session (money screen):** the ambient dim + drifting soundscape
   texture; only the surface gesture is interactive; no paywall ever here.
3. **Morning report:** peach palette, mountain chart, one insight sentence, one
   action ("adjust tonight").
4. **Paywall (daytime only):** annual hero as a night-sky panorama, monthly as
   the anchor, trial terms in plain type; close always visible.

## 7. Reduced-motion & fallback
Ambient dim → a static gradient that darkens in 3 discrete steps over the session.
Soundscape texture and breathing ring off; breathing becomes a text-guided timer
with haptic swells. Mixer physics → plain sliders. **All dimming and tempo
behavior is retained — it's function, not decoration.**
