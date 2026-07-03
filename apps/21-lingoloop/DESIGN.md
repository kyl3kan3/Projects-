# LingoLoop — Design Specification

## Design vision
A table for two in another country. LingoLoop's job is to lower the fear of
speaking, so the design is a warm conversational stage — soft evening colors,
one attentive presence across the table, and *your own voice made visible and
beautiful*. Nothing gamified-cute; the feel is a candlelit café where mistakes
are part of the music. Duolingo is a playground; LingoLoop is a passport.

## Brand identity

| Role | Color | Hex |
|---|---|---|
| Evening | Plum black | `#191322` |
| Stage | `#241B30` |
| Brand | Conversation coral | `#FF7A6B` |
| Your voice | Warm gold | `#FFC96B` |
| Tutor voice | Soft lilac | `#B7A4F4` |
| Fluency green | `#63D6A3` |
| Text | `#F4EFF7` / muted `#9C90AC` |

- **Display:** `Canela Text` (fallback `Fraunces`) — travel-journal warmth; **UI:** `Inter`; **target-language text** always 1px larger than UI text with generous line-height (the language is the guest of honor).
- **Logo:** two speech-bubble arcs interlocked into a loop (∞-adjacent). Icon: the loop on coral.
- **Voice:** encouraging local friend. "You held that whole exchange in Spanish. Two small fixes below."

## Art direction
- **Voice as light:** all audio renders as organic waveform ribbons — the user's in gold, the tutor's in lilac — with rounded amplitude curves (no spiky bars). Conversation history is literally two ribbons interweaving down the screen.
- Language-ambient theming: each language tints the stage 4% toward a hue (ES terracotta, FR blue-gray, IT olive, DE steel, PT sea) — subliminal place-setting, never flags or clichés.
- Corrections styled as marginalia, not errors: gold underlines with the tutor's note in italic serif beside — a friend's pencil, not a teacher's red pen.

## The signature moment — "The Exchange"
The live conversation screen. Center stage: a **breathing presence orb** for the
tutor (lilac, layered blob shader with slow internal currents) that behaves like
an attentive listener — leaning (2% translate) toward the mic when you speak,
its currents quickening slightly with the conversation's tempo. When *you*
speak, your gold ribbon draws upward from the mic in real time (actual amplitude
data), and — the magic — **when you finish a sentence the ribbon crystallizes
into the words you said** (glyphs condense out of the waveform, 400ms), so you
watch your speech become language. The tutor's reply flows the reverse way:
lilac text melts into a ribbon as it's spoken. Corrections appear afterward as
gold pencil marks on your crystallized sentences. Fifteen minutes of this feels
like a conversation, looks like calligraphy being written by two people.

## Motion system
- **Session start:** the stage dims 8%, the orb fades in with a single slow breath (2s), and a scenario placard ("Ordering at a café — Madrid") sets like a scene card, then recedes to a corner chip.
- **Hesitation support:** if the user stalls >4s, the "say it for me" lifeline pulses once, softly (never repeats within 30s — dignity spec).
- **Post-session report:** the conversation's two ribbons compress into a woven summary braid at top; corrections deal out beneath as note cards (60ms stagger); the mistake-loop drills for tomorrow queue themselves visibly ("we'll warm up with these").
- **Streak/progress:** a fluency ring around the day rather than a fire streak — arc fills per session minute with `ease-out-expo`; the CEFR progress renders as a horizon line rising over weeks.
- **Paywall:** the orb sits behind frosted glass mid-conversation gesture — "keep the conversation going" — annual hero card; close X honest.

## Key screens
1. **Onboarding / level calibration:** a 3-minute first exchange with the orb (the calibration IS the demo); no forms before speech — mic permission asked in-context by the orb "leaning in."
2. **The Exchange (money screen):** as specced; controls limited to lifeline, slower-speech toggle, and end — everything else waits.
3. **Report:** braid, corrections marginalia, one fluency insight, tomorrow's warm-up queue.
4. **Scenario library:** shelf of scene cards (film-still style illustrations, duotone in the language's ambient hue) with goal + difficulty dots; locked tiers show through frost.

## Component language
- Buttons: soft pills; primary coral with plum text; the mic button is a large gold circle with a live amplitude ring at rest.
- Cards: 20px radius, stage-toned, 1px lighter inner edge.
- Correction notes: italic serif on small gold-ruled cards.
- Empty state: the orb asleep with a tiny snore ripple: "Wake your tutor — say hola."

## Reduced motion & fallback
Orb → static gradient circle with a subtle color shift between listening/speaking states. Ribbons → simple level meters; crystallization → text fades in after speech. Scene dimming off. All conversational states also captioned in text ("Listening…").
