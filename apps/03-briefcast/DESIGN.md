# Briefcast — Design Specification

## Vision
The feeling of walking out of a meeting where someone brilliant took the notes for
you. Briefcast is editorial, not techy — warm paper, confident serif headlines, a
morning briefing typeset by a magazine. The single living idea: speech turned into
structure you can trust enough to write back to your CRM.

## Mobile layout (390 × 844 — the primary spec)
Reps read the brief on their phone right after a call, often walking to the next one.
The phone shows the answer — decisions, action items, what needs them — before any
transcript.

- **Nav:** bottom tab bar — Briefs · Deals · Slack · Settings — above the safe-area
  inset. Broadcast blue reserved for the active tab only.
- **Landing:** ivory single column. Serif headline, one line of proof
  ("3 decisions. 5 action items. 2 need you."), then three real briefing cards
  stacked vertically, then a CRM-sync proof card. Sticky bottom CTA after scroll.
- **The Brief (money screen)** reads like a printed page on the phone: serif meeting
  title, a **decisions** block, **action items** as checkable rows with owner avatar
  chips, **risks** in a thin coral-ruled box, and the full transcript folded behind a
  "Read the room" expander. Measure held tight; body 16px, 1.6 line-height.
- **Primary action** in the thumb zone: a full-width **Sync to HubSpot** (or
  **Review changes**) bar pinned bottom, showing count of proposed field updates.
- **Key components at phone width:** briefing card (12px radius, hairline border,
  shadow on press only); action-item row (checkbox ≥44px, owner chip, due date);
  CRM field-change row (old → proposed value, per-field approve toggle); live
  "on-air" waveform chip when a bot is in a call.

## Identity
| Role | Hex |
|---|---|
| Paper (ivory) | `#FAF7F2` |
| Ink (espresso) | `#1C1917` |
| Broadcast blue | `#2456F0` |
| Signal coral | `#FF6A5C` |
| Marker yellow | `#FFE8A3` |
| Stone (muted) | `#78716C` |

- **Display:** `Tiempos Headline` (fallback `Source Serif 4`) — decisions deserve a
  serif.
- **Text:** `Inter`, 16px min. **Data/mono:** `JetBrains Mono` 12px caps for speaker
  labels and timestamps.
- **Light-first.** Blue means interactive; coral means *action item*, nothing else.
- **Signature detail — the printing skeleton.** While a summary generates, the
  placeholder isn't a spinner or shimmer bar: it's typographic — gray text-shaped
  bars that resolve into real sentences paragraph by paragraph, top-down (~120ms
  each), like a page coming off a press. Pure Framer Motion / CSS, weightless on a
  phone. The brand's promise (speech becomes typeset structure) is the loading state.

## Responsive
The phone's single column becomes brief-plus-margin on tablet (≥768px: document with
a scroll-spy timestamp rail) and a three-pane workspace on desktop (≥1024px: pipeline
list · brief · deal timeline). The marketing hero's waveform-to-words canvas animation
is a **desktop/tablet-only** enhancement, scroll-scrubbable; on phone the hero is a
static three-panel storyboard (wave → text → cards) that stands on its own. No 3D.

## Motion & touch
- Shared tokens. Action-item checkoff: checkbox stroke draws (150ms), text strike
  draws left→right, row exhales 2px and re-sorts with `spring-gentle`.
- CRM sync: field chips flip split-flap style (per-chip 200ms, 40ms stagger) from
  "pending" to the mapped field name — one honest confirmation, not a loop.
- Bot-joins-call: the waveform chip does a 2-frame "on air" blink, then settles to
  breathing at actual input level.
- **Touch:** targets ≥44px; approve toggles and the sync bar sit in the thumb zone.
- **Gestures:** swipe a brief card to archive (also overflow menu); long-press
  transcript text to highlight and "Add to brief" (also a selection toolbar button).
  Native haptic tick on check-off in the Expo build; web falls back silently.

## Key screens (mobile-first)
1. **The Brief:** print-styled document, decisions/action-items/risks, folded
   transcript, Sync bar bottom.
2. **CRM review sheet:** proposed field updates as old→new rows with per-field
   approve; "Apply all" in thumb zone; split-flap confirms on apply.
3. **Deal timeline:** a deal's meetings as a vertical stack with extracted signals
   (commitments, objections, slippage) anchored by date.
4. **Pipeline:** week of briefs as a stack; unread carry a coral dog-ear that unfolds
   on open.

## Reduced-motion & fallback
Printing skeleton → sentences appear at once with an 80ms fade. Split-flaps →
crossfade. Check-off draw → instant. Hero animation → static storyboard. Every timing
or status also stated in text ("Synced · 4 fields").
