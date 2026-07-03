# DriftOff — Design Specification

## Design vision
The app equivalent of a dark hotel room with the ocean outside. DriftOff is an
instrument for getting *out* of the phone — so the design paradox is central:
gorgeous, but engineered to be looked at less. Everything is slower, deeper, and
dimmer than normal apps: navy-black gradients, moonlight accents, motion at
breathing tempo. No streaks, no red, no urgency. The interface itself should
lower your heart rate.

## Brand identity

| Role | Color | Hex |
|---|---|---|
| Abyss | `#050814` |
| Deep | Indigo night | `#0B1026` |
| Brand | Moon silver | `#C7D2FE` |
| Accent | Dusk lavender | `#8B87D8` |
| Dawn (morning report) | Peach | `#F7C59F` |
| Text | Moonlit `#DDE3F8` / muted `#7A80A8` at 70% |

- **Display:** `Gambetta` (fallback `Lora`) light italic for sleep copy — whispered serifs.
- **UI:** `Inter` at reduced contrast (AA still enforced); nothing bold after 8pm except the wake time.
- **Logo:** a crescent moon formed by a "D" with its counter offset. Icon: the crescent on abyss with a single star.
- **Voice:** a whisper. Sentence fragments allowed. "Ready when you are."

## Art direction
- **Time-reactive theme:** after the user's wind-down hour, the whole app drops brightness 20%, disables all blues above `#8B87D8` saturation, and enlarges tap targets 15% (drowsy fingers). Morning uses the peach dawn palette for the sleep report only.
- Gradients are the material: every screen is a vertical gradient from Deep to Abyss with 1% noise dithering (no banding on OLED — this is a craft requirement, test on device).
- No hard edges after dusk: cards are 28px radius with feathered 1px borders at 10% opacity.

## The signature moment — "The Descent"
Starting a wind-down begins a slow **3D descent scene** (Skia/GL shader): the
camera drifts downward through layered translucent veils — dusk clouds, then deep
water light-shafts, then a starfield that's *below* you — over the session's full
length (10–30 min), imperceptibly slow (~4px/min). The soundscape mixer's channels
each own a visual layer (rain = faint streaks, waves = a slow caustic shimmer,
piano = drifting motes) so mixing sound visibly mixes the world. The screen dims
to 15% by minute three. If the phone is set down face-up, the scene continues for
10 min then fades to black with a single remaining star — the app's last word
every night. Nothing is tappable during descent except a full-screen "surface"
gesture (swipe up, slow).

## Motion system
- **Global tempo:** all durations ×2 after wind-down hour; default easing shifts to `ease-in-out-soft`. Nothing in the evening moves faster than 600ms.
- **Sound mixer:** channel orbs float in a loose cluster; volume = orb size (drag up/down, `spring-gentle` mass 2 — heavy, underwater); muting an orb lets it sink 12px and desaturate.
- **Smart alarm setting:** a circular dial where the thumb drags the moon across an arc to the wake window; stars along the arc brighten within the chosen window.
- **Morning report:** the only sprightly moment — dawn peach gradient, sleep-cycle chart draws as a gentle mountain silhouette (1s), stage bands fade up in sequence.
- **Breathing guide:** a soft ring expands/contracts at 4-7-8 tempo; haptic swells (not taps) sync with the phases.

## Key screens
1. **Tonight (home):** one large card — "Begin wind-down" — with the descent scene's first veil animating faintly inside it; below, the mixer cluster and tonight's alarm arc. Total tappable choices on screen: 3.
2. **The Descent (money screen):** as specced; the paywall never appears here.
3. **Morning report:** dawn palette, mountain chart, one insight sentence ("Deep sleep up 12% — the earlier wind-down worked."), one action (adjust tonight).
4. **Paywall:** shown only in daytime. The annual hero card is a night-sky panorama; copy: "Every night, for less than one bad night costs." Trial terms in plain type.

## Component language
- Buttons: large soft pills, moon-silver text on translucent fills (8% white); the primary action gets a slow 6s glow cycle, never a pulse.
- Cards: 28px radius, gradient fills, feathered borders.
- Empty/edge states: a single star with whisper copy ("No sessions yet. Tonight counts.").
- Charts: silhouette fills, no gridlines, values on tap only.

## Reduced motion & fallback
Descent → a static gradient that darkens in 3 steps over the session. Orb physics → sliders. Breathing ring → text-guided timer with haptic swells. All dimming behavior retained (it's function, not decoration).
