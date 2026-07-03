# StepDocs — Design Specification

## Design vision
Clarity as a craft object. StepDocs turns chaos (a screen recording) into calm
(a numbered guide) — so the design is instructional-design perfection: crisp
white, one blueprint blue, numbered circles you could set your watch by, and a
signature ghost that replays how work was done. If IKEA's best manual and
Figma's polish had a child, it would look like this.

## Brand identity

| Role | Color | Hex |
|---|---|---|
| Field white | `#FCFDFF` |
| Blueprint | Step blue | `#2563EB` |
| Ink | `#111827` |
| Ghost cursor | Sky | `#7DD3FC` |
| Redaction | Slate frost | `#94A3B8` |
| Done green | `#22C55E` |
| Muted | `#6B7280` |

- **Display & UI:** `Inter` — the entire brand is Inter wielded with unusual discipline; step titles at 600, body at 400/15px, guide titles at 32/700.
- **Step numbers:** custom-drawn numerals in 28px circles (step blue, white numeral, 2px ring) — the brand's most-seen asset, optically corrected per digit.
- **Logo:** three stacked step-circles (1·2·3) with a connecting spine. Icon: the ①-circle.
- **Voice:** clear instructor. "Step 4 of 11 — Click **Save invoice** in the top right."

## Art direction
- Screenshot presentation is the craft: every captured image sits in a hairline frame with a soft 12px shadow, and the interaction point is marked by the **pulse ring** — a 2-ring blueprint-blue target exactly where the click happened (rings at 60% and 100% radius, geometry consistent everywhere).
- Redaction is a visible virtue: blurred regions render as frosted glass with a tiny shield glyph — guides proudly show what they *don't* show.
- The viewer typesets like premium documentation: 68ch measure, generous step spacing, keyboard-scrollable with the active step's number filling solid.

## The signature moment — "The Ghost Replay"
At the top of every guide viewer: **Replay**. The guide's steps perform
themselves — a translucent sky-blue **ghost cursor** (with a soft comet trail,
6px falloff) glides across each screenshot along the recorded path (eased,
600–900ms per step), the pulse ring blooms at the click point, typed text
re-types into fields as dots (redaction-aware), and the viewer advances with a
horizontal slide-and-settle. Step numbers tick like a metronome; a progress
spine on the left fills segment by segment. It converts a static SOP into a
30-second silent film of the task — the fastest possible "oh, I get it." The
same ghost, at recording time, gives the author a live thumbnail of what's
being captured (miniature ghost following their real cursor in the extension
popup) — capture and playback share one soul. Built with canvas + spring paths;
recorded coordinates are real, so the ghost is honest.

## Motion system
- **Recording state:** the extension badge pulses softly; each captured step flies a thumbnail into the step counter (240ms arc, scale to 0) — the author *feels* steps accumulating without looking away.
- **Editor:** steps are cards on a vertical spine; dragging reorders with `spring-gentle` and the spine re-numbers with a ripple (numbers flip like a counter, 60ms cascade); merging two steps plays a card-shuffle-together (180ms).
- **Auto-text polish:** raw captured text ("clicked div.btn-primary") visibly refines into human text ("Click **Save invoice**") with a single left-to-right rewrite ripple on load — the AI's contribution, made visible once.
- **Redaction suggest:** detected PII regions frost over one-by-one (120ms each) with the shield; author confirms per-region or all.
- **Publish:** the guide compresses into a link chip with a satisfying zip motion; the chip's copy button stamps.
- **Viewer checklist mode:** checking a step fills its number solid, strikes nothing (steps stay readable), and auto-scrolls to the next with `ease-in-out-soft`.

## Key screens
1. **Marketing hero:** a real guide playing its Ghost Replay in a device frame, autoplaying; beneath, the three-beat pitch (Record → It writes itself → Share) as three step-circles with connecting spine that draws on scroll; comparison table vs Scribe styled as a clean spec sheet.
2. **Editor (money screen):** spine + step cards left, live screenshot canvas right with pulse-ring repositioning (drag the ring, it re-crops), brand controls in a top bar.
3. **Guide viewer (the artifact):** typeset document + Replay button + checklist toggle; footer badge tasteful and small — it's our billboard, styled with self-respect.
4. **Workspace library:** guides as cards with their step-count in the circle motif, freshness dot (green→amber as views drop / feedback flags "outdated"), spaces as tabs.

## Component language
- Buttons: 8px radius, step blue; secondary ink-outline. Press = 0.97.
- Step cards: white, hairline border, number circle left, screenshot thumb right.
- The pulse ring: exact geometry everywhere (24px inner, 40px outer at rest, blooms to 56px on emphasis).
- Empty state: circle ① alone: "Hit record. Do the thing once. We'll write it down."

## Reduced motion & fallback
Ghost Replay → step-by-step manual advance with the pulse ring statically placed (positions preserved). Re-number ripples → instant. Thumbnail flights → counter increments. Frost applies without animation. Replay remains available as a paced slideshow (user-controlled arrows).
