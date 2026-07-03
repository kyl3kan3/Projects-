# InboxPilot — Design Specification

## 1. Vision
InboxPilot writes send-ready replies in your own voice, inside plain Gmail. 90% of
it lives inside someone else's UI, so the identity is achieved with almost nothing:
one brass accent, one perfect writing rhythm, and type that sits invisibly beside
Google's own. Competent copilot, zero visual noise.

## 2. Mobile layout (390×844)
The Chrome extension itself is a desktop-Gmail surface — but the parts users
*discover, buy, and manage* on are mobile-first, and they carry the brand. Honest
split: the injected draft UI is desktop; the marketing site, onboarding, and the
account/billing app are designed phone-first.

- **Marketing / onboarding (mobile):** single column. Hero shows a recreated Gmail
  thread with the reply composing itself in grouped phrases; one brass CTA —
  **"Add to Chrome"** — pinned in the bottom third (with an "email it to my laptop"
  fallback for phone visitors who can't install here).
- **Account app (mobile):** a **bottom tab bar** — Plan · Voice · Snippets ·
  Settings. Plan shows a fuel-gauge quota; Voice shows profile status and "last
  calibrated"; Snippets is a searchable list with variable chips.
- **In-Gmail panel (desktop reality, documented):** a single brass plane button in
  the compose toolbar at rest; the draft panel appears on demand, inherits Gmail's
  spacing/type, marked only by a 1px navy top rule. On Gmail mobile web the same
  composed-writing insertion works in the native compose box — no injected chrome.
- Body ≥16px; account-app targets ≥44px in the thumb zone.

## 3. Identity
| Role | Name | Hex |
|---|---|---|
| Base | Instrument navy | `#122036` |
| Brand | Pilot brass | `#C79A3B` |
| Accent | Horizon blue | `#3B82D0` |
| Surface | Paper white | `#FFFFFF` |
| Drafting | Graphite | `#4B5563` |
| Text | `#17233B` on light / `#E8EDF6` on navy |

- **UI:** `Inter` — must sit invisibly next to Google Sans/Roboto inside Gmail.
  **Marketing display:** `Saans` (fallback `Archivo`) with an italic brass
  underline shaped like a flight path.
- **Logo:** a paper plane whose fold lines form an envelope flap.
- **Signature detail — composed writing.** The one brand animation: a draft
  appears not as character-spam but as *thought-groups* (2–5 words) with variable
  rhythm (interval 90–220ms randomized) and a brief pause before the sign-off —
  like a person who knows what to say. The caret is brass while InboxPilot writes
  and returns to Gmail's caret on handoff ("controls returned to you"). Pure
  text-timing, runs identically at 60fps on desktop and mobile.

## 4. Responsive
The account app and marketing scale mobile → desktop as a widening single column
(content ~65ch). The in-Gmail panel is inherently desktop but never assumes width
beyond Gmail's own compose column. **Optional desktop-only enhancement (marketing):**
an artificial-horizon divider that tilts ±2° on scroll and self-levels —
CSS scroll animation, purely decorative, static level line as the default. No 3D.

## 5. Motion & touch
- Shared tokens: draft insertion uses the composed-writing rhythm; chips
  `spring-snappy`; gauges `dur-standard`.
- **Tone rewrite:** one-tap Shorter / Warmer / Firmer revises *visibly* — an inline
  redline where struck words ripple out and replacements settle (400ms); the draft
  never flashes wholesale.
- **Voice-training progress:** an altimeter-style gauge winds up with a ticking
  "emails studied" counter — honest progress, not spinner.
- **Quota (account app):** a fuel gauge; low quota shifts the needle amber, never
  red.
- **Touch:** account-app and tone chips ≥44px; snippet rows swipe to edit (Edit
  button is the equivalent). No custom gestures inside Gmail — respect the host.

## 6. Key screens (mobile-first where applicable)
1. **Marketing hero (mobile):** recreated thread + composed-writing demo, tone
   chips fanning beneath, brass CTA in the thumb zone.
2. **In-Gmail draft panel (desktop money surface):** the reply composed in place +
   tone chips + a discreet "why this draft" expander citing thread lines; footer:
   regenerate, settings, char count.
3. **Account app (mobile):** plan + fuel-gauge quota, voice-profile status with
   "last calibrated" date, snippet library with `{{first_name}}` brass chips.
4. **Onboarding (mobile):** install → open Gmail → first draft, with the
   style-profile privacy promise stated in one plain sentence and a link.

## 7. Reduced-motion & fallback
Composed writing → the full draft fades in (120ms) with one brass caret blink.
Redline ripple → a clean before/after crossfade. Gauges → stepped positions,
no sweep. Horizon divider → static level line. Every draft and tone action is
fully usable with all motion removed.
