# Briefcast — Design Specification (v3, redline level)

## Vision
The feeling of walking out of a meeting where someone brilliant took the notes.
Briefcast is editorial, not techy — warm paper, a confident serif for decisions,
and a page-like calm that makes CRM write-back feel as trustworthy as print.
One rationed blue means "interactive"; everything else is ink on ivory.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `paper` | `#FAF7F2` | The ground. Every screen. |
| `ink` | `#221D18` | Primary text; **primary buttons** (paper text on it) |
| `hairline` | `#E7E1D8` | 1px dividers & card borders — never darker |
| `stone` | `#7A7268` | Secondary text |
| `stone-2` | `#ABA49B` | Faint (timestamps, placeholders) |
| `blue` | `#2456F0` | THE accent. ≤10% of any screen: active tab, links, focus rings, sync progress, on-air chip |
| `coral` | `#E4573D` | Action items & risks only — meaning, never decoration |
| `marker` | `#FFE8A3` | Transcript highlight wash only, never on controls |
| `green` | `#2E9963` | Sync success only ("Synced · 4 fields") |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: blue never fills a button or a surface; primary buttons are `ink`
fill on this light ground (the v2.1 premium default); coral marks action, not
brand; `marker` is a text background wash at 100% of its value, never a fill
on components. Light-first by deliberate choice — no dark theme at v1.

## Type — exact specimen

Faces: **Source Serif 4** (600) for display · **Inter** (400/500/600) for UI ·
**JetBrains Mono** (500) for data. All self-hosted woff2, preloaded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (hero / meeting title) | SS4 600 | `clamp(30px, 8vw, 52px)` / 1.12 | −0.01em |
| H2 (section: Decisions) | SS4 600 | 22 / 1.2 | −0.005em |
| Title (card/row) | Inter 600 | 16 / 1.3 | 0 |
| Body (brief text) | Inter 400 | 16 / 1.6 | 0 |
| Secondary | Inter 400 | 13 / 1.45 | 0 |
| Label | Inter 600 | 11 / 1.2 | +0.08em, uppercase |
| Data / timestamp / speaker | JBM 500 | 12 / 1.3 | 0, tabular figures |
| Button | Inter 600 | 15 / 1 | 0 |

Brief body measure held to ≤64ch. Speaker labels render as JBM caps
("`SARAH · 14:22`") in `stone`.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **10** (controls: buttons, inputs, chips) · **12** (cards) ·
  **20** (sheets). Nothing else.
- Elevation: none at rest. Cards get `0 1px 2px rgba(34,29,24,0.06)` on press
  only; the sheet scrim is the sole real shadow.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `briefs` (stacked pages), `deals` (funnel), `slack-hash`,
`gear`, `check`, `checkbox`, `mic` (on-air), `waveform`, `arrow-right` (old→new
field), `sync` (two arrows), `chevron-down` (expander), `flag` (risk),
`calendar`, `link`, `undo`. Nav renders at 22px, inline at 18px. **No emoji,
anywhere, ever** — owners are 20px initial avatars (ink on `#EFEAE2`), not faces.

## Component construction (exact)

- **Primary button / sync bar:** ink fill, paper text, radius 10, height 48
  mobile (full-width in thumb zone), Inter 600 15. The sync bar adds a mono
  count right ("4 fields"). Press: scale 0.98 + fill `#2E2A26`. Disabled:
  `#D8D2C8` fill, `stone-2` text.
- **Secondary:** transparent, 1px hairline at `#D8D2C8`, ink text. Press:
  border `#C9C2B6`.
- **Quiet action:** text-only, blue, no underline; press dims to 80%.
- **Input:** paper fill, hairline border, radius 10, height 48, 16px text.
  Focus: border blue + 2px offset ring at 25% blue.
- **Chips (deal stage, channel):** height 36, radius 10, hairline; active =
  blue 1px border + blue text.
