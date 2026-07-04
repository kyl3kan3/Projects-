# CrewClock — Design Specification (v3, redline level)

## Vision
A stamped brass timeclock reborn as software: punches that feel physical,
figures you'd defend in an argument. Built for gloves, sunlight, and 60-second
interactions — the crew face is one giant control; the owner face is a ledger
of hours and dollars against bids. Two faces, one calm instrument.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icons only, space-before-boxes, 4px scale, hairlines, real
content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `iron` | `#12161A` | The ground. Every dark screen. Cool iron with a faint green lean. |
| `slate` | `#1A2124` | Sheets, grouped stat panels, job cards only |
| `hairline` | `#26302E` | 1px dividers & panel borders — never brighter |
| `text` | `#EDF2EE` | Primary text |
| `text-2` | `#8FA096` | Secondary text |
| `text-3` | `#59665E` | Faint (timestamps, placeholders, GPS accuracy notes) |
| `paper` | `#F2F5F1` | **Primary buttons** (iron text on it), hero clock numerals |
| `foreman` | `#3E7D54` | THE accent. ≤10% of any screen: the geofence ring, on-the-clock states, links, inside-fence dots, cost-bar fill under 80% |
| `amber` | `#D9A13F` | Approaching OT / outside fence / unapproved edits only |
| `red` | `#C9564A` | Over budget / missed punch / OT crossed only |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: `foreman` never fills a button or a surface — rings, dots, hairline
fills, and text only. `paper` is the only high-emphasis fill; amber/red appear
only where they mean risk or loss. The day-one light theme (crews work in sun):
ground `#F6F8F5`, text `#1A2124`, hairline `#DFE5DF`, primary buttons **ink**
(`#1A2124`) fill with paper text. Both locales get equal care: Spanish runs
~20% longer, so every label and button absorbs the ES string without
truncation — test both at 390px or it isn't done.

## Type — exact specimen

Faces: **Barlow** (400/500/600) for display and UI — sturdy, built for signage ·
**JetBrains Mono** (500/600) for every hour and dollar. Both self-hosted woff2,
preloaded. All weights must render diacritics (á é í ó ú ñ ¿ ¡) — verify the subset.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (marketing hero) | Barlow 600 | `clamp(32px, 8.5vw, 56px)` / 1.08 | −0.01em |
| Hero stat (the clock readout) | JBM 600 | `clamp(44px, 12vw, 68px)` / 1.0 | −0.01em, tabular |
| H2 (screen title) | Barlow 600 | 22 / 1.2 | −0.01em |
| Title (row) | Barlow 600 | 16 / 1.3 | 0 |
| Body | Barlow 400 | 16 / 1.55 | 0 |
| Secondary | Barlow 400 | 13 / 1.45 | 0 |
| Label | Barlow 600 | 11 / 1.2 | +0.08em, uppercase |
| Data (hours / dollars) | JBM 500 | 13 / 1.2 | 0, tabular figures |
| Button | Barlow 600 | 15 / 1 | +0.01em |

All hours and money are mono tabular, always; the running-shift readout ("6h 12m") is the hero stat.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **10** (controls: buttons, inputs, chips, pills) · **14** (panels, job cards) · **20** (sheets, the mini-map). Nothing else.
- Elevation: none. Depth is `slate` vs `iron` plus hairlines; only the sheet scrim shadows.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `clock` (shift), `map-pin` (site), `ring` (geofence),
`hard-hat` (crew member), `users` (crew), `hammer` (jobs), `gauge` (costs),
`bell` (alerts), `download` (export), `check` (approve), `pause` (break),
`chevron-right`, `globe` (language). Nav 22px, inline 18px. **No emoji,
anywhere, ever.**

## Component construction (exact)

- **The CLOCK IN/OUT control:** the app's one oversized control. Full-width in
  the thumb zone, height **64**, radius 10, `paper` fill with iron text, Barlow
  600 at 17px ("CLOCK IN / MARCAR ENTRADA"). Press: scale 0.98. States:
  **inside fence** — `foreman` `ring` glyph leads the label; **outside fence** —
  still enabled (punches are never blocked), amber `map-pin` + Secondary
  beneath: "142 m from site — will be flagged / a 142 m del sitio — se marcará";
  **GPS unavailable** — enabled, `text-3` glyph + "No GPS — recorded without
  location / Sin GPS — registrado sin ubicación". On the clock it inverts:
  hairline border, transparent fill, label "CLOCK OUT / MARCAR SALIDA".
- **Primary button (everything else):** paper fill, iron text, radius 10, height
  48. Press: scale 0.98 + fill `#E2E7E1`. Disabled: `#2A3330` fill, `text-3` text.
- **Secondary:** transparent, 1px hairline, `text`. Press: border `#2F3A36`.
- **Input:** iron fill, hairline border, radius 10, height 48, 16px text.
  Focus: border `foreman` + 2px offset ring at 25% foreman.
