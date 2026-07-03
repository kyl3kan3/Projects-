# CallCatch — Design Specification

## Design vision
A dispatcher's desk that never sleeps, designed for people who work with their
hands. CallCatch's buyer is a plumber, a salon owner — the design must read as
*dependable equipment*, not startup software: high-visibility clarity, safety-
orange accents borrowed from work gear, big honest numbers, and one recurring
piece of theater: the catch — a call that would have been lost, visibly saved.

## Brand identity

| Role | Color | Hex |
|---|---|---|
| Shop floor | Deep slate | `#131A22` |
| Panel | `#1B2530` |
| Brand | Work orange | `#FF7A1A` |
| Answered | Dispatch green | `#3ECF8E` |
| Missed→caught | Rescue cyan | `#39C7DD` |
| Lost (pre-CallCatch) | Ash | `#5B6672` |
| Text | `#EEF2F6` / muted `#8C99A8` |

- **Display:** `Roc Grotesk` (fallback `Archivo`) 700 — signage weight; big numbers set like the prices on a service truck.
- **UI:** `Inter`; call durations/timestamps in `IBM Plex Mono`.
- **Logo:** a phone handset caught in a baseball-glove curve. Icon: the glove-curve cradling a dot.
- **Voice:** dispatcher-plain. "Caught a call at 7:42pm. Booked a water-heater job. $1,400 est."

## Art direction
- Equipment aesthetic: chunky 12px-radius panels with a 2px top edge highlight (roll-cage feel), toggle switches drawn like real rocker switches, status lights with physical bezels.
- Orange discipline: reserved for live activity and primary actions; the money numbers (revenue recovered) render in dispatch green.
- Client-facing surfaces (the owner's dashboard is also shown to *their* customers? no —) the dashboard is owner-only; call/SMS transcripts styled like clean job tickets.

## The signature moment — "The Catch"
Marketing hero: a phone rings on screen — a ring ripple expanding from a phone
glyph (concentric rings, 1.2s intervals). Ring one... ring two... a ghosted
caller card starts sliding toward a dark "LOST" drain at screen edge (this is
the industry's status quo, rendered). At ring three, **CallCatch's glove-curve
sweeps in** (400ms `ease-out-expo` arc) and *catches* the card mid-slide — the
card snaps into the glove with a satisfying leather-thud settle (`spring-snappy`
+ 2px shake), flips over, and fills itself in live: transcription lines typing,
job type stamping ("WATER HEATER — URGENT"), an estimated-value counter rolling
to $1,400, and a booked-appointment chip clicking onto the calendar strip below.
A tally in the corner increments: "Caught this month: 23 · ~$18,600." Loop with
varied scenarios (salon, dental, HVAC). In-product echo: every real caught call
lands in the activity feed with a miniature glove-catch (300ms).

## Motion system
- **Live call state:** an on-air bar slides down from the dashboard top during active AI calls — ring ripple, caller number, live transcription ticker (words fade in as spoken); the owner can tap "listen" (joins muted) — the bar's border pulses orange at speech cadence.
- **Missed-call rescue (SMS path):** the timeline shows the missed-call moment, then the text-back firing at +5s as a visible reflex arc (a cyan line snaps from the missed event to the SMS event).
- **Lead qualification progress:** job-ticket fields (job type / location / urgency / contact) fill as the AI conversation captures them — each field stamps in with a press; partially captured tickets show honest empty slots.
- **Booking:** the calendar strip's chosen slot expands with `spring-gentle` and the confirmation SMS renders as a sent receipt sliding off.
- **Revenue-recovered dashboard:** the monthly figure rolls up on load; below it, caught-call cards stack like completed job tickets on a spike.

## Key screens
1. **Marketing hero:** The Catch, full theater; below, a real recorded demo call player styled as a job ticket with a play button (audio proof sells this product), then per-vertical sections with the ripple recolored.
2. **Owner dashboard (money screen):** top: "Caught this month" tally + estimated value in dispatch green; middle: activity feed of tickets (caught/booked/message) with the mini-glove animation on arrival; right: the on-air bar dock and calendar strip.
3. **Setup wizard:** business profile as a laminated info card being filled; vertical pack selection as equipment presets ("Plumbing kit — 42 FAQs loaded"); the live test-call step renders the ripple and lets the owner hear their AI answer — the trust moment, staged carefully.
4. **Call detail:** full transcript as a two-column dispatch log (caller left, AI right), confidence-gated moments marked ("took a message here — pricing question beyond profile"), audio scrubber with speaker-colored waveform.

## Component language
- Buttons: bold 10px-radius, orange fill with slate text; the "test my AI" button styled as a push-to-talk switch.
- Cards: job-ticket styling — clipped corner top-right, stamped status chips.
- Toggles: rocker switches with a 1-frame orange arc flash on flip.
- Empty state: an open glove under a spotlight: "Forward your number. We'll catch the next one."

## Reduced motion & fallback
The Catch → three static panels (ringing / caught / ticket filled). Ripples → static rings. Live ticker → batched line updates. Glove micro-animations → cyan flash on new items. Value counters → direct set with green flash.
