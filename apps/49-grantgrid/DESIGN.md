# GrantGrid — Design Specification (v3, redline level)

## Vision
A development office in a manila folder: warm paper, ruled lines, dates that
matter set in mono, and one rationed award gold that appears only where money
or a deadline lives. GrantGrid should feel like the most organized person the
org ever hired — calm, legible, faintly stationery-like — never like a
startup dashboard cosplaying philanthropy.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `manila` | `#F6F3EA` | The ground. Every screen (warm folder paper) |
| `sheet` | `#FDFCF8` | Cards that are truly framed: funder cards, sheets, the workspace panel |
| `hairline` | `#E3DDCB` | 1px dividers & card borders — never darker |
| `ink` | `#26231B` | Primary text AND **primary buttons** (manila text on ink) |
| `ink-2` | `#6B6455` | Secondary text |
| `ink-3` | `#9D9682` | Faint (timestamps, placeholders, freshness notes) |
| `gold` | `#C29237` | THE accent. ≤10% of any screen: brand mark, fit-score arc, active states, links, focus rings, deadline ticks |
| `leaf` | `#5A8352` | Awarded / completed only |
| `brick` | `#B65540` | Overdue / declined only |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: `ink` is the only high-emphasis fill (light-ground rule); `gold`
never fills a button or a surface — it draws arcs, ticks, and underlines only;
`leaf`/`brick` appear only where they mean awarded or overdue/declined. This
app deliberately ships light-only — folders live in daylight — per
DESIGN_LANGUAGE.md's single-world clause.

## Type — exact specimen

Faces: **Fraunces** (600, display only — the stationery voice) · **Albert
Sans** (400/500/600) for UI · **Red Hat Mono** (400/500) for every date,
dollar figure, EIN, and score. All self-hosted woff2, preloaded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (marketing, funder name on detail) | Fraunces 600 | `clamp(28px, 7.5vw, 44px)` / 1.12 | −0.01em |
| H2 (screen title) | Albert 600 | 22 / 1.2 | −0.01em |
| Title (row/card) | Albert 600 | 16 / 1.3 | 0 |
| Body | Albert 400 | 16 / 1.55 | 0 |
| Secondary | Albert 400 | 13 / 1.45 | 0 |
| Label | Albert 600 | 11 / 1.2 | +0.08em, uppercase |
| Data (dates, $, scores, EINs) | RHM 500 | 13 / 1.2 | 0, tabular figures |
| Button | Albert 600 | 15 / 1 | 0 |

Money and dates are always mono tabular: `$25,000 ASK · LOI SEP 15 · FIT 82`.
Fraunces appears nowhere inside dense pipeline screens — display moments only.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **8** (buttons, inputs, chips) · **12** (funder cards, panels) ·
  **20** (sheets). Nothing else.
- Elevation: none. Depth is `sheet` on `manila` plus hairlines; only the
  sheet scrim shadows.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `columns` (pipeline), `compass` (discovery), `calendar-tick`
(deadlines), `library` (answers: three book spines), `gear` (settings),
`arc-gauge` (fit), `bell` (reminder), `flag` (report due), `check`,
`copy` (use answer), `download` (export), `plus`, `chevron-right`,
`refresh` (freshness). Nav renders at 22px, inline at 18px. **No emoji,
anywhere, ever** — an award is a leaf-colored `check` and a mono amount, not
a trophy.

## Component construction (exact)

- **Primary button:** `ink` fill, `manila` text, radius 8, height 48 mobile
  (full-width in thumb zone). Press: scale 0.98 + fill `#3A362B`. Disabled:
  `#DDD6C2` fill, `ink-3` text.
- **Secondary:** transparent, 1px hairline, `ink`. Press: border `#D2CBB4`.
- **Quiet action:** text-only `gold`, no underline; press dims to 80%.
- **Input:** `sheet` fill, hairline border, radius 8, height 48, 16px text.
  Focus: border `gold` + 2px offset ring at 25% gold.
- **Stage chips (pipeline filter):** height 36, radius 8, hairline; active =
  gold 1px border + gold text.
- **Pipeline rows:** NO boxes. Full-bleed rows ≥56px, hairline between:
  Title(16) funder name, Secondary stage + owner, mono right column
  (`$25,000 · LOI SEP 15`); overdue dates in `brick`, awarded amounts
  prefixed with a leaf 6px dot.
