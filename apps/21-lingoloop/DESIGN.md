# LingoLoop — Design Specification

## Vision
A table for two in another country. LingoLoop's job is to lower the fear of speaking, so
the design is a warm conversational stage — soft evening colors, one attentive presence,
and your own voice made gently visible. Nothing gamified-cute; the feel is a candlelit
café where mistakes are part of the music. Duolingo is a playground; LingoLoop is a
passport.

## Mobile layout (390 × 844)
This is a phone-native voice app; the whole product lives one-handed.
- **The Exchange (core screen):** the tutor is a single calm presence at top; the
  conversation flows as a vertical thread of two voices below. The **mic button is a
  large gold circle centered in the bottom third** — the one thing your thumb needs.
  Slower-speech toggle and "say it for me" lifeline flank it as 44px pills; End is a
  quiet top-corner affordance.
- **Voice made visible:** while you speak, a soft gold amplitude ribbon rises from the
  mic (real level data, rounded curves, no spiky bars); when you finish, it settles and
  your transcribed sentence fades in beneath it. The tutor's replies render in soft
  lilac. Corrections attach afterward as gold-underline marginalia, not red errors.
- **Nav:** a bottom tab bar (Talk · Scenarios · Progress · Profile) on non-session
  screens; the Exchange itself hides chrome to keep focus on speech.
- **Post-session report** is a scroll: your two-voice summary at top, correction note
  cards, one fluency insight, tomorrow's warm-up queue.

## Identity
| Role | Name | Hex |
|---|---|---|
| Evening | Plum black | `#191322` |
| Stage | Stage plum | `#241B30` |
| Brand | Conversation coral | `#FF7A6B` |
| Your voice | Warm gold | `#FFC96B` |
| Tutor voice | Soft lilac | `#B7A4F4` |
| Fluency | Fluency green | `#63D6A3` |

Text `#F4EFF7`, muted `#9C90AC`.

- **Display:** `Canela Text` (fallback `Fraunces`) — travel-journal warmth. **UI:**
  `Inter`, 16px min; **target-language text** always 1px larger with generous
  line-height — the language is the guest of honor. **Data:** tabular Inter for streaks.
- **Signature detail — voice becomes words:** when you finish a sentence, the gold
  amplitude ribbon resolves into your transcribed text (a quick 240ms opacity/settle,
  not a glyph-by-glyph shader) — you watch your speech become language, then a friend's
  pencil (gold underline + italic note) appears where a phrase could be better. Small,
  meaningful, 60fps on a mid Android. No blob shader.

## Responsive
Phone-first everywhere. On tablet the Exchange keeps its single centered column
(conversation is intimate, not wide) with the report as a side panel. **Optional desktop
enhancement:** the marketing site may show a looping muted demo of the ribbon-to-text
moment — CSS/video, never a WebGL scene, and the app itself never depends on it.

## Motion & touch
- Shared tokens: ribbon settle `ease-out-quart` at `dur-emphasis`; report cards deal in
  with `spring-gentle`, 40ms stagger, ≤8. Scenario placard sets, then recedes to a chip.
- Mic button ≥64px with a live amplitude ring at rest; all controls ≥44px.
- **Haptics:** a soft tick when the tutor starts speaking and when a correction lands
  (Reanimated + Expo Haptics). Hesitation support: if you stall >4s the lifeline pulses
  once, softly, never repeating within 30s — a dignity spec.
- Fluency shown as a filling ring around the day, not a fire streak.

## Key screens
1. **Onboarding / level calibration:** a 3-minute first spoken exchange — the calibration
   *is* the demo; mic permission asked in-context as the tutor "leans in." No forms first.
2. **The Exchange (money screen):** as specced — mic in the thumb zone, voice as light,
   corrections as marginalia, minimal chrome.
3. **Report:** two-voice summary, correction note cards, one insight, tomorrow's warm-up.
4. **Scenario library:** scene cards (duotone film-still illustrations in the language's
   ambient hue) with a goal + difficulty dots; locked tiers show softly through frost.

## Component language
- Buttons: soft pills; primary coral with plum text; mic = large gold circle.
- Cards: 20px radius, stage-toned, 1px lighter inner edge.
- Correction notes: italic serif on small gold-ruled cards.
- Paywall: the tutor sits behind soft frost mid-conversation — "keep the conversation
  going" — annual hero card, honest close X.
- Empty state: the tutor asleep with a tiny snore ripple: "Wake your tutor — say hola."

## Reduced-motion & fallback
Presence → static gradient with a subtle listening/speaking color shift. Ribbons → simple
level meters; voice-to-text → plain fade-in after speech. Scene dimming off. All
conversational states also captioned in text ("Listening…") for accessibility.
