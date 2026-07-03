# AnswerDesk — Design Specification

## Design vision
A calm concierge desk at a good hotel: present, composed, never performative.
AnswerDesk's differentiator is *honesty* — a bot that says "I don't know" — so
the design must make honesty feel premium rather than deficient: deep teal calm,
a thinking presence with real body language, and citations treated like
footnotes in a well-edited book. The widget is the product; it must be the most
refined chat bubble on the internet.

## Brand identity

| Role | Color | Hex |
|---|---|---|
| Deep sea | `#0B2530` |
| Panel | `#123240` |
| Brand | Concierge teal | `#2DD4BF` |
| Citation | Reference blue | `#60A5FA` |
| Honest unknown | Linen | `#E8E3D8` |
| Handoff | Human amber | `#F5B15C` |
| Text | `#EAF4F2` / muted `#7FA39E` |

- **Display:** `Reckless` (fallback `Source Serif 4`) for marketing headlines — editorial trust; **UI & chat:** `Inter` at 15px/1.6 — chat text is the product's body copy and gets book-quality typesetting (proper quotes, no orphan words via balance).
- **Logo:** a speech bubble whose tail is a bookmark ribbon. Icon: bubble-ribbon on teal.
- **Voice:** the bot's persona ships neutral-professional and inherits the customer's brand voice via settings; *our* marketing voice: quietly confident ("It answers. Or it says it doesn't know. Both build trust.").

## Art direction
- **The Orb:** the bot's avatar is a small liquid orb (metaball shader, 48px) in concierge teal — not a face, a presence. Its physicality carries all bot state (below).
- Widget surfaces: near-white glass on any site (backdrop-blur 12px, 92% white) with the merchant's accent applied to user bubbles; dark-site auto-detection flips to smoked glass.
- Citations render as superscript reference chips `[1]` that are *part of the sentence's typography*, not bolted-on badges.

## The signature moment — "The Orb That Thinks"
The orb has honest body language, choreographed as a state machine:
**Listening** — calm sphere, micro-ripples on voice/typing cadence. **Thinking**
— the orb elongates and *dives* (squash-stretch downward, like ducking into the
archives) leaving expanding search rings; retrieved chunks flicker across its
surface as faint text glints. **Answering** — it resurfaces with a soft bloom
and the answer streams. **Uncertain** — the crucial one: the orb *settles and
mattes* (gloss drains, it becomes linen-toned, perfectly still) as it says
"I'm not certain — want me to hand this to a person?"; no shame animation, a
dignified material change. **Handoff** — the orb warms to amber and slides
aside, leaving a clean email/Slack card. Uncertainty rendered as composure is
the entire brand thesis in one animation. Built in Rive with a shader-gloss
layer; 2D fallback sprite sheet.

## Motion system
- **Answer streaming:** text arrives in sense-groups (like InboxPilot's rhythm but slower, 120–260ms groups); citations pop in superscript *after* their sentence completes (120ms, 1.2→1).
- **Citation hover/tap:** the chip unfurls a source card (title, favicon, quoted passage with the relevant lines highlighted) rising 8px with `spring-gentle`; the quoted lines get a reference-blue left rule that draws.
- **Widget open:** launcher orb → panel via a single fluid morph (orb stretches into the panel's corner, 380ms `ease-out-expo`) — never a separate popup blink.
- **Deflection dashboard:** the deflection donut fills; handed-off segment renders in amber *with equal visual dignity* (same weight, no red) — honest analytics styled honestly.
- **Content-gap report:** unanswered clusters rise as linen cards sorted by frequency; clicking one drafts the suggested doc outline with lines drawing in.

## Key screens
1. **Marketing hero:** a live widget, center, answering real questions about AnswerDesk itself (dogfood); scripted to hit one uncertain-state on the third question so every visitor *sees* the honesty moment; the orb's states annotated in the margins like a specimen diagram.
2. **Setup wizard:** URL in → crawl progress as a sitemap tree lighting up node-by-node → "ask it something" test chat inline; time-to-bot under 10 minutes is a design KPI.
3. **Money screen — Deflection analytics:** resolved-by-bot vs handed-off vs unanswered, weekly trend, and the content-gap list ("write these 3 docs, deflect ~120 more tickets") — the screen that renews subscriptions.
4. **Conversation explorer:** transcripts with the orb's state changes marked in the margin timeline (thinking/uncertain/handoff icons) — support leads audit honesty itself.

## Component language
- Buttons: 10px radius, teal fill with deep-sea text; handoff actions always amber-outlined.
- Bubbles: bot = glass with 14px radius and the orb docked left; user = merchant accent, right; system notes = centered linen capsules.
- Empty state: the orb asleep (slow 6s breathing): "Index a site and wake it up."
- Source cards: favicon, title, passage; never more than 3 lines quoted.

## Reduced motion & fallback
Orb states → color/matte swaps with 80ms fades (glossy teal / linen matte / amber). Morphing open → simple scale-fade. Streaming → paragraph-level fades. Search rings and text glints off. All states also announced in text for screen readers ("Checking the docs…", "Not fully certain.").
