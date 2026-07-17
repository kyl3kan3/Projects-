# RFPRadar — Design Specification (v5, redline level)

## Vision
The capture desk at 6am: the register read, the finds flagged, the calendar
already amended. RFPRadar is procurement-register paper — cool official
grounds, federal navy used like a filing stamp, mono notice ids and
deadlines throughout. The satisfying moment is the morning find: one tender
sliding out of three thousand notices with its reasons attached.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `register` | `#F6F6F4` | The ground. Every screen — official cool paper |
| `card` | `#FDFDFB` | Match cards, scorecards, library blocks only |
| `hairline` | `#E3E3DD` | 1px dividers & panel borders — never darker |
| `ink` | `#212832` | Primary text AND primary button fill |
| `ink-2` | `#606A76` | Secondary text |
| `ink-3` | `#98A0AB` | Faint (notice ids, fetch times, placeholders) |
| `federal` | `#3B5B85` | THE accent. ≤10% of any screen: fit scores, links, active states, focus rings, the scan-line stamp |
| `green` | `#3D855E` | Won / go verdict / on-schedule only |
| `amber` | `#B4862E` | Due soon / conditional / stale block only |
| `red` | `#B04C3E` | Overdue / no-go / source down only |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: `federal` never fills a button or a surface; `ink` is the only
high-emphasis fill (register text on it); semantic colors carry
deadline/verdict/source state only. Committed to the single light world —
this is the morning register, read in daylight; no dark theme in v1, by
choice.

## Type — exact specimen

