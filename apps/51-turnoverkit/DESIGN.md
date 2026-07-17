# TurnoverKit — Design Specification (v5, redline level)

## Vision
Housekeeping done to hotel standard, held to the light. TurnoverKit is fresh
linen and a clipboard that photographs everything: warm paper grounds, spruce
teal used like a housekeeper's seal, mono timestamps under every photo. The
satisfying moment is the tile flip — a unit going VERIFIED with the next
check-in time beneath it, hours to spare.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `linen` | `#F8F7F3` | The ground. Every screen — warm laundered paper |
| `card` | `#FEFDFA` | Turnover records, photo strips, board tiles only |
| `hairline` | `#E5E3DB` | 1px dividers & tile borders — never darker |
| `ink` | `#232B29` | Primary text AND primary button fill |
| `ink-2` | `#5F6B67` | Secondary text |
| `ink-3` | `#97A19C` | Faint (timestamps, feed-age lines, placeholders) |
| `spruce` | `#4E9B8F` | THE accent. ≤10% of any screen: the VERIFIED seal, links, active states, focus rings, photo-count ticks |
| `green` | `#43875F` | Guest-ready / restocked / on-time only |
| `amber` | `#B5842E` | In progress / low stock / window tightening only |
| `red` | `#B14E3F` | Blocked / damage filed / feed error only |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: `spruce` never fills a button or a surface; `ink` is the only
high-emphasis fill (linen text on it); semantic colors carry turnover/stock
state only. Committed to the single light world — turnovers happen in
daylight; no dark theme in v1, by choice. The cleaner's job page shares the
identical theme: one operation, one paper.

## Type — exact specimen

Faces: **Hanken Grotesk** (400/500/600 — warm, workmanlike, nothing like the
reflexive Inter) for display and UI · **IBM Plex Mono** (500) for every time,
window, count, and unit code. Both self-hosted woff2, preloaded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (marketing hero) | HG 600 | `clamp(32px, 8.5vw, 54px)` / 1.08 | −0.015em |
| Hero stat (units ready) | IPM 500 | `clamp(34px, 9.5vw, 52px)` / 1.05 | −0.01em, tabular |
| H2 (screen title) | HG 600 | 22 / 1.2 | −0.01em |
| Title (unit/turnover row) | HG 600 | 16 / 1.3 | 0 |
| Body | HG 400 | 16 / 1.55 | 0 |
| Secondary | HG 400 | 13 / 1.45 | 0 |
| Label | HG 600 | 11 / 1.2 | +0.08em, uppercase |
| Data / times / counts | IPM 500 | 13 / 1.2 | 0, tabular figures |
| Button | HG 600 | 15 / 1 | 0 |

