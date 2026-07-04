# DuesDesk — Design Specification (v5, redline level)

## Vision
Town-hall stationery, kept by someone careful. DuesDesk is the ledger and
minute-book of a small community: calm linen grounds, civic navy used like a
fountain pen, mono figures for money, and records that read as fair. The
satisfying moment is quiet — an invoice getting its PAID seal, the
checks-to-chase number rolling down.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `linen` | `#F6F7F4` | The ground. Every screen — cool civic paper |
| `card` | `#FDFDFB` | Issue threads, statement panels, document rows' sheet only |
| `hairline` | `#E2E5DE` | 1px dividers & panel borders — never darker |
| `ink` | `#1E2732` | Primary text AND primary button fill |
| `ink-2` | `#66707C` | Secondary text |
| `ink-3` | `#98A1AB` | Faint (timestamps, placeholders) |
| `navy` | `#35577D` | THE accent. ≤10% of any screen: the PAID seal, links, active states, focus rings, issue numbers |
| `green` | `#38855C` | Paid / resolved / enrolled only |
| `amber` | `#B8862F` | Past due / pending / in progress only |
| `red` | `#AF4A3D` | 90+ delinquent / open violation only |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: `navy` never fills a button or a surface; `ink` is the only
high-emphasis fill (linen text on it); semantic colors carry money/issue
state only. Committed to the single light world — this is stationery; no
dark theme in v1, by choice. The member portal shares the identical theme:
one association, one paper.

## Type — exact specimen

Faces: **Libre Franklin** (400/500/600 — the US-forms lineage, worn well) for
display and UI · **Spline Sans Mono** (500) for every amount, date, unit
number, and issue number. Both self-hosted woff2, preloaded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (marketing hero) | LF 600 | `clamp(32px, 8.5vw, 54px)` / 1.08 | −0.015em |
| Hero stat (collected) | SSM 500 | `clamp(34px, 9.5vw, 52px)` / 1.05 | −0.01em, tabular; cents 60% size |
| H2 (screen title) | LF 600 | 22 / 1.2 | −0.01em |
| Title (household/issue row) | LF 600 | 16 / 1.3 | 0 |
| Body | LF 400 | 16 / 1.55 | 0 |
| Secondary | LF 400 | 13 / 1.45 | 0 |
| Label | LF 600 | 11 / 1.2 | +0.08em, uppercase |
| Data / money / dates | SSM 500 | 13 / 1.2 | 0, tabular figures |
| Button | LF 600 | 15 / 1 | 0 |

All money is mono tabular, always. Issue numbers ("2026-014") render mono in
`navy` — the accent's quietest recurring home.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **8** (controls: buttons, inputs, chips) · **12** (issue threads,
  statement panels) · **20** (sheets, photo viewers). Nothing else.
- Elevation: none. Depth is `card` on `linen` plus hairlines; only the sheet
  scrim shadows.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `receipt-line` (dues), `people-row` (roster), `gavel-small`
(issues), `horn-flat` (announce), `gear` (settings), `seal-check` (paid —
a ring with a check), `bank` (ACH), `card`, `camera`, `file-lines`
(documents), `send`, `repeat` (autopay), `download`, `chevron-right`, `plus`.
Nav renders at 22px, inline at 18px. **No emoji, anywhere, ever** — a paid
invoice gets `seal-check`, not a money-bag emoji.

## Component construction (exact)

- **Primary button:** `ink` fill, `linen` text, radius 8, height 48 mobile
  (full-width in thumb zone), LF 600 15. Press: scale 0.98 + fill `#2A3440`.
  Disabled: `#D8DBD4` fill, `ink-3` text.
- **Secondary:** transparent, 1px hairline, `ink`. Press: border `#CBCFC8`.
- **Quiet action:** text-only, `navy`, no underline; press dims to 80%.
- **Input:** `card` fill, hairline border, radius 8, height 48, 16px text.
  Focus: border `navy` + 2px offset ring at 25% navy.
- **Chips (aging filter: All / 30 / 60 / 90+):** height 36, radius 8,
  hairline; active = `navy` 1px border + `navy` text.
- **Household rows (delinquency, roster):** NO boxes. Full-bleed rows ≥56px,
  hairline between: Title(16) unit + name, mono balance right, Secondary
  status line ("autopay · ACH" or "overdue 34 days") in `ink-3`; aging dot
  left (`green` current, `amber` 30/60, `red` 90+).
