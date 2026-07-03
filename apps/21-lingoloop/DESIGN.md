# LingoLoop — Design Specification (v3, redline level)

## Vision
A table for two in another country. LingoLoop lowers the fear of speaking, so
the design is a warm evening stage — espresso dark, one honey thread for your own
voice, corrections as a friend's pencil, never a red X. Nothing gamified-cute;
mistakes are part of the music. This is an Expo app and voice is the product:
the mic button is the most carefully built object in the system.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load (expo-font, preloaded before first screen).

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `evening` | `#1A1510` | The ground. Every screen. |
| `stage` | `#251E15` | Tutor bubbles, cards, sheets only |
| `hairline` | `#3B3222` | 1px dividers & borders — never brighter |
| `text` | `#F7F3EC` | Primary text |
| `text-2` | `#A79A85` | Secondary text |
| `text-3` | `#6B5F49` | Faint (timestamps, placeholders) |
| `paper` | `#F6F1EA` | **Primary buttons & the mic face** (evening text on it) |
| `honey` | `#E0A94E` | THE accent. ≤10% of any screen: your voice — amplitude ribbon, mic ring, correction underlines — plus links and active states |
| `green` | `#63D6A3` | Fluency/success semantic only (goal complete, ring fill) |
| `red` | `#E5766B` | Errors only (permission denied, connection lost) — never corrections |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: honey never fills a button or a surface; `paper` is the only
high-emphasis fill; corrections are honey marginalia, never red; the tutor's
speech is plain `text` on `stage` — your voice is the only colored voice.

## Type — exact specimen

Faces: **Fraunces** (600, optical 40+) for display · **Satoshi** (400/500/700,
Fontshare) for UI · **IBM Plex Mono** (500) for data. Bundled via expo-font.

| Role | Face/weight | Size/lh | Tracking |
|---|---|---|---|
| Display (screen title, report headline) | Fraunces 600 | `clamp(28px, 7.5vw, 40px)` / 1.12 | 0 |
| H2 (section) | Fraunces 600 | 22 / 1.2 | 0 |
| Target-language line | Satoshi 500 | 18 / 1.6 | 0 — the guest of honor, always 1 step larger |
| Body / your transcript | Satoshi 400 | 16 / 1.55 | 0 |
| Correction note | Fraunces 400 italic | 15 / 1.5 | 0 |
| Secondary | Satoshi 400 | 13 / 1.45 | 0 |
| Label | Satoshi 700 | 11 / 1.2 | +0.08em, uppercase |
| Data (timers, streaks, CEFR) | IBM Plex Mono 500 | 13 / 1.2 | 0, tabular figures |
| Button | Satoshi 700 | 15 / 1 | 0 |

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **12** (controls: buttons, inputs, chips) · **16** (cards, bubbles) ·
  **24** (sheets, scenario stills, the paywall frost). Nothing else.
- Elevation: none — depth is `stage` on `evening` plus hairlines. The mic
  alone carries `0 8px 24px rgba(0,0,0,0.35)` (it is a physical object).

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `mic`, `speaker` (tutor audio replay), `turtle` (slower
speech), `lifeline` (speech bubble + hand — "say it for me"), `translate`
(tap-word), `scenario` (open book), `progress` (ring), `person`, `chevron-left`,
`check`, `pencil` (correction), `close`, `pause`. Tab bar 22px, session
controls 20px. **No emoji, anywhere, ever** — languages are set as text
(`ES · Español`), levels as mono chips (`B1`), never flags or faces.

## Component construction (exact)
- **Primary button:** paper fill, evening text, radius 12, height 48
  (full-width in thumb zone), Satoshi 700 15. Press: scale 0.98 + fill
  `#E9E2D7`. Disabled: `#403627` fill, `text-3` text.
- **Secondary:** transparent, 1px hairline, `text`. Press: border `#4F4430`.
- **Quiet action:** text-only honey, no underline; press dims to 80%.
- **The mic button (the product):** 72px circle, paper face, evening `mic`
  glyph 28px, centered horizontally, its center 120px above the safe-area
  bottom. At rest: a 2px honey ring at radius +6px, breathing 1→1.04 over 2.8s.
  Recording: the ring becomes live amplitude — ring width maps RMS 2→6px at
  60fps (Reanimated, UI thread) — and the face dims to `#EDE6DB`. Press-in:
  scale 0.96, `Haptics.selectionAsync`. End of speech: `impactLight`. Flanked
  by two 44px pill controls at 16px gap: `turtle` and `lifeline` (hairline,
  radius 12).