All times and windows are mono tabular, always. Check-in deadlines ("ready by
4:00 PM") render mono in `spruce` — the accent's quietest recurring home.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **8** (controls: buttons, inputs, chips, photo thumbs) · **12**
  (board tiles, turnover records) · **20** (sheets, photo viewer). Nothing else.
- Elevation: none. Depth is `card` on `linen` plus hairlines; only the sheet
  scrim shadows.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `door-key` (units), `broom-flat` (turnovers), `camera`,
`calendar-sync` (iCal), `seal-check` (verified — a ring with a check),
`flag-small` (issues), `box-count` (stock), `person-simple` (cleaners),
`clock-window`, `send`, `download`, `chevron-right`, `plus`, `gear`.
Nav renders at 22px, inline at 18px. **No emoji, anywhere, ever** — a
verified turnover gets `seal-check`, not a sparkle emoji.

## Component construction (exact)

- **Primary button:** `ink` fill, `linen` text, radius 8, height 48 mobile
  (full-width in thumb zone), HG 600 15. Press: scale 0.98 + fill `#2C3634`.
  Disabled: `#DAD8D0` fill, `ink-3` text.
- **Secondary:** transparent, 1px hairline, `ink`. Press: border `#CDCBC2`.
- **Quiet action:** text-only, `spruce`, no underline; press dims to 80%.
- **Input:** `card` fill, hairline border, radius 8, height 48, 16px text.
  Focus: border `spruce` + 2px offset ring at 25% spruce.
- **Chips (board filter: Today / Tomorrow / All units):** height 36,
  radius 8, hairline; active = `spruce` 1px border + `spruce` text.
- **Board tile (unit):** `card`, radius 12, padding 16: unit Title, next
  check-in mono right ("4:00 PM"), status pill, cleaner Secondary line
  ("Maria · window 11a–3p" in `ink-3`), feed-age line when stale. Tiles are
  the one sanctioned card — everything inside is hairline rows.
- **Room card (cleaner job page):** full-bleed section, hairline between:
  room Label, task rows with 24px tap-targets, then the photo rail —
  required slots as 64px dashed outlines (radius 8) that fill with thumbs;
  the count ("1 of 2") mono in `spruce` until met, `green` when met.
- **The VERIFIED seal:** 20px circle, 1.5px `spruce` ring, `spruce` check,
  Label "VERIFIED" beside it — the housekeeper's stamp, drawn once per
  completed turnover. Never green (green is the row state; the seal is the
  record's mark).
- **Photo strip (turnover record):** `card`, radius 12: rooms as hairline-
  divided groups, 64px thumbs (radius 8, tap to view), mono timestamp under
  each, cleaner + start/finish times in the header, the VERIFIED seal
  top-right.
- **Issue row:** flag glyph in `red` (damage) or `amber` (maintenance),
  Title, unit + turnover mono ref, status pill; photos inline as thumbs.
- **Stock row:** item Title, mono count vs par ("2 / 6") — `amber` at or
  below par, `red` at zero; "Restocked" quiet action right.
- **Status pill:** height 28, 6px dot + Label(11): `green` "READY" /
  "RESTOCKED", `amber` "IN PROGRESS" / "LOW", `red` "BLOCKED" / "DAMAGE",
  `ink-3` "SCHEDULED".
- **Bottom tab bar:** height 56 + safe-area, `card` at 96% + blur, hairline
  top: broom-flat / door-key / flag-small / box-count at 22px + 10px labels;
  active = `ink` + 2px `spruce` dot; inactive = `ink-3`.

## The signature — the tile flip (four beats)
When the last room's photos land and the cleaner taps Finish, the host's
board plays one quiet sequence: **(1)** the final photo thumb settles into
its slot (opacity + 4px slide, 160ms), **(2)** the photo-count tick rolls to
full in `spruce` (120ms), **(3)** the VERIFIED seal stamps — scale 1.15→1.0
with `spring-snappy`, ring drawing 0→360° in 240ms — and **(4)** the unit's
board tile crossfades from IN PROGRESS amber to READY green with the next
check-in time beneath ("ready by 4:00 PM · 2h 40m to spare"), 200ms
`ease-out-quart`. Total under a second, no confetti, no bounce. Everything
else is state feedback ≤240ms.

## Mobile layout (390×844 — primary spec)
- **Board (home):** gutter 20. Label "SATURDAY · CHANGEOVER" + hero stat
  `5 of 6` units ready with a 4px hairline track filled `green`, then
  Secondary "1 in progress · next check-in 4:00 PM". Filter chips, then
  board tiles. Thumb-zone primary: **Add turnover** (manual gaps);
  **Run sync now** as quiet action in the header.
- **Turnover record:** photo strip per the component spec; issues filed
  inline; **Export PDF** quiet action; annotations append at the bottom.
- **Cleaner job page (/clean/[token]):** unit name + access notes sheet,
  window mono, room cards in order, sticky progress footer ("3 of 5 rooms ·
  7 photos"), end-of-job stock counts, **Finish** primary in the thumb zone
  — disabled until every room's photo gate is met, with the unmet room
  named ("Bath 2 needs 1 photo").
- **Stock:** per-unit sections, stock rows, restock actions; digest
  preview ("what the morning email will say").
- **First run:** three cards — add a unit, paste its iCal URL (ends with
  the "6 stays found, 2 turnovers scheduled" preview), invite a cleaner.
  Real data replaces each card as it completes.

## Responsive
≥768px: board becomes a 2-column tile grid; turnover record gains a
side-by-side photo viewer; gutters 32. ≥1024px: left rail replaces the tab
bar; board 3-up; records open in a right pane; max content width 1120
centered. The tile flip remains the signature at every size; no desktop
spectacle.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Tiles enter with 24ms stagger, opacity +
4px y-slide only. Chips crossfade 150ms; sheets 320ms `spring-gentle`;
photo viewer zooms from the thumbnail rect. Targets ≥44px, ≥8px apart;
destructive actions (revoke job link, delete unit, resolve issue) are
hold-to-confirm (600ms fill) and always audit-logged. Pull-to-refresh
triggers an iCal re-sync for the visible units. Haptic on the seal stamp,
native only, never load-bearing.

## Reduced motion & fallback
Seal → appears complete with a ≤100ms fade; tile flip → direct state swap;
photo settles → instant placement. Stagger → ≤100ms opacity fade.
Ready/in-progress/blocked states are always plain text + pill — nothing is
motion-only.