- **Funder card (discovery):** `sheet`, hairline, radius 12, padding 16:
  the fit arc (below) top-right, Title funder name, Secondary one-line
  giving profile ("Youth programs · OH/MI · typically $5-25k"), mono
  freshness line (`DATA REVIEWED MAY 2026`), quiet action **Add to
  pipeline**. Never nested in another card.
- **Fit arc:** 28px circular arc, 2px stroke: track `hairline`, value `gold`,
  RHM 500 score centered. Tapping expands the reasons list — each factor a
  hairline row with `check`/`x` and its reason sentence. No score without
  reasons; thin profiles show `—` and "Complete your profile to score."
- **Deadline ticks (calendar):** week strip with 2px gold ticks under dated
  days; report deadlines carry the `flag` glyph; overdue = brick tick +
  brick date text.
- **Answer block row (library):** Title(16) block name + RHM version
  (`V4`), Secondary first line of content, staleness Label right
  (`REVIEWED 14 MO AGO` in brick when >12mo), quiet `copy` action ≥44px.
- **Bottom tab bar:** height 56 + safe-area, `sheet` at 96% + blur, hairline
  top. Four items — columns / compass / calendar-tick / library — 22px icons
  + 10px Albert 600 labels; active = `ink` + 2px gold dot; inactive = `ink-3`.

## The signature — the fit arc draw
When a funder card enters the viewport (or a profile edit re-scores), the fit
arc draws from 0 to its score over 600ms `ease-out-quart` while the mono
number counts up in step; on settle, a 1.5px gold underline sweeps beneath
the funder name in 240ms and fades over 400ms. Expanding reasons staggers the
factor rows 24ms apart (opacity + 4px y). One draw per card per session;
re-scores are rate-limited to one batch per 5s. Pure SVG stroke-dashoffset —
phone-first, 60fps. This is the entire brand animation; everything else is
state feedback ≤240ms.

## Mobile layout (390 × 844 — primary spec)
- **Pipeline (home):** gutter 20. Top: org name + Label summary
  (`6 ACTIVE · $83,500 PENDING`). Stage chip row, then pipeline rows grouped
  under stage Labels. Next-deadline banner as a hairline row pinned under
  the header (`NEXT · REPORT TO KRESGE · IN 6 DAYS`, flag glyph). Primary
  button **Add grant** pinned above the safe-area (sheet: search funders /
  manual entry).
- **Discovery:** filter chips (state, cause, size), then funder cards.
  Empty-profile state explains scoring honestly before asking for the
  profile. Fit arc + reasons per the component spec.
- **Grant workspace:** requirement checklist as hairline rows (status dot,
  requirement, linked answer breadcrumb `MISSION (LONG) · V4`); tapping
  opens the draft editor sheet with the library picker. Thumb zone: **Mark
  submitted** primary when all items final.
- **Calendar:** week strip with gold ticks, then agenda rows
  (`SEP 15 · LOI · GUND FOUNDATION` mono-led). ICS subscribe as a quiet
  action; report deadlines visually distinct (flag).
- **First run:** org profile in four conversational screens (mission, where
  you work, causes, budget band) — each feeds scoring; then the fit-check
  moment: three real funder cards drawing their arcs.

## Responsive
≥768px: pipeline becomes columns-by-stage (the board), discovery a two-column
card grid, gutters 32. ≥1024px: left rail replaces the tab bar; workspace
opens as a right panel beside the pipeline; calendar shows the full month
with tick density; max content width 1160 centered. No desktop spectacle —
the arc draw is the signature at every size.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Rows enter with 24ms stagger, opacity + 4px
y-slide. Stage changes slide the row to its new group with 200ms
`ease-in-out-soft` (reduced to a fade at reduced motion). Chips crossfade
150ms. Checklist completion ticks scale 0.9→1 with `spring-snappy`. Targets
≥44px, ≥8px apart; deleting a grant or answer block is hold-to-confirm
(600ms radial fill); swipe left on a deadline row reveals **Done** (also in
row overflow). Haptics native-only, never load-bearing.

## Reduced motion & fallback
Fit arc → rendered complete with the score, single 100ms opacity fade; count-
up → static number; underline sweep → static underline fading in 100ms; row
stagger → ≤100ms opacity; stage moves → crossfade. Every signal (fit, overdue,
awarded) is always plain text + mono data in the row — nothing is motion-only.
The ICS feed and email reminders carry the same dates as the calendar screen,
so no capability depends on the UI at all.
