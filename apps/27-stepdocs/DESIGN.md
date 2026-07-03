# StepDocs — Design Specification

## Vision
StepDocs turns a messy screen recording into a calm numbered guide, and that guide
is mostly *read* on a phone — someone following along on mobile while doing the task
on another screen. So the viewer is the product: crisp, typeset, thumb-scrollable
documentation with one blueprint blue and step numbers you could set your watch by.
The recorder is a desktop extension; the reading experience is mobile-first.

## Mobile layout (390 × 844)
- **Nav:** the viewer opens to a title block (guide title 28px, step count, author) then
  a vertical stream of steps. A slim top bar carries back, the guide title, and a share
  icon. A **progress spine** runs down the left gutter, filling as you scroll.
- **Hero (a step):** each step is a full-width card — a large numbered circle (blueprint
  blue, white numeral), the instruction line in 16px, then the screenshot in a hairline
  frame with the **pulse ring** marking exactly where the click landed. Screenshots size
  to phone width; wide captures scroll inside their own `overflow-x:auto` frame.
- **Primary action:** a **checklist toggle** and a **Replay** control sit in a bottom
  action bar within thumb reach; in checklist mode, a large 44px check on each step
  advances and auto-scrolls to the next.
- **Key components at phone width:** the footer badge ("Made with StepDocs") is small and
  self-respecting; redacted regions render as frosted glass with a shield glyph; the
  share sheet slides up from the bottom.

## Identity
| Role | Name | Hex |
|---|---|---|
| Field white | `#FCFDFF` |
| Blueprint (step blue / CTA) | `#2563EB` |
| Ink | `#111827` |
| Ghost / pulse accent (sky) | `#7DD3FC` |
| Redaction (slate frost) | `#94A3B8` |
| Done green | `#22C55E` |

Muted `#6B7280`.

- **Type:** the whole brand is **Inter** wielded with discipline — guide titles 28–32/700,
  step titles 600, body 400/16px. Step numerals are custom-drawn in 28px circles,
  optically corrected per digit — the most-seen brand asset.
- **Signature detail — the pulse ring + tap-through Replay:** every screenshot marks the
  interaction point with a two-ring blueprint target of fixed geometry everywhere. The
  viewer's **Replay** advances step to step with a horizontal slide-and-settle and blooms
  the pulse ring at each click point (`dur-standard` per step, user-pausable). On mobile
  it is a paced, tappable slideshow — no canvas ghost-cursor cinematics required; the ring
  bloom is the whole move, and it runs at 60fps as CSS transform + opacity.
- Redaction is shown proudly: frosted region + tiny shield — guides display what they
  don't show.

## Responsive
The mobile stream is the base. On `lg` the viewer gains a sticky step-list rail on the
left and a wider reading measure (~68ch). The desktop **editor** (authoring) is its own
layout — step cards on a spine, live screenshot canvas with draggable pulse-ring re-crop,
brand controls in a top bar — and is explicitly a pointer/keyboard surface. **Optional
desktop enhancement:** the smooth ghost-cursor Replay (canvas + spring paths along the
real recorded coordinates); mobile keeps the paced ring-bloom version, which is complete.

## Motion & touch
- Editor reorder: drag step cards (`spring-gentle`), spine re-numbers with a 60ms cascade;
  up/down buttons are the equivalent. Merge plays a 180ms card-shuffle.
- Auto-text: raw captured text refines into human text with one left-to-right ripple on
  load — the AI's contribution shown once.
- Targets ≥44px. Viewer gestures: **swipe left/right** between steps in Replay, with
  on-screen prev/next buttons always present. Redaction regions frost in one-by-one
  (120ms) at author time.

## Key screens
1. **Guide viewer (the artifact, mobile-first):** the typeset stream above — Replay,
   checklist, tasteful footer badge.
2. **Marketing hero:** a real guide's Replay playing in a phone frame; beneath, the
   three-beat pitch (Record → It writes itself → Share) as three step-circles on a spine
   that draws on scroll; a clean comparison spec sheet vs Scribe.
3. **Editor (desktop authoring):** spine + step cards + screenshot canvas as above.
4. **Workspace library:** guides as cards with step-count in the circle motif and a
   freshness dot (green→amber as views drop or feedback flags "outdated"); spaces as tabs.

## Reduced-motion & fallback
Replay → manual step advance, pulse rings statically placed at their real positions.
Re-number ripple, thumbnail flights → instant. Frost applies without animation. Replay
stays available as a user-arrowed slideshow. All motion collapses to ≤100ms opacity.