- **Conversation thread:** tutor = `stage` bubble, radius 16 (4 top-left),
  padding 12/16, target-language 18/1.6 with `speaker` replay 32px. You = no
  box — your transcript sits full-bleed right-aligned with a 2px honey left
  rule; hierarchy from space, not bubbles-on-bubbles.
- **Correction (marginalia):** a honey 1.5px underline under the phrase +
  `pencil` glyph 14px; tapping expands a `stage` card (radius 16): the better
  phrasing 18/Satoshi 500, note in Fraunces italic 15 ("More natural: 'me
  gustaría' softens the request"), one honey-hairline "Drill tomorrow" chip.
- **Scenario cards:** 24-radius duotone film stills (espresso + the language's
  hue), title 17, goal line 13/`text-2` ("Order for two, ask for the check"),
  difficulty as mono `A2`, locked tiers behind 60% frost + Label `PREMIUM`.
- **Paywall:** mid-conversation frost (blur 16, `evening` 60%), "Keep the
  conversation going", annual card first with mono `7-DAY TRIAL`, honest 44px
  close X top-right. No countdowns.

## The signature — voice becomes words
While you speak, a honey amplitude ribbon rises from the mic: a single path of
live RMS data, 2px `honey` stroke with a 20% honey fill beneath, rounded curves,
no spiky bars. When you finish: the ribbon settles to a flat line over 240ms
`ease-out-quart`, and 20ms later your transcribed sentence fades in beneath it
(200ms opacity, 4px rise). If a phrase could be better, the pencil arrives:
the honey underline draws left→right in 300ms `ease-out-quart`, `impactLight`
as it lands. Reanimated on the UI thread; 60fps on a mid Android. This is the
entire brand animation.

## Mobile layout (390×844 — primary spec)
- **Nav:** bottom tab bar 56px + safe-area (`mic` Talk · `scenario` Scenarios ·
  `progress` Progress · `person` Profile), 22px glyphs, 10px Satoshi 700
  labels; active = `text` + 2px honey dot. The Exchange hides all chrome.
- **The Exchange (money screen):** tutor presence strip at top (name "Sofía",
  mono `B1 · ES`, End as a quiet 44px top-right affordance), conversation
  thread scrolling beneath, mic + flanking pills in the bottom third. Live
  session timer mono 13 `text-3` top-center.
- **Post-session report:** Display "Nice — 12 minutes on your feet." Then
  hairline-divided rows, not boxes: exchanges count, words spoken (mono `214`),
  goal state in green ("Rebooked the flight — done"). Correction cards follow,
  then one insight ("You avoid past tense — tomorrow's warm-up drills it"),
  then a 48px primary "Queue warm-up".
- **Onboarding:** no forms first — mic permission asked in-context as the
  tutor "leans in" after the first typed hello; a 3-minute spoken exchange
  calibrates CEFR, ending on the mono stamp `ESTIMATED LEVEL — A2+`.

## Responsive
Phone-first everywhere. Tablet: the Exchange keeps one centered 480px column
(conversation is intimate); the report may sit as a right panel. The marketing
site may loop a muted ribbon-to-text demo — CSS/video only, never load-bearing,
mobile gets a three-frame still sequence.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Report rows deal in with `spring-gentle`,
40ms stagger, ≤8. Scenario placard sets then recedes to a chip (320ms). All
controls ≥44px; the mic is 72px. Haptics: `selectionAsync` on mic press,
`impactLight` when the tutor starts speaking and when a correction lands.
Hesitation support: stall >4s → the lifeline pill pulses once (scale 1.05,
600ms), never repeating within 30s — a dignity spec. Fluency is a ring that
fills, drawn in green, not a flame.

## Reduced motion & fallback
Ribbon → a simple 3-segment level meter; transcript appears with a 100ms fade.
Underline draw → instant underline. Breathing ring and lifeline pulse off.
Frost → flat scrim. Every conversational state is also captioned in text
("Listening…", "Sofía is speaking") for screen readers — never motion-only.
