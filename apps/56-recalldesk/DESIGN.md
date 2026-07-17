# RecallDesk — Design Specification (v5, redline level)

## Vision
Operatory-clean. RecallDesk looks like the best-run front desk you've ever
seen: cool porcelain grounds, graphite ink, and rinse-water aqua used only
where the schedule fills. Money is always mono and always earned — the
recovered-production counter climbs one attributed booking at a time, never
in a whoosh. Calm, scrubbed, exact.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `porcelain` | `#F4F6F7` | The ground. Every screen — cool clinical white |
| `card` | `#FCFDFD` | Patient cards, report panels, sheets only |
| `hairline` | `#E0E5E7` | 1px dividers & panel borders — never darker |
| `ink` | `#20282C` | Primary text AND primary button fill (graphite) |
| `ink-2` | `#647076` | Secondary text |
| `ink-3` | `#96A0A5` | Faint (timestamps, placeholders) |
| `aqua` | `#3F8FA0` | THE accent. <=10% of any screen: filled slots, links, active states, focus rings, attributed-booking marks |
| `green` | `#3E7E58` | Booked / kept / consent-on only |
| `amber` | `#B3873A` | Overdue 6-12mo / mid-sequence / preview-pending only |
| `red` | `#B04B3E` | Overdue 24mo+ / bounced / opted-out only |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: `aqua` never fills a button or a surface; `ink` is the only
high-emphasis fill (porcelain text on it); semantic colors carry patient/
message state only. Committed to the single clinical-light world — this is
a front-desk tool used under office lighting; no dark theme in v1, by choice.
The patient booking page shares the identical theme.

## Type — exact specimen

Faces: **Schibsted Grotesk** (400/500/700 — modern, plainspoken, slightly
Scandinavian-clinic) for display, UI, and body · **IBM Plex Mono** (500) for
every dollar amount, count, date, and phone number. Both self-hosted woff2,
preloaded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (marketing hero) | SG 700 | `clamp(32px, 8.5vw, 54px)` / 1.08 | −0.015em |
| Hero stat (recovered $) | IPM 500 | `clamp(34px, 9.5vw, 52px)` / 1.05 | −0.01em, tabular; cents 60% size |
| H2 (screen title) | SG 700 | 22 / 1.2 | −0.01em |
| Title (patient row) | SG 500 | 16 / 1.3 | 0 |
| Body | SG 400 | 16 / 1.55 | 0 |
| Secondary | SG 400 | 13 / 1.45 | 0 |
| Label | SG 700 | 11 / 1.2 | +0.08em, uppercase |
| Data / money / dates / phones | IPM 500 | 13 / 1.2 | 0, tabular figures |
| Button | SG 700 | 15 / 1 | 0 |

All money is mono tabular, always. The overdue-list dollar total is the
biggest number in the product and earns the hero-stat role on the dashboard.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **8** (controls: buttons, inputs, chips) · **12** (patient cards,
  report panels) · **20** (sheets, the import preview). Nothing else.
- Elevation: none. Depth is `card` on `porcelain` plus hairlines; only sheet
  scrims shadow.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `chair-side` (the hygiene chair — brand mark), `list-rows`
(overdue list), `send-steps` (campaigns), `phone-handset` (call queue),
`ledger-book` (attribution), `arrow-up-doc` (import), `calendar-slot`,
`link-token` (booking link), `shield-line` (consent), `pause-octagon`
(do not contact), `check-seat` (booked), `download`, `chevron-right`,
`plus`. Nav renders at 22px, inline at 18px. **No emoji, anywhere, ever** —
a booked patient gets `check-seat`, not a tooth emoji.

## Component construction (exact)

- **Primary button:** `ink` fill, `porcelain` text, radius 8, height 48
  mobile (full-width in thumb zone), SG 700 15. Press: scale 0.98 + fill
  `#2B343A`. Disabled: `#D6DBDD` fill, `ink-3` text.
- **Secondary:** transparent, 1px hairline, `ink`. Press: border `#C9D0D3`.
- **Quiet action:** text-only, `aqua`, no underline; press dims to 80%.
- **Input:** `card` fill, hairline border, radius 8, height 48, 16px text.
  Focus: border `aqua` + 2px offset ring at 25% aqua.
- **Bucket chips (3-6 / 6-12 / 12-24 / 24+):** height 36, radius 8, hairline;
  active = `aqua` 1px border + `aqua` text; each chip carries its mono count.
- **Patient rows (overdue list):** NO boxes. Full-bleed rows >=56px, hairline
  between: Title(16) name, mono est. value right, Secondary line "last visit
  Nov 2024 · due since May" in `ink-3`; bucket dot left (`amber` 6-12,
  `red` 24+; 3-6 uses `ink-3`). Consent glyphs (email/SMS) render tiny at
  row end — `red` slash variant when bounced/opted out.
