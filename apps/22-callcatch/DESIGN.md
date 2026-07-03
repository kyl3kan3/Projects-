# CallCatch — Design Specification

## Vision
A dispatcher's desk that never sleeps, built for people who work with their hands.
CallCatch's buyer is a plumber or a salon owner, so it must read as dependable equipment,
not startup software: high-visibility clarity, safety-orange borrowed from work gear, big
honest numbers, and one recurring truth — a call that would have been lost, visibly
caught. Restraint, not theater.

## Mobile layout (390 × 844)
The owner is under a sink or between clients; they check this on a phone, fast.
- **Nav:** bottom tab bar (Activity · Caught · Calendar · Setup), 56px, safe-area-aware.
- **Home = the money number first:** "Caught this month" tally with the estimated value
  in dispatch green, set at signage weight, filling the top third — legible at arm's
  length in daylight.
- **Activity feed:** caught / booked / message events as job-ticket cards, one column,
  newest on top. Each card: caller, job type stamp, value estimate, time in mono.
- **Live-call bar:** during an active AI call a slim on-air bar pins to the top with the
  caller number and a live transcription ticker; a 44px "Listen" joins muted.
- **Primary action** ("Test my AI" during setup, "Call back" on a lead) is a full-width
  button in the thumb zone.
- Long transcripts scroll inside their own container as a two-column dispatch log; the
  page body never scrolls sideways.

## Identity
| Role | Name | Hex |
|---|---|---|
| Shop floor | Deep slate | `#131A22` |
| Panel | Panel | `#1B2530` |
| Brand | Work orange | `#FF7A1A` |
| Answered | Dispatch green | `#3ECF8E` |
| Caught | Rescue cyan | `#39C7DD` |
| Lost | Ash | `#5B6672` |

Text `#EEF2F6`, muted `#8C99A8`.

- **Display:** `Roc Grotesk` (fallback `Archivo`) 700 — signage weight; the money numbers
  set like prices on a service truck. **UI:** `Inter`, 16px min. **Data:** `IBM Plex
  Mono` for call durations and timestamps.
- **Signature detail — the catch:** every real caught call arrives in the activity feed
  with a small, restrained motion — the ticket slides up and settles with a single firm
  `spring-snappy` snap (a 1px "landed" nudge), its fields stamping in as the AI captures
  them (job type, urgency, value estimate). Orange is reserved for live activity only;
  the recovered value rolls up once in dispatch green. No glove animation, no mascot — the
  weight of the snap is the whole feeling, and it runs at 60fps on a cheap phone.

## Responsive
Phone-first. At `md` the activity feed sits beside the calendar strip and on-air dock;
the setup wizard gains a preview pane. **Optional desktop enhancement:** the marketing
hero may run a looping recorded demo-call player (audio proof sells this product) styled
as a job ticket — real audio, not a rendered scene; the app never depends on it.

## Motion & touch
- Shared tokens: ticket arrival `spring-snappy`; field stamps `dur-micro`; value roll-up
  `ease-out-quart`, once. On-air bar border pulses gently at speech cadence.
- Missed-call rescue: the timeline shows the missed moment, then the +5s text-back as a
  short cyan reflex line snapping from missed → SMS event.
- Targets ≥44px; toggles drawn as rocker switches with a 1-frame orange arc on flip.
- Haptic tick when a new call is caught (native push-driven).

## Key screens
1. **Owner dashboard (money screen):** "Caught this month" tally + estimated value in
   green; activity feed of tickets with the catch snap on arrival; on-air bar dock and
   calendar strip.
2. **Setup wizard:** business profile as a laminated info card being filled; vertical pack
   selection as equipment presets ("Plumbing kit — 42 FAQs loaded"); a live test-call
   step where the owner hears their AI answer — the trust moment, staged carefully.
3. **Call detail:** full transcript as a two-column dispatch log (caller left, AI right),
   confidence-gated moments marked ("took a message — pricing beyond profile"), audio
   scrubber with speaker-colored waveform.
4. **Marketing hero:** a plain, honest "how many calls did you miss this week?" statement
   with the recorded demo-call player and per-vertical proof sections.

## Component language
- Buttons: bold 10px radius, orange fill / slate text; "Test my AI" styled as a
  push-to-talk switch. ≥44px.
- Cards: job-ticket styling — clipped top-right corner, stamped status chips, 2px top
  edge highlight (roll-cage feel).
- Empty state: an open glove under a spotlight: "Forward your number. We'll catch the
  next one."

## Reduced-motion & fallback
Catch snap → ticket appears with a cyan flash on new items. Field stamps → batched text.
Value roll-up → direct set with a green flash. On-air ticker → batched line updates.
Ripples off. Every number is fully readable without motion.
