# PermitPath — Design Specification (v3, redline level)

## Vision
A municipal record room with the lights on: manila paper, dense ink, hairline
rules, one brick-red stamp that appears only when a fact is verified — the
clerk stamping your application APPROVED. Calm, procedural, final; the stamp
*is* the brand.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

## Color — exact values and usage ratios

PermitPath commits to a **light paper world** as its primary theme — a
deliberate choice (record rooms are lit); the dark counterpart is below.

| Token | Hex | Use |
|---|---|---|
| `manila` | `#F1EBDD` | The ground. Every screen. |
| `bond` | `#FAF6EC` | Requirement cards, sheets, the tab bar — brighter stock |
| `hairline` | `#DBD2BE` | 1px rules and card borders — never darker |
| `ink` | `#2A251C` | Primary text; the only high-emphasis fill (primary buttons) |
| `ink-press` | `#40382A` | Pressed state of ink fills |
| `ink-2` | `#6E6553` | Secondary text |
| `ink-3` | `#A29881` | Faint (timestamps, placeholders, disabled) |
| `brick` | `#A8552F` | THE accent. ≤10% of any screen: the stamp, verified states, active tab dot, links, focus rings |
| `ochre` | `#A97B26` | Pending / at-risk / in-review states only |
| `signal-red` | `#8F2B21` | Expired / stop-work / failed inspection only |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: `brick` never fills a button or surface — 1.5px strokes, glyphs,
text, and the stamp outline only; `ink` is the only primary-button fill;
`ochre`/`signal-red` only where they mean pending or stopped. Dark theme swaps
ground `#211D15`, cards `#2A251C`, hairline `#3A3427`, text `#F1EBDD`; primary buttons flip to `bond` fill with `ink` text; accents hold in both themes.

## Type — exact specimen

Faces: **Source Serif 4** (600) for display and titles — a quietly
bureaucratic serif, the typeface of an ordinance · **Public Sans** (400/500/
600) for UI and body · **Spline Sans Mono** (500) for permit numbers, fees,
dates, recency stamps. All self-hosted woff2, preloaded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (marketing hero) | SS4 600 | `clamp(32px, 8.5vw, 54px)` / 1.1 | −0.01em |
| H2 (screen title) | SS4 600 | 22 / 1.25 | −0.005em |
| Title (row/card) | PS 600 | 16 / 1.3 | 0 |
| Body | PS 400 | 16 / 1.55 | 0 |
| Secondary | PS 400 | 13 / 1.45 | 0 |
| Label | PS 600 | 11 / 1.2 | +0.08em, uppercase |
| Data (permit no., fees, dates) | SSM 500 | 13 / 1.2 | 0, tabular figures |
| Button | PS 600 | 15 / 1 | 0 |

Every fee, date, permit number, and recency stamp is mono tabular, always;
serif appears only at Display/H2 — never in rows or buttons.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **8** (controls: buttons, inputs, chips) · **12** (requirement
  cards, panels) · **18** (sheets, modals). Nothing else.
- Elevation: none. Depth is `bond` on `manila` plus hairlines; only the sheet scrim shadows.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `stamp` (rounded-rect + check — also the brand mark),
`clipboard-check`, `building`, `bell`, `calendar-inspection`, `file-badge`,
`map-pin`, `refresh` (re-verify), `alert-triangle` (rule change),
`chevron-right`, `plus`, `search`. Nav at 22px, inline at 18px. **No emoji,
anywhere, ever** — a verified item gets the stamp glyph, never a checkmark emoji.

## Component construction (exact)

- **Primary button:** `ink` fill, `bond` text, radius 8, height 48 mobile
  (full-width in thumb zone), PS 600 15. Press: scale 0.98 + fill `ink-press`.
  Disabled: `hairline` fill, `ink-3` text.
- **Secondary:** transparent, 1px `hairline` border, `ink` text. Press: border
  darkens to `#C7BCA4`.
- **Quiet action:** text-only, `brick`, no underline; press dims to 80%.
- **Input:** `bond` fill, hairline border, radius 8, height 48, 16px text.
  Focus: border `brick` + 2px offset ring at 25% brick.
- **Chips (jurisdiction filter):** height 36, radius 8, hairline border, PS
  600 13; active = 1.5px `brick` border + `brick` text on `bond`. One
  `overflow-x:auto` row, never wrapped.
- **Checklist rows:** NO boxes. Full-bleed rows ≥56px, 16px vertical padding,
  hairline between. Left: 18px hairline ring (open), brick stamp (verified),
  `ink-3` dash (n/a). Center: Title(16) + Secondary detail. Right: mono
  recency in `ink-3` ("verified 11d ago"). Tapping the ring stamps it (signature).
