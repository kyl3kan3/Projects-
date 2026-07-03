# InboxPilot — Design Specification (v3, redline level)

## Vision
InboxPilot writes send-ready replies in your own voice inside plain Gmail.
90% of it lives inside someone else's UI, so the identity is achieved with
almost nothing: one brass accent, one perfect writing rhythm, and type that
sits invisibly beside Google's own. Competent copilot, zero visual noise.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load. Extra law: **inside Gmail, defer to Gmail** —
inherit its spacing and type metrics, add no chrome beyond one hairline and
one brass mark.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `paper` | `#FAFAF8` | Ground of the marketing site & account app |
| `gmail-white` | `#FFFFFF` | The in-Gmail panel ground — Gmail's own surface, untouched |
| `hairline` | `#E6E4DD` | 1px dividers (in-Gmail panel uses `#E8EAED`, Gmail's own gray) |
| `ink` | `#17233B` | Primary text; **primary button fill on light grounds** |
| `text-2` | `#5D6675` | Secondary text |
| `text-3` | `#9AA1AD` | Faint (char counts, placeholders) |
| `navy` | `#122036` | Dark ground: marketing footer & hero panel only |
| `paper-btn` | `#F4F2EC` | **Primary buttons on `navy`** (ink text) |
| `brass` | `#B8892E` | THE accent. ≤10% of any surface — and ≤2% inside Gmail: the plane mark, the writing caret, active states, links |
| `green` | `#2E8F63` | Success only (draft inserted, voice calibrated) |
| `amber` | `#C07A1A` | Warning only (low quota — never red) |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: brass never fills a button or a surface; ink-filled primaries on
light grounds, `paper-btn` on navy. Inside Gmail the ONLY InboxPilot colors
are brass (mark + caret) and ink text — everything else is Gmail's.

## Type — exact specimen

Faces: **Archivo** (600/700) for marketing display · **Inter** (400/500/600)
for all product UI — chosen to sit invisibly next to Roboto/Google Sans ·
**JetBrains Mono** (500) for data. Self-hosted/embedded everywhere we own;
inside Gmail, body text inherits Gmail's own stack deliberately.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (marketing) | Archivo 700 | `clamp(32px, 9vw, 56px)` / 1.08 | −0.02em |
| H2 | Archivo 600 | 24 / 1.15 | −0.01em |
| Title (row/card) | Inter 600 | 16 / 1.3 | 0 |
| Body | Inter 400 | 16 / 1.55 | 0 |
| Secondary | Inter 400 | 13 / 1.45 | 0 |
| Label | Inter 600 | 11 / 1.2 | +0.08em, uppercase |
| Data (quota, dates) | JBM 500 | 13 / 1.2 | 0, tabular figures |
| Snippet variable | JBM 500 | 14 / 1.3 | 0 |
| Button | Inter 600 | 15 / 1 | 0 |

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
  In-Gmail panel padding matches Gmail's compose padding (16) exactly.
- Radii: **8** (controls: buttons, inputs, chips) · **12** (framed cards:
  the recreated-thread demo, quota panel) · **16** (sheets). Nothing else.
- Elevation: none of ours. The in-Gmail panel casts no shadow — it is part of
  the compose box, separated by one hairline.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `plane` (brand), `sliders` (tone), `waveform` (voice),
`braces` (snippets), `gauge` (quota), `key`, `shield` (privacy), `refresh`
(regenerate), `copy`, `check`, `chevron-down`, `chevron-left`, `mail`,
`clock` (follow-up), `settings`, `plus`. Account-app tab bar renders at 22px;
inside Gmail the plane renders at 18px to match Gmail's toolbar icons.
**No emoji, anywhere, ever** — including inside generated drafts' UI chrome.

## Component construction (exact)

- **Primary button (light grounds):** ink fill, `paper` text, radius 8,
  height 48 (44 inside Gmail, matching Gmail's Send), Inter 600 15. Press:
  scale 0.98 + fill `#0F1930`. Disabled: `#DAD7CD` fill, `text-3` text.
- **Primary on `navy`:** `paper-btn` fill, ink text — same geometry.
- **Secondary:** transparent, 1px hairline, ink text. Press: border `#CFCBC0`.
- **Quiet action:** text-only brass; press dims to 80%.
- **Input:** white fill, hairline border, radius 8, height 48, 16px text.
  Focus: border brass + 2px offset ring at 25% brass.
- **Tone chips (Shorter · Warmer · Firmer · More formal):** height 36,
  radius 8, hairline; active = brass 1px border + brass text; inside Gmail
  they sit in one horizontal row under the draft, Gmail-gray until hover.
- **List rows (snippets, history):** NO boxes. Full-bleed hairline rows,
  ≥56px: Title 16, JBM meta (`used 14× · edited Jun 30`), chevron.
  Variables render as JBM chips: `{{first_name}}` in brass at 12% tint.
- **Quota gauge:** a horizontal 4px track (hairline) with ink fill and a JBM
  reading right-aligned: `61 / 100 DRAFTS`. ≥90% used: fill turns amber.
  No dials, no fuel-gauge skeuomorphism.
- **In-Gmail panel:** appears inside the compose box above the draft area:
  one hairline top rule, an 18px brass plane + `INBOXPILOT` Label(11) in
  `text-3`, tone chip row, then footer — `regenerate` glyph, char count in
  JBM, "why this draft" quiet action. Nothing floats, nothing overlays Gmail.
- **Account-app tab bar:** height 56 + safe-area, `paper` 96% + blur,
  hairline top. Plan / Voice / Snippets / Settings, 22px icons + 10px labels.
  Active = ink + 2px brass dot; inactive = `text-3`.

## The signature — composed writing
The one brand animation, exactly: the draft appears as *thought-groups* of
2–5 words, not character spam — group intervals randomized 90–220ms, a 350ms
pause before the sign-off ("like a person who knows what to say"). While
writing, the caret is a 2px brass bar blinking at 530ms; on completion it
hands back to Gmail's native caret ("controls returned to you") and a 16px
green check draws beside the plane mark for 800ms, then fades. Pure text
timing + one SVG stroke, identical at 60fps on desktop and phone.

## Mobile layout (390×844 — primary spec)
The injected UI is desktop Gmail; discovery, buying, and managing are
phone-first and carry the brand.
- **Marketing (mobile):** gutter 20. Archivo headline "Your reply. Already
  written." over a framed recreated-thread card (radius 12): a real thread —
  "Re: Q3 contract renewal" from "Dana Okafor" — with the reply composing
  itself in thought-groups; tone chips fan beneath. Primary button **Add to
  Chrome** pinned in the thumb zone; under it the quiet action "Email me the
  link for my laptop".
- **Account app — Plan:** quota gauge (`61 / 100 DRAFTS`, resets Aug 1),
  plan row "Basic · $8/mo", primary "Upgrade to Pro". Voice: profile status
  row ("Calibrated from 142 sent emails · Jun 12"), `waveform` glyph,
  secondary "Recalibrate", and the privacy promise in one Body sentence with
  a `shield` glyph — "We store style features, never your emails."
- **Snippets:** search input, hairline rows ("Intro call follow-up",
  "Pricing objection"), variables as brass JBM chips; row swipe reveals Edit
  (button equivalent in detail).
- **Onboarding:** three screens — install → open Gmail → first draft — each
  one sentence + one illustration drawn in the icon language.

## Responsive
Marketing and account app scale mobile → desktop as one widening column
(content ~65ch, max 720px); ≥1024px the account app gains a left rail
replacing the tab bar. The in-Gmail panel never assumes width beyond Gmail's
compose column and inherits Gmail's own responsive behavior. Optional
desktop-only marketing flourish: a 1px brass horizon rule that tilts ±2° on
scroll and self-levels — CSS only, static level line by default. No 3D.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Tone rewrite is an inline redline: struck
words fade + strike-through over 160ms, replacements settle in 240ms
`ease-out-quart` — the draft never flashes wholesale. Voice calibration:
the gauge fills as a JBM counter ticks ("87 / 142 emails studied") — honest
progress, no spinner. Chips `spring-snappy`; sheets 320ms. Targets ≥44px in
the account app; snippet rows swipe with button equivalents. **No custom
gestures inside Gmail — respect the host.**

## Reduced motion & fallback
Composed writing → the full draft fades in over 120ms with one brass caret
blink. Redline → a clean before/after crossfade (100ms). Gauge → stepped
fill, counter still ticks as text. Horizon rule → static. Every draft and
tone action is fully usable with all motion removed.
