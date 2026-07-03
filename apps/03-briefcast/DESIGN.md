# Briefcast — Design Specification

## Design vision
The feeling of walking out of a meeting where someone brilliant took notes for you.
Briefcast is *editorial*, not techy: warm paper light, confident serif headlines,
sound made visible. Where every competitor looks like a transcript dump, Briefcast
looks like a morning briefing typeset by a magazine — with one living element:
speech becoming structure before your eyes.

## Brand identity

| Role | Color | Hex |
|---|---|---|
| Paper | Warm ivory | `#FAF7F2` |
| Ink | Espresso black | `#1C1917` |
| Brand | Broadcast blue | `#2456F0` |
| Accent | Signal coral | `#FF6A5C` |
| Highlight | Marker yellow | `#FFE8A3` |
| Muted | Stone | `#78716C` |

- **Display:** `Tiempos Headline` (fallback `Source Serif 4`) — decisions and summaries deserve a serif.
- **UI/body:** `Inter`; **speaker labels & timestamps:** `JetBrains Mono` 12px caps.
- **Logo:** "Briefcast" in the serif; the "B" carries three horizontal soundwave dashes inside its bowl. Icon: the dashed-B on broadcast blue.
- **Voice:** senior chief-of-staff. "3 decisions. 5 action items. 2 need you."

## Art direction
- **Light-first.** This is a daytime tool for sales teams; paper background, ink text, blue reserved for interactive, coral reserved for *action items only*.
- Texture: extremely subtle paper tooth on marketing (2% noise); product is clean.
- Layout is column-driven like print: summaries set at 68ch measure, generous 1.6 line-height, pull-quotes from the call styled as editorial blockquotes with a coral rule.

## The signature moment — "Waveform → Words"
Marketing hero: a live audio waveform (canvas, coral on ivory) scrolls across the
screen like a cardiogram. As it passes a vertical "Briefcast line" at 40% width,
the wave *condenses into typeset text* — letters materialize from the wave's peaks
(per-glyph rise + settle, 30ms stagger), and key phrases highlight themselves in
marker yellow, then extract: they slide right and stack into a decisions card, an
action-items card (checkboxes drawing themselves in), and a CRM card that stamps
"Synced → HubSpot" with a satisfying 4px press-in. Loop is 14s, scroll-scrubbable.
Pure 2D (canvas + Framer Motion) — this brand doesn't need 3D; it needs typography
that behaves like it's alive.

## Motion system
- **Live meeting state:** a small waveform chip breathes with actual input level; when the bot joins a call, the chip does a 2-frame "on air" blink then settles.
- **Summary generation:** skeleton is *typographic* — gray text-shaped bars that resolve into real sentences paragraph-by-paragraph (top→down, 120ms each), like a page being printed.
- **Action-item checkoff:** checkbox draws its stroke (150ms), the row's text gets a strike that draws left→right, then the row exhales (2px settle) and re-sorts with `spring-gentle`.
- **CRM sync:** the synced-field chips flip like split-flap airport tiles (per-chip 200ms, 40ms stagger) from "pending" to the CRM's field name.
- **Highlight-to-clip:** selecting transcript text raises a marker-yellow highlight with a hand-drawn wobble (2px displacement noise), then offers "Add to brief".

## Key screens
1. **Marketing hero:** Waveform → Words center-stage on ivory; beneath, three real briefing cards from a demo call; footer band shows CRM logos with the split-flap sync animation on scroll.
2. **The Brief (money screen):** print-styled document — serif headline ("Acme × Nova — Discovery call"), decisions block, action items with owners as small avatar chips, risks in a thin coral-ruled box, and the full transcript folded behind a "Read the room" expander. A right margin holds timestamp anchors that scroll-spy.
3. **Pipeline view:** calls as a week-of-briefings stack (newspaper pile metaphor, slight rotation ±0.5° per card); unread briefs carry a coral corner dog-ear that un-folds (150ms) when opened.

## Component language
- Buttons: pill, broadcast blue, white text; secondary is ink-outline on paper. Press = 1px translate-down + shadow collapse (paper press).
- Cards: 12px radius, 1px stone border, shadow only on hover (paper lifting).
- Empty state: an ivory page with a single typed line animating: "Your next meeting will land here, already summarized."
- Loading: the typographic skeleton, never spinners.

## Reduced motion & fallback
Hero becomes a static three-panel storyboard (wave → text → cards). Split-flaps become crossfades. Typing/printing effects render instantly with an 80ms fade. All timing states also written in text.