- **Requirement cards:** `bond`, radius 12, padding 16. Header: Label
  ("MECHANICAL PERMIT") + mono version tag ("v4"). Body(16) text; footer:
  Secondary source ("City of Mesa Development Services") + mono recency +
  quiet action "View change history". Never nested in another card.
- **Status pills:** height 28, radius 8, 6px dot + Label(11): `ink-3` "NOT
  SUBMITTED", `ochre` "IN REVIEW", `brick` "ISSUED", `signal-red` "EXPIRED" /
  "STOP-WORK" (stop-work adds a 1.5px signal-red border — the only bordered pill).
- **Alert banner (rule change):** full-width, `bond`, hairline top+bottom, no
  radius — a notice pinned to the board. `alert-triangle` 18px `ochre`, Title
  "Mesa changed HVAC changeout requirements", Secondary one-line diff summary,
  mono date right, chevron. Dismiss is a quiet action.
- **Bottom tab bar:** height 56 + safe-area, `bond` at 96% + blur, hairline
  top. Four items (Jobs, Jurisdictions, Alerts, Licenses) at 22px icons +
  10px PS 600 labels; active = `ink` + 2px `brick` dot; inactive = `ink-3`.

## The signature — the jurisdiction stamp
When a checklist item is marked verified, the stamp settles onto the row: the
1.5px brick-outline rounded-rect + check glyph scales in from 1.4× to 1.0
with a −2° → 0° rotation in a single 240ms `ease-out-quart` — one motion, a
hand stamp landing — while the row's mono recency fades in ("verified just
now"). When the last item stamps, the header gets one quiet underline sweep:
a 1.5px brick line drawing left→right in 240ms, fading over 400ms; the header
flips to "Ready to submit". Rate-limited to one stamp at a time; rapid
multi-verifies queue 80ms apart, max 4, then snap. No sound, no confetti.
This is the entire brand animation — all else is state feedback ≤240ms.

## Mobile layout (390×844 — primary spec)
- **Jobs (home):** gutter 20. Top: brand stamp mark + search. Label "ACTIVE
  JOBS", then hairline rows: Title "2214 E Juniper Ave — HVAC changeout",
  Secondary "City of Mesa · permit MEC-2026-04471" (mono ref), pill right
  ("IN REVIEW", ochre). Rule-change banner slots above the list; primary
  button **New job checklist** pinned above the safe-area.
- **Job checklist:** header: job title, jurisdiction + job type, mono
  progress ("4 of 6 verified"). Requirement card up top: "City of Mesa —
  Residential HVAC changeout: mechanical permit required, plan review not
  required, `$89` fee, 2-3 day issuance" + source + "verified 11d ago". Below,
  the rows (permit, load calc n/a, fee, site plan, inspection booking note,
  license current). The last stamp sweeps the header.
- **Jurisdiction page:** H2 serif "City of Mesa", Secondary "Development
  Services · (480) 644-4273 · Mon-Thu 7:00-6:00". Job-type chip row (HVAC
  changeout · Re-roof · Water heater · Panel upgrade · Solar PV); requirement
  cards per selection; Label "RECENT CHANGES" feed: "May 14 — Load
  calculation now required for changeouts over 5 tons".
- **Alerts:** hairline rows grouped by day: rule changes (`alert-triangle`,
  ochre) and expiries ("ROC license C-39 expires in 7 days", signal-red at T-7), mono dates, chevron.
- **First run:** full-width **Watch your first jurisdiction** primary button
  in the thumb zone; above it, a real preview card for the user's own city —
  the product demos itself with the user's actual rules, not a tour.

## Responsive
≥768px: jobs become a two-column board (list + selected checklist), gutters
32; requirement cards sit in a right rail. ≥1024px: left rail replaces the
tab bar; center is the checklist/jurisdiction canvas; right rail is the alert
feed; max content width 1120 centered. The stamp is the signature at every
size — no desktop spectacle.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Checklist rows enter with 24ms stagger,
opacity + 4px y-slide only. Pills and chips crossfade 150ms. Alert banners
slide down 200ms `ease-in-out-soft`, inserted on load or pull-to-refresh
(which re-checks watched jurisdictions), never mid-read. Targets ≥44px, ≥8px
apart; destructive actions hold-to-confirm (600ms radial fill). Haptics on
native wrappers only, never load-bearing.

## Reduced motion & fallback
Stamp settle → instant appearance with a single 100ms opacity fade; header
sweep → a plain brick underline, no animation. Staggers → ≤100ms opacity
fade; banner slide → instant insert. Every animated signal (verified,
changed, expired) is also plain text in the row — the mono recency stamp and
pill copy carry the meaning without motion.
