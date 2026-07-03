# AnswerDesk — Design Specification (v3, redline level)

## Vision
A calm concierge that is never performative. AnswerDesk sells honesty — a bot
that says "I don't know" — so the design makes honesty feel premium: deep sea
teal-black grounds, citations set like footnotes, paper-filled actions, and one
signature that costs nothing on a phone: a status dot whose stillness *is* the
uncertainty. The widget must be the most refined, least intrusive thing on any
host site it lands on.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `sea` | `#0B2530` | The ground. Widget body, dashboard, marketing. |
| `panel` | `#123240` | Bot bubbles, sheets, grouped stat panels only |
| `hairline` | `#1E4152` | 1px dividers & borders — never brighter |
| `text` | `#EAF4F2` | Primary text |
| `text-2` | `#7FA39E` | Secondary text |
| `text-3` | `#4E6E69` | Faint (timestamps, placeholders) |
| `paper` | `#F2F4F3` | **Primary buttons** (sea text on it), user bubbles, key numerals |
| `teal` | `#379E96` | THE accent. ≤10% of any screen: status dot, citation chips, links, active tab, focus rings |
| `linen` | `#E8E3D8` | Uncertain-state material only (the dot, the "not certain" capsule) |
| `amber` | `#F5B15C` | Handoff/human semantic only — dot, handoff card rule, Slack event rows |
| `green` | `#3ECF8E` | Resolved/success only |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: teal never fills a button or a surface; `paper` is the only
high-emphasis fill; amber appears only where a human enters the story; the
deflection donut uses green / amber / `text-3` — no red, no shame.

## Type — exact specimen

Faces: **Gambetta** (500/600, Fontshare) for display · **Switzer** (400/500/600,
Fontshare) for UI · **IBM Plex Mono** (400/500) for data. Self-hosted woff2,
preloaded; the widget loads them inside its own iframe (see zero-CLS).

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (marketing) | Gambetta 600 | `clamp(34px, 9vw, 60px)` / 1.08 | −0.01em |
| H2 (screen title) | Gambetta 600 | 24 / 1.2 | 0 |
| Title (card/row) | Switzer 600 | 16 / 1.3 | 0 |
| Body / chat | Switzer 400 | 16 / 1.6 | 0 |
| Secondary | Switzer 400 | 13 / 1.45 | 0 |
| Label | Switzer 600 | 11 / 1.2 | +0.08em, uppercase |
| Data (counts, times) | IBM Plex Mono 500 | 13 / 1.2 | 0, tabular figures |
| Citation index | IBM Plex Mono 500 | 11 / 1 | 0 |
| Button | Switzer 600 | 15 / 1 | 0 |

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Widget padding **16**,
  dashboard gutter **20**.
- Radii: **10** (controls: buttons, inputs, chips) · **14** (bubbles, cards,
  docked panel) · **20** (phone sheet top, source card). Nothing else.
- Elevation: none inside surfaces — depth is `panel` vs `sea` plus hairlines.
  The only shadow is the sheet/panel drop: `0 8px 32px rgba(4,16,20,0.45)`.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `chat` (widget/launcher), `send` (arrow-up), `source` (open
book — citations), `person` (handoff), `mail`, `chart` (deflection), `gap`
(list + plus — content gaps), `bot`, `settings`, `link`, `chevron-down`,
`close`, `check`, `search`. Launcher glyph 24px, nav 22px, inline 16px.
**No emoji, anywhere, ever** — confidence renders as a mono chip (`CONF 0.91`).

## Widget construction (exact — the product)
- **Launcher:** 56×56 circle, `sea` fill, 1px rim `rgba(234,244,242,0.18)`,
  `chat` glyph 24px in `paper`. Fixed bottom-right, 20px from edge + safe-area.
  Mounts `position:fixed` in its own iframe sized before paint — **zero layout
  shift on the host, CLS contribution 0.000**; it fades in (opacity, 200ms)
  after host `load`, never pushes content. Total script <30KB gzipped.
- **Phone (<768px): bottom sheet.** Rises to 85vh (max 720px), radius 20 top,
  grab handle 40×4 in `hairline`, scrim `rgba(4,16,20,0.4)` over the host —
  the page stays visible. Spring in 320ms; drag-down dismisses; a 44px `close`
  button is the equivalent. Input font 16px (defeats iOS zoom).
