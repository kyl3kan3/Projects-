# InboxPilot — Design Specification

## Design vision
A co-pilot's cockpit grafted seamlessly into Gmail. The constraint *is* the
design: 90% of InboxPilot lives inside someone else's UI, so the identity must be
achieved with almost nothing — one brass accent, one perfect writing animation,
and typography that feels like a fountain pen upgraded Gmail. Aviation-instrument
precision, zero visual noise inside the inbox.

## Brand identity

| Role | Color | Hex |
|---|---|---|
| Instrument navy | `#122036` |
| Brass | Pilot brass | `#C79A3B` |
| Sky | Horizon blue | `#3B82D0` |
| Paper (in-Gmail surfaces) | `#FFFFFF` |
| Drafting | Graphite | `#4B5563` |
| Text | `#17233B` on light / `#E8EDF6` on navy |

- **UI:** `Inter` — must sit invisibly next to Google Sans/Roboto.
- **Marketing display:** `Saans` (fallback `Archivo`) with an italic brass underline motif shaped like a flight path.
- **Logo:** a paper plane whose fold lines form an envelope flap. Icon: brass plane on navy.
- **Voice:** competent copilot. "Drafted in your voice. Edit anything."

## Art direction
- **In-Gmail rule of one:** exactly one InboxPilot element visible at rest — the brass plane button in the compose toolbar. Everything else appears on demand and inherits Gmail's own spacing/type scale so it feels native, distinguished only by the brass accent and a 1px navy top rule on our panels.
- Marketing site inverts to instrument-navy with brass gauges and horizon-line dividers (an artificial-horizon motif: a two-tone divider that tilts ±2° on scroll and self-levels).
- Shadow DOM surfaces: white cards, 8px radius, Google-weight shadows — plus our 1px navy signature rule.

## The signature moment — "The Approach"
Marketing hero: a real Gmail thread (recreated with care) sits center. A brass
paper plane flies in on a curved approach path (2D path animation with banking
rotation, 900ms `ease-out-expo`), lands on the reply box, and **the reply writes
itself** — not character spam, but *composed* writing: phrases appear in
thought-groups (2–5 words) with variable rhythm and a brief pause before the
sign-off, exactly like a person who knows what to say. Then three tone chips
(Shorter · Warmer · Firmer) fan out beneath; clicking one *revises visibly* —
strikethrough ripples remove words while replacements settle in, a live redline
(400ms). Copy: "Your voice. On autopilot." This writing rhythm — grouped,
confident, human — is the brand's most important animation and must be tuned to
the millisecond (word-group interval 90–220ms randomized, sign-off pause 450ms).

## Motion system
- **Draft insertion (in Gmail):** same composed-writing rhythm at 1.5× speed; the caret is brass while InboxPilot writes, returns to Gmail's caret on handoff — an explicit "controls returned to you" cue.
- **Tone rewrite:** inline redline ripple as above; the edited draft never flashes wholesale.
- **Voice-training progress:** an altimeter-style gauge winds up as sent-mail analysis proceeds (needle sweep + ticking counter of "emails studied").
- **Follow-up reminders:** a small brass flag plants itself on the thread row (120ms stick-in with 1 overshoot); due reminders gently wave (2° rotation, 3s cycle, max 2 visible waving at once).
- **Quota meter (popup):** a fuel gauge; low quota shifts the needle zone amber — never red inside someone's inbox.

## Key screens
1. **Marketing hero:** The Approach on a navy runway-lit stage; beneath, a horizon-divider then three instrument cards (Voice / Tones / Follow-ups) with gauge micro-animations on scroll.
2. **In-Gmail draft panel (money surface):** the reply written in place + tone chips + a discreet "why this draft" expander citing thread context lines; footer row: regenerate (circular brass arrow), settings, and character count in graphite.
3. **Popup dashboard:** plan + fuel-gauge quota, voice-profile status with "last calibrated" date, snippet library with variable chips in brass braces `{{first_name}}`.
4. **Onboarding:** three panes — install → open Gmail (with a live arrow pointing at the real compose button position) → first draft; the privacy card states the style-profile promise in one sentence with a link, no legal fog.

## Component language
- Buttons (in Gmail): Gmail-scale, white with navy text; the single primary uses brass fill only in our own panels, never injected into Gmail's chrome.
- Chips: pill, 1px navy line, brass fill on active.
- Empty states: the paper plane parked on a runway line: "Open any email and hit the plane."
- Errors: navy toast, bottom-left, with a one-line fix suggestion.

## Reduced motion & fallback
Approach → static landed-plane frame with the finished draft visible. Composed-writing → full draft fades in (120ms) with a brass caret blink. Redline ripple → before/after crossfade. Gauges → stepped positions.