- **Call-queue card:** `card`, radius 12, padding 16: rank Label ("#3 ·
  $310"), patient Title, mono phone (tap to dial), context line, then the
  two-tap disposition row — five 44px chips (Booked / Left msg / Call back /
  Skip / DNC). Booked flips the card to a thin `green` confirmation row.
- **The week-strip (dashboard + landing device):** 7 columns of hygiene-slot
  cells, 8px radius, hairline borders; empty = `porcelain` with a hollow
  center dot; filled = 12% aqua wash + `aqua` dot + mono initials. Strictly
  data-driven — slots fill only on attributed bookings.
- **Attribution ledger rows:** mono date + patient + touch channel glyph +
  mono `$310`, hairline-divided; each row expands to its receipt (touch
  timestamp, template name, booking date, window math). An unattributed
  booking renders in `ink-3` with "no qualifying touch" — honesty is a
  component state.
- **Import preview sheet:** radius 20: mono counts ("3,412 rows · 2,890
  patients"), anomaly rows in `amber` ("41% missing phone — check column F"),
  then **Commit import** primary + "Dry run — nothing saved yet" Label.
- **Status pill:** height 28, 6px dot + Label(11): `green` "BOOKED" /
  "KEPT", `amber` "MID-SEQUENCE" / "PREVIEW", `red` "OPTED OUT" / "BOUNCED",
  `aqua` "ATTRIBUTED".
- **Bottom tab bar:** height 56 + safe-area, `card` at 96% + blur, hairline
  top: `chair-side` (Dashboard) / `list-rows` (Overdue) / `phone-handset`
  (Queue) / `send-steps` (Campaigns) at 22px + 10px labels; active = `ink` +
  2px `aqua` dot; inactive = `ink-3`.

## The signature — the chair fills (four beats)
When a booking is attributed (nightly run or front-desk confirm), one beat
sequence, <=800ms total, mobile-capable:

1. **The slot fills** — the week-strip's matching cell washes 12% aqua and
   its hollow dot becomes solid (`ease-out-quart`, 200ms).
2. **The initials seat** — mono patient initials fade up in the cell (120ms).
3. **The counter climbs** — the recovered-production number rolls up by one
   visit value, odometer-style, digits only (`spring-gentle`, <=300ms).
4. **The receipt line** — a one-line ledger entry slides in under the strip
   ("R.M. · SMS Jun 30 -> booked Jul 8 · $310"), 16px rise, then settles.

Batched attributions (the nightly run) queue at most 3 fills, 80ms apart,
then a summary line ("+4 more attributed overnight"). No confetti, no
pulsing dollar signs. Everything else is state feedback <=240ms.

## Mobile layout (390×844 — primary spec)
- **Dashboard (home):** gutter 20. Label "JULY" + hero stat `$9,412`
  recovered with Secondary "31 bookings attributed · $184,300 still
  overdue", then the week-strip, then the ledger's latest rows. Thumb-zone
  primary: **See your overdue list** (the CTA is also the product's main
  verb); **Run report** quiet action in the header.
- **Overdue list:** bucket chips with counts, dollar-total header row
  (mono, the number that sold the trial), patient rows; filter sheet
  (consent, last-touch, exclusions). Thumb-zone primary: **Start campaign**
  with the current filter as segment.
- **Call queue:** today's date + progress ("4 of 20 worked"), queue cards
  stacked; booking requests from links pinned on top with `link-token`
  glyph. Disposition is thumb-reachable on every card.
- **Campaigns:** campaign rows (name, segment size, step progress as tiny
  mono "2/3", status pill); detail screen shows the sequence as a vertical
  hairline timeline with per-step sent/delivered counts.
- **Booking page (/book/[token]):** location name, one friendly line,
  window picker (chips: Mon AM, Mon PM, ...), phone confirm, **Request a
  time** primary. One screen, no scroll on 390px if possible.
- **First run:** three cards — export recipe for your PMS (Dentrix/
  Eaglesoft/Open Dental tabs), upload + map CSV, preview -> commit (ends on
  the overdue list with its dollar total). Real data replaces each card.

## Responsive
>=768px: overdue list gains columns (last visit, due since, consent, last
touch); the call queue becomes list + patient-detail panes; gutters 32.
>=1024px: left rail replaces the tab bar; dashboard shows week-strip +
ledger side by side; max content width 1120 centered. The chair-fill beats
remain the signature at every size; no desktop spectacle.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Rows enter with 24ms stagger, opacity + 4px
y-slide only — rosters never bounce. Chips crossfade 150ms; sheets 320ms
`spring-gentle`. Targets >=44px, >=8px apart; two-tap dispositions are two
distinct taps (no swipe-only actions). Destructive/compliance actions
(do-not-contact, rollback import, delete campaign) are hold-to-confirm
(600ms fill) and always audit-logged. Pull-to-refresh on the queue re-checks
booking requests. Haptic on a slot fill, native only, never load-bearing.

## Reduced motion & fallback
Chair-fill -> the slot appears filled with a <=100ms fade; counter -> direct
number swap; receipt line -> appears in place. Batch fills -> single summary
line. Stagger -> <=100ms opacity fade. Attributed/booked/opted-out states
are always plain text + pill in the row — nothing is motion-only.