- **The PAID seal:** 20px circle, 1.5px `navy` ring, `navy` check, Label
  "PAID" beside it in navy — a rubber stamp, drawn once per settled invoice.
  Never green (green is the *row* state; the seal is the association's mark).
- **Invoice/statement panel:** `card`, radius 12, padding 16: association
  name Label, period Title, line items as hairline rows (mono amounts),
  balance rule (1px `ink`) above the total, the PAID seal top-right when
  settled.
- **Issue thread:** `card`, radius 12: header (mono issue number in `navy`,
  kind Label, status pill), then events as hairline-divided entries —
  author + mono timestamp, Body text, photo thumbnails (radius 8, 64px,
  tap to view). Board-only events get a `linen` inset background + Label
  "BOARD ONLY"; member-visible events plain. The visibility distinction is
  structural, not a footnote.
- **Status pill:** height 28, 6px dot + Label(11): `green` "PAID" /
  "RESOLVED" / "ENROLLED", `amber` "PAST DUE" / "IN PROGRESS", `red`
  "90+ DAYS" / "OPEN VIOLATION".
- **Delivery report rows:** mono counts ("58 DELIVERED · 2 BOUNCED"), bounce
  rows expandable to fix the address inline.
- **Bottom tab bar:** height 56 + safe-area, `card` at 96% + blur, hairline
  top: receipt-line / people-row / gavel-small / horn-flat at 22px + 10px
  labels; active = `ink` + 2px `navy` dot; inactive = `ink-3`.

## The signature — the seal and the countdown
When a payment settles (webhook confirms), two things happen in one beat:
the invoice's PAID seal stamps in — scale 1.15→1.0 with `spring-snappy`,
ring drawing 0→360° in 240ms — and the dashboard's "checks to chase" number
rolls down one digit (`spring-gentle`, ≤300ms). Autopay-run mornings batch
settlements into one roll with at most 3 seal stamps visible, 80ms apart.
The seal is the association's own mark landing on paper; there is no
confetti, no coin animation, no green flash. Everything else is state
feedback ≤240ms.

## Mobile layout (390×844 — primary spec)
- **Dues (home):** gutter 20. Label "Q2 DUES" + hero stat `$11,340`
  collected-of-expected with a 4px hairline track filled `green`, then
  Secondary "9 households outstanding · $1,620". Aging chips, then
  household rows. Thumb-zone primary: **Record a payment** (the check
  holdouts); **Run reminders** as secondary in the row header.
- **Household detail:** balance panel with invoice history (PAID seals on
  settled rows), autopay status (`repeat` glyph + "ACH · enrolled Mar 2"),
  contact block, payment-plan quiet action. Recording a check: two taps
  from here.
- **Issues:** filter chips (Open / In progress / Resolved), issue rows
  (mono number in navy, Title, household, status pill); primary **New
  issue**. Thread view per the component spec; **Add photo** uses the
  camera directly.
- **Announce:** compose sheet (subject, body, segment picker, channel
  toggles with SMS opt-in counts shown honestly: "SMS reaches 41 of 63"),
  then the delivery report.
- **Member portal (/pay/[token]):** association header, balance panel,
  **Set up autopay** primary in the thumb zone (the wedge — first screen,
  every time, until enrolled), then Pay once, invoice history, documents,
  "my requests" with the member-visible timelines.
- **First run:** three cards — import roster (CSV), connect Stripe, create
  the first assessment (ends on the "63 invoices will be created Apr 1"
  preview). Real data replaces each card as it completes.

## Responsive
≥768px: dashboard becomes list + detail panes; the delinquency table gains
columns (last payment, plan, contact); gutters 32. ≥1024px: left rail
replaces the tab bar; issues get a two-pane thread view; max content width
1120 centered. The seal and countdown remain the signature at every size;
no desktop spectacle.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Rows enter with 24ms stagger, opacity + 4px
y-slide only — ledgers never bounce. Chips crossfade 150ms; sheets 320ms
`spring-gentle`; photo viewer zooms from the thumbnail rect. Targets ≥44px,
≥8px apart; destructive/board-power actions (waive late fee, close issue,
revoke portal link) are hold-to-confirm (600ms fill) and always audit-logged.
Pull-to-refresh re-checks payment webhooks. Haptic on seal stamp, native
only, never load-bearing.

## Reduced motion & fallback
Seal → appears complete with a ≤100ms fade; countdown → direct number swap;
batch settlements → single summary line ("3 payments settled"). Stagger →
≤100ms opacity fade. Paid/overdue/resolved states are always plain text +
pill in the row — nothing is motion-only.