- **Action-item rows:** NO boxes. Hairline-divided rows ≥56px: 22px checkbox
  (≥44px target), Body text, owner initial-avatar 20px, JBM due date right
  ("`Jun 12`"). Checked: 150ms stroke draw, text strikes left→right, row
  settles to `stone`.
- **CRM field-change rows:** hairline rows: Label field name ("DEAL STAGE"),
  old value in `stone` strikethrough → `arrow-right` glyph → proposed value in
  ink, per-field approve toggle right (44×28, ink when on).
- **Cards:** only for framed objects — briefing cards on the pipeline and the
  CRM proof card. Paper fill, hairline border, radius 12, padding 16. Risks
  render inside the brief as a coral 2px left rule + Label "RISK", not a box.
- **On-air chip:** height 28, hairline pill, 6px blue dot + 3-bar waveform at
  real input level + Label "ON AIR".

## The signature — the printing skeleton (kept, refined)
While a brief generates, the placeholder is typographic: text-shaped bars in
`hairline` matching the final layout's exact line widths. Paragraphs resolve
top-down into real sentences, one per ~120ms, `ease-out-quart`, each with a
40ms opacity crossfade — a page coming off a press. No spinner, no shimmer
loop. Pure CSS/Framer Motion; the whole resolve for a typical brief is under
1.5s. The brand's promise (speech becomes typeset structure) *is* the loading
state. Everything else is feedback ≤240ms.

## Mobile layout (390×844 — primary spec)
- **Landing:** gutter 20. Serif display headline ("The notes wrote themselves."),
  one proof line in Body ("3 decisions. 5 action items. 2 need you."), then
  three real briefing cards ("Acme renewal — discovery", "Kickoff: Delta
  Media", "Q3 pipeline review") and a CRM proof card showing an actual
  field-change row ("DEAL STAGE · Discovery → Proposal"). Sticky bottom CTA
  after the hero scrolls off.
- **The Brief (money screen):** serif meeting title + JBM meta line
  ("`Jun 4 · 41 min · Zoom`"). H2 "Decisions" with 2–3 Body sentences; H2
  "Action items" as checkable rows ("Send revised SOW — Sarah · `Jun 12`");
  risks with the coral rule ("Budget owner unconfirmed"); transcript folded
  behind a "Read the room" expander row. **Sync to HubSpot** bar pinned in the
  thumb zone.
- **CRM review sheet:** radius 20 top, 36×4 grab handle in `hairline`, padding
  20. Field-change rows + **Apply 4 changes** primary bar; per-field toggles
  above it.
- **Deal timeline:** vertical hairline spine, JBM dates, extracted signals as
  plain rows ("Commitment: intro to CFO — `May 28`").
- **Pipeline:** week of briefs as cards; unread carry a coral dog-ear (16px
  folded corner) that unfolds 200ms on open.

## Responsive
≥768px: the brief gains a scroll-spy timestamp rail (JBM, left margin);
briefing cards 2-up; gutters 32. ≥1024px: three panes — pipeline list ·
brief · deal timeline — max width 1200 centered. The marketing hero's
waveform-to-words scroll animation is desktop/tablet-only; on phone the hero
is a static three-panel storyboard set in real type.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Check-off: 150ms draw + strike +
`spring-gentle` re-sort. Sync apply: field chips flip split-flap (200ms each,
40ms stagger) from field name to green "Synced" — once, never looping. On-air
chip blinks twice then breathes at input level. Targets ≥44px; approve toggles
and sync bar in the thumb zone. Swipe a brief card to archive (also overflow
menu); long-press transcript to highlight with `marker` and "Add to brief"
(also a selection-toolbar button). Native haptic tick on check-off; web silent.

## Reduced motion & fallback
Printing skeleton → sentences appear at once with an 80ms fade. Split-flaps →
crossfade. Check-off draw → instant. Dog-ear unfold → static state. Hero →
static storyboard. Every status is also stated in text ("Synced · 4 fields").