- **Chips (job filter):** height 36, radius 10, hairline; active = `foreman` 1px
  border + foreman text. Sized to the longest locale's string.
- **Crew rows:** NO boxes. Full-bleed rows ≥56px, hairline between: Title(16)
  name, mono hours right ("7h 42m"), 6px fence dot left — foreman = inside,
  amber = outside, `text-3` hollow = no GPS.
- **Job cost bar:** the ONE place semantic color fills width. A 4px track
  (`hairline`), radius 2, filled proportionally: `foreman` under 80% of bid,
  `amber` at 80-100%, `red` past 100%. Above: Title job name; below: mono
  "$8,410 of $11,200 bid" left, Data percent right. Never taller, never a gradient.
- **Status pills:** height 28, 6px dot + Label(11): foreman "ON THE CLOCK /
  EN TURNO", `text-3` "OFF / FUERA", amber "OT RISK / RIESGO DE OT", red
  "OVER BUDGET / SOBRE PRESUPUESTO".
- **Language toggle:** an EN/ES pill pair, height 36, radius 10. Per-user,
  persisted server-side; switching re-renders instantly, no reload. It sits on
  the first crew screen, never buried in settings.
- **Bottom tab bar:** height 56 + safe-area, `slate` at 94% + blur, hairline
  top. Crew: Clock · Hours · Profile. Owner: Jobs · Crew · Review · Export. 22px
  icons + 10px Barlow 600 labels; active = `text` + 2px foreman dot.
- **Offline banner:** hairline-top strip, Secondary text: "Saved on phone —
  will sync / Guardado en el teléfono — se sincronizará".

## The signature — the geofence ring
On clock-in, the mini-map (radius 20, top of the crew screen) shows the site
dot; a **1.5px `foreman` ring draws itself around the dot over 400ms
`ease-out-quart`** (stroke-dashoffset), then the live labor-cost meter for that
job begins ticking in mono beneath it. On clock-out the ring un-draws over
300ms and the meter freezes. Rate-limited to one draw per punch — never
looping, never pulsing on the clock. This is the entire brand animation (the
marketing hero reuses the draw once); everything else is state feedback ≤240ms.

## Mobile layout (390×844 — primary spec)
- **Crew home (clock):** gutter 20. Top: mini-map panel (site dot + ring when
  clocked in), Label "HENDRICKS PATIO" with `map-pin`. Center: hero readout
  "6h 12m" over Secondary "Shift: 6h 12m / Jornada: 6h 12m". Bottom thumb zone:
  the CLOCK IN/OUT control. Nothing else — a gloved thumb runs the screen.
- **Crew hours:** hairline rows per day — "Tue 24 / mar 24 · Hendricks Patio · `8h 03m`" with fence dots; week total in mono at top. Read-only.
- **Owner jobs list:** hairline rows: Title job name, client in Secondary, the
  4px cost bar, mono "$8,410 / $11,200 · 75%". Amber/red bars sort to top;
  chip filters Active / Over 80% / Complete.
- **Job detail:** cost bar full width under the H2; mono stat pair "Hours:
  142.5 of 120 bid" (red when over); Label "CREW TODAY" over crew rows with
  fence dots; Secondary projection "At this pace: $12,900 finish — $1,700 over bid".
- **Timesheet review:** grouped by worker; flagged entries first with amber
  `map-pin` (outside fence) or `text-3` (no GPS) glyphs. Row tap opens an edit
  sheet (radius 20): times, job, required reason. Approve is the primary button
  above the safe area; edits are hold-to-confirm.
- **Export:** period chips, format as two radio rows (ADP · Gusto), a mono
  preview table in an `overflow-x:auto` track, primary button "Generate CSV";
  success shows `download` + file row, "Email to bookkeeper" as quiet action.

## Responsive
≥768px: the owner dashboard gains a proper review table (worker, day, in/out,
fence status, hours, flags) with sticky header; the job list becomes a
two-column grid; gutters 32. ≥1024px: left rail replaces the tab bar; max width
1120 centered. The crew face stays phone-first at every size — desktop crew is
the phone layout centered at 480px. No desktop spectacle.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Targets ≥44px, ≥8px apart; the clock control is
64px and the only control a crew member must hit. Rows enter with 24ms stagger,
opacity + 4px x-slide only. Cost bars fill on first paint over 300ms
`ease-out-quart`, then move only on data change. Destructive/critical acts
(delete entry, approve period, edit a punch) are hold-to-confirm: 600ms radial
fill. Pull-to-refresh re-syncs the outbox (also a header control). Haptics never load-bearing.

## Reduced motion & fallback
Geofence ring -> instant filled ring + plain text state ("On the clock at
Hendricks Patio / En turno en Patio Hendricks"). Cost-bar fills and radial
holds -> instant state change (hold becomes a confirm dialog); stagger -> ≤100ms
opacity fade. Every animated signal is also plain text in the row — the
animation is never the only messenger.