Faces: **Public Sans** (400/500/600 — the USWDS face, civic without
stiffness, and native to this product's world) for display and UI ·
**Overpass Mono** (500) for every notice id, deadline, score, and value
band. Both self-hosted woff2, preloaded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (marketing hero) | PS 600 | `clamp(32px, 8.5vw, 54px)` / 1.08 | −0.015em |
| Hero stat (matches found) | OM 500 | `clamp(34px, 9.5vw, 52px)` / 1.05 | −0.01em, tabular |
| H2 (screen title) | PS 600 | 22 / 1.2 | −0.01em |
| Title (match/pursuit row) | PS 600 | 16 / 1.3 | 0 |
| Body | PS 400 | 16 / 1.55 | 0 |
| Secondary | PS 400 | 13 / 1.45 | 0 |
| Label | PS 600 | 11 / 1.2 | +0.08em, uppercase |
| Data / ids / deadlines | OM 500 | 13 / 1.2 | 0, tabular figures |
| Button | PS 600 | 15 / 1 | 0 |

All deadlines, notice ids, scores, and value bands are mono tabular,
always. Fit scores ("87") render mono in `federal` — the accent's quietest
recurring home.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **8** (controls: buttons, inputs, chips) · **12** (match cards,
  scorecards, library blocks) · **20** (sheets, notice reader). Nothing else.
- Elevation: none. Depth is `card` on `register` plus hairlines; only the
  sheet scrim shadows.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `radar-arc` (the brand mark — a quarter-sweep with a
blip), `doc-seal` (opportunities), `scale-balance` (go/no-go),
`calendar-tick` (deadlines), `books-row` (library), `target-ring`
(profiles), `slack-hash`, `mail-flat`, `link-out`, `flag-small`,
`download`, `chevron-right`, `plus`, `gear`.
Nav renders at 22px, inline at 18px. **No emoji, anywhere, ever** — a won
pursuit gets a `flag-small` in green, not a trophy emoji.

## Component construction (exact)

- **Primary button:** `ink` fill, `register` text, radius 8, height 48
  mobile (full-width in thumb zone), PS 600 15. Press: scale 0.98 + fill
  `#2B3440`. Disabled: `#D9D9D2` fill, `ink-3` text.
- **Secondary:** transparent, 1px hairline, `ink`. Press: border `#CCCCC4`.
- **Quiet action:** text-only, `federal`, no underline; press dims to 80%.
- **Input:** `card` fill, hairline border, radius 8, height 48, 16px text.
  Focus: border `federal` + 2px offset ring at 25% federal.
- **Chips (radar filter: New / Watching / Due soon / All):** height 36,
  radius 8, hairline; active = `federal` 1px border + `federal` text.
- **Match card:** `card`, radius 12, padding 16: fit score mono in
  `federal` top-right (24px), notice Title (2 lines max), agency + state
  Secondary, mono meta row ("SOL-26-0412 · due Mar 21 · $250k–$1M"), then
  the top two factor reasons as Secondary lines with a "+3 more" quiet
  action. Actions row: **Pursue** (primary, compact 40px) / Watch /
  Dismiss (quiet).
- **Factor reason rows (expanded):** hairline rows, each a check/cross
  glyph + the verbatim reason sentence; matched factors `ink`, unmatched
  `ink-3`. The score is never shown without this list one tap away.
- **Scorecard:** `card`, radius 12: criteria as hairline rows — Label,
  1-5 segmented control (44px segments), note field; the weighted verdict
  bar at the bottom composes live (mono score + verdict pill). The
  recorded decision line ("No-bid · M. Torres · Mar 4") is permanent.
- **Deadline row:** NO boxes. Full-bleed rows ≥56px, hairline between:
  kind Label, deadline Title, mono date + countdown right ("Mar 21 ·
  9 days"); countdown turns `amber` at T-7, `red` overdue. Dot left
  matches.
- **Library block:** `card`, radius 12: kind Label + `won_with` flag
  (small green flag glyph when set), block Title, body preview (3 lines),
  mono meta ("v4 · reviewed Jan 2026"), stale blocks get an `amber`
  "REVIEW BEFORE USE" Label. Linking shows the snapshot notice ("frozen
  into this pursuit").
- **Source health row:** source name, mono last-success ("6:02 AM"),
  status pill; degraded/down rows carry the note ("VA eVA: format changed
  — connector update queued").
- **Status pill:** height 28, 6px dot + Label(11): `green` "GO" / "WON" /
  "OK", `amber` "DUE SOON" / "CONDITIONAL" / "DEGRADED", `red` "OVERDUE" /
  "NO-GO" / "DOWN", `ink-3` "WATCHING" / "NO-BID".
- **Bottom tab bar:** height 56 + safe-area, `card` at 96% + blur,
  hairline top: radar-arc / scale-balance / calendar-tick / books-row at
  22px + 10px labels; active = `ink` + 2px `federal` dot; inactive =
  `ink-3`.

## The signature — the 6am find (four beats)
When the user opens the radar with unseen scan results (and once per
morning-scan view), one quiet sequence plays: **(1)** the scan line stamps
in mono — "SCANNED 3,412 NOTICES · 6 SOURCES · 6:02 AM" (opacity + 4px
slide, 160ms), **(2)** the top match card slides in and its fit score
counts up 0→87 in mono `federal` (300ms, tabular digits), **(3)** the top
two factor reasons typeset themselves on (staggered 40ms, opacity only),
and **(4)** the deadline chip lands on the card — "due Mar 21 · 21 days" —
settling with `spring-snappy` as the calendar dot appears in the tab bar.
Lower-ranked matches follow as a plain staggered list (24ms). Total under
1.2s, one card gets the ceremony, no radar-sweep spectacle. Everything
else is state feedback ≤240ms.

## Mobile layout (390×844 — primary spec)
- **Radar (home):** gutter 20. Label "TUESDAY · SCANNED 6:02 AM" + hero
  stat `4 new` matches (4px hairline track filled `federal` — the one
  accent-filled element, 4px tall), then Secondary "2 due this week · all
  sources ok". Filter chips, then match cards by score. Thumb-zone
  primary: **Review matches**; source health quiet action in the header.
- **Notice reader:** full opportunity text in a 20-radius sheet: mono
  meta block (id, agency, dates, value band), description with keyword
  hits underlined in `federal`, amendment trail as hairline rows, then
  the actions row (Pursue / Watch / Dismiss with reason).
- **Pursuit detail:** stage header + owner, scorecard (at go_no_go),
  requirement checklist rows with owner avatars + mono due dates, linked
  library blocks with snapshot notices, deadline rows, activity trail.
- **Library:** kind chips (Boilerplate / Answers / Bios / Past
  performance), search, block cards; stale-first sort option; **New
  block** primary.
- **First run:** three cards — build a keyword profile (NAICS + keywords,
  ends with "12 live matches found" preview), connect Slack or confirm
  email for the 6am scan, import 3 library blocks (paste from your last
  proposal). Real data replaces each card as it completes.

## Responsive
≥768px: radar becomes a 2-column card grid; pursuits gain a list + detail
split; the notice reader docks right; gutters 32. ≥1024px: left rail
replaces the tab bar; the calendar gets a month view beside the deadline
list; max content width 1120 centered. The 6am find remains the signature
at every size; no desktop spectacle.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Cards and rows enter with 24ms stagger,
opacity + 4px y-slide only — registers never bounce. Chips crossfade
150ms; sheets 320ms `spring-gentle`; the notice reader slides up from the
match card. Targets ≥44px, ≥8px apart (scorecard segments 44px).
Decisive/destructive actions (record go/no-go verdict, archive block,
rotate ICS token) are hold-to-confirm (600ms fill) and always
audit-logged; dismiss-with-reason is a single tap + one-tap reason chips.
Pull-to-refresh re-polls hot sources.

## Reduced motion & fallback
Scan stamp and score count → final state with a ≤100ms fade; factor
typeset → appears whole; deadline chip → appears placed. Stagger → ≤100ms
opacity fade. Scores, verdicts, and countdowns are always plain text +
pill — nothing is motion-only, and the score is never color-only (the
mono number always renders).