- **≥768px: docked panel.** 400×min(85vh, 640px), anchored 24px from the
  corner, radius 14, hairline border.
- **Header (56px):** bot name Title(16), the status dot 8px to its left,
  "Powered by AnswerDesk" Label(11) in `text-3` (hidden on Scale), `close` 44px.
- **Messages:** bot = `panel` fill, radius 14 (4 on the top-left corner),
  padding 12/16, max-width 85%. User = `paper` fill, `sea` text, right-aligned.
  System notes = centered `linen` capsule, `sea` text, 13px.
- **Citations:** inline superscript chips — mono 11 in `teal`, `[1]`, 24×20
  tap area. Tap opens a nested source card (radius 20, `panel`): favicon 16px,
  page title, the quoted lines set 14/1.5 with a 2px `teal` left rule, `link`
  glyph action "Open page".
- **Handoff card:** inline `linen` capsule, `sea` text — "I'm not certain about
  refunds on annual plans. Want me to get a person?" — one 48px paper button
  ("Email me an answer"), amber 2px left rule.
- **Composer:** sticky bottom bar, `sea` at 94% + blur, hairline top; input
  height 48, radius 10; send = 44×44 circle, paper fill, `sea` arrow.

## The signature — the honest status dot
An 8px dot beside the bot name carries state as material, not a face:
- **Listening:** `teal`, breathing — scale 1→1.15, 2.4s `ease-in-out-soft`, loop.
- **Thinking (retrieval):** `teal` with one traveling highlight — a 40% white
  shimmer crossing the dot every 1.2s, linear.
- **Uncertain (the crucial one):** drains to matte `linen` over 400ms
  `ease-out-quart` and goes **perfectly still** as the bot says so in text.
- **Handoff:** warms to `amber`, 300ms crossfade.
Pure CSS, 60fps on a mid Android. Each state is also announced in text
("Checking the docs…", "Not fully certain.") — never color-only.

## Mobile layout (390×844 — dashboard, merchant app)
- **Nav:** bottom tab bar 56px + safe-area, `panel` at 94% + blur, hairline
  top; four items (`bot` Bots · `chart` Deflection · `gap` Gaps · `settings`)
  at 22px with 10px Switzer 600 labels; active = `text` + 2px teal dot.
- **Deflection (money screen):** H2 "This week". Donut 160px (green resolved /
  amber handed off / `text-3` unanswered), center mono numeral `72%`. Below,
  hairline rows, not boxes: "Resolved without a human — 214", "Handed off — 41",
  "Unanswered — 38", each Title(16) + mono count. Then the gap list: "Write
  'Can I change my plan mid-cycle?' — asked 19× this month" rows with a paper
  "Draft outline" quiet action. Methodology note 13/`text-2` under the donut.
- **Gaps:** severity-ordered hairline rows; each carries the verbatim question
  in `text`, mono ask-count, and estimated deflection ("~120 tickets/yr").
- **Setup wizard:** URL input 48px → crawl progress as a hairline tree, each
  indexed page's row gaining a green `check` (no node-lighting theater) →
  inline test chat. "Time to bot: 8 min" in mono when done.

## Responsive
≥768px: dashboard gains a left rail (bots + quota) replacing the tab bar;
conversation explorer becomes list + transcript two-pane; max width 1120
centered, gutters 32. The marketing hero runs a scripted live demo hitting one
uncertain state, the dot annotated in the margin — desktop-only, lazy; mobile
gets three static frames of the same moment.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Answers stream in sense-groups (120–260ms);
each citation chip pops 1.2→1 (`dur-micro`) after its sentence lands. Source
card rises 8px `spring-gentle`. Sheet springs 320ms. Donut fills once, 600ms
`ease-out-quart`. Targets ≥44px; send 44px; haptic tick on send in native
webviews. Every gesture has a button equivalent.

## Reduced motion & fallback
Status dot → instant material swap with an 80ms fade; no breathing or shimmer.
Sheet/panel → 100ms opacity fade. Streaming → paragraph-level fades. Donut →
static with values printed. All states remain readable as text; screen readers
get live-region announcements. Feature-complete, never punitive.
