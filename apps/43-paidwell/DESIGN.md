# PaidWell — Design Specification (v5, redline level)

## Vision
Fine business stationery that happens to be software. PaidWell asks for money
on the firm's behalf, so it must look like the firm's best letterhead: ivory
paper, ink type, hairline rules, and one banker's green that appears only where
money lands or is spoken for. The tone of the pixels matches the tone of the
emails — courteous, unhurried, impossible to ignore.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `ledger` | `#F7F5F0` | The ground. Every screen — warm ivory, never pure white |
| `sheet` | `#FFFFFF` | Framed objects only: invoice previews, the portal card, grouped stat panels |
| `hairline` | `#E5E1D6` | 1px rules & panel borders — never darker |
| `ink` | `#20261F` | Primary text and **primary buttons** (paper text on them) |
| `text-2` | `#6E756C` | Secondary text |
| `text-3` | `#9AA096` | Faint (timestamps, placeholders) |
| `banker` | `#2F6E52` | THE accent. ≤10% of any screen: paid figures, kept promises, active states, links, the settle rule |
| `amber` | `#BC8A2F` | 31–60 day bucket, open promises, approaching escalation |
| `red` | `#A8493B` | 61+ overdue, broken promises, final-notice state only |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: `banker` never fills a button or a surface; `ink` is the only
high-emphasis fill; amber/red mean aging risk only. This app commits to the
single light "stationery" world deliberately — there is no dark theme; the
portal a client sees and the dashboard the firm sees share one paper.

## Type — exact specimen

Faces: **Source Serif 4** (600) for display and hero figures · **Public Sans**
(400/500/600) for UI · **IBM Plex Mono** (500) for every amount, date, and
day-count. All self-hosted woff2, preloaded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (portal header, marketing) | SS4 600 | `clamp(30px, 8vw, 48px)` / 1.12 | −0.01em |
| Hero stat (Outstanding / DSO) | IPM 500 | `clamp(34px, 9vw, 52px)` / 1.05 | −0.01em, tabular |
| H2 (screen title) | SS4 600 | 22 / 1.2 | −0.005em |
| Title (row) | PS 600 | 16 / 1.3 | 0 |
| Body | PS 400 | 16 / 1.55 | 0 |
| Secondary | PS 400 | 13 / 1.45 | 0 |
| Label | PS 600 | 11 / 1.2 | +0.08em, uppercase |
| Data / money | IPM 500 | 13 / 1.2 | 0, tabular figures |
| Button | PS 600 | 15 / 1 | 0 |

All money is mono tabular. Days-to-pay figures render as `47d`, mono. The
serif appears only in Display/H2 — never in body or controls.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **8** (controls: buttons, inputs, chips) · **12** (sheets/panels:
  invoice preview, portal card) · **18** (bottom sheets). Nothing else.
- Elevation: none in-app. The portal card alone carries a 0 2px 8px rgba(32,38,31,0.06)
  lift — it is a document on a desk. Everything else is hairlines on ivory.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `scales` (aging), `hourglass` (awaiting), `send` (sequence),
`hand-shake` (promise), `banknote-in` (payment), `calendar-check`, `mail`,
`reply`, `pause`, `play`, `gear`, `chart-forecast` (forecast), `download`,
`chevron-right`, `plus`. Nav renders at 22px, inline at 18px. **No emoji,
anywhere, ever** — a landed payment gets `banknote-in`, not confetti.

## Component construction (exact)

- **Primary button:** `ink` fill, `ledger` text, radius 8, height 48 mobile
  (full-width in thumb zone). Press: scale 0.98 + fill `#2C332B`. Disabled:
  `#D9D5CA` fill, `text-3` text.
- **Secondary:** transparent, 1px hairline, `ink` text. Press: border `#CFCABC`.
- **Quiet action:** text-only `banker`, no underline; press dims to 80%.
- **Input:** `sheet` fill, hairline border, radius 8, height 48, 16px text.
  Focus: border `banker` + 2px offset ring at 25% banker.
- **Aging bar:** one horizontal band, height 12, radius 6, four segments —
  current `#DDE7E0`, 31–60 amber at 70%, 61–90 red at 60%, 90+ red solid —
  mono bucket totals beneath. Never a pie.
- **Invoice rows:** NO boxes. Full-bleed hairline rows ≥56px: Title(16)
  client name, mono amount right, Secondary state line ("step 2 of 4 · next
  nudge Tue") in `text-3`, 6px status dot left (amber in-sequence, red
  final-notice, banker paid).
- **Promise chip:** height 28, radius 8, hairline; `hand-shake` 14px + mono
  date ("FRI 12 JUL"). Open = amber text; kept = banker; broken = red with
  strikethrough on the date.
- **Sequence step card:** `sheet`, radius 12, padding 16: Label ("STEP 3 ·
  DUE +10D · FIRM"), subject line in Title, body preview 2 lines in Secondary,
  mono send stats ("68% open · 31% click-to-portal").
- **Approval tray:** bottom sheet (radius 18) listing queued sends as hairline
  rows; each row's Approve is a 44px quiet-action; "Approve all 6" is the
  ink primary pinned in the thumb zone.
- **Bottom tab bar:** height 56 + safe-area, `ledger` at 96% + blur, hairline
  top. Four items (Aging / Sequences / Promises / Forecast) at 22px icons +
  10px PS 600 labels; active = `ink` + 2px banker dot; inactive = `text-3`.

## The signature — the settle rule
When an invoice is paid, its row settles like a ledger being ruled off: a
1.5px `banker` rule draws left→right under the row in 280ms `ease-out-quart`,
the amount flips to banker with a mono `PAID · 14 JUL` stamp fading in at 90%
opacity, and the row then glides down to the settled section over 320ms
`ease-in-out-soft`. Simultaneously the Outstanding hero figure decrements once
(direct swap, no odometer theatrics) and DSO re-computes with a 240ms crossfade.
One settle at a time; simultaneous payments queue 150ms apart, max 3 visible.
This is the entire brand animation — bookkeeping as choreography, no coins.

## Mobile layout (390×844 — primary spec)
- **Aging (home):** gutter 20. Top: firm mark + sync status ("QuickBooks ·
  synced 6m ago" in mono `text-3`). Hero: Label "OUTSTANDING" over `$61,240.00`,
  beside mono `DSO 47d ↓3`. The aging bar. Then Label "NEEDS ATTENTION" and
  hairline rows sorted by escalation urgency — "Meridian Co · `$12,400` ·
  71d · final notice queued". Primary button **Review 6 queued sends** pinned
  above the safe-area when approvals wait.
- **Invoice detail:** amount + days counter in mono, the sequence timeline as
  a vertical hairline with step nodes (sent = ink, next = amber ring, paid
  short-circuits to the settle rule), reply excerpts inline, promise chip row.
  Thumb zone: **Log a promise** secondary + **Send next step now** primary.
- **Client portal (their phone):** the `sheet` card on `ledger`: firm's
  letterhead name in SS4, balance in hero mono, invoice list, then **Pay
  $12,400** ink primary and "I'll pay on a date" quiet action beneath.
  No PaidWell branding above the fold — the firm's voice, our footer line.
- **Forecast:** weekly columns as hairline-topped bars (height = expected
  cash-in), mono totals, confidence shown as solidity (100% ink → 40%
  `text-3`); "based on 14 open invoices + 3 promises" in Secondary.

## Responsive
≥768px: aging bar and hero form one band, rows gain columns (step, promise,
days), gutters 32. ≥1024px: left rail nav replaces tabs; center is the invoice
table; right rail is the approval tray, always visible; max content 1120.
No desktop spectacle — the settle rule is the signature at every size.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Rows enter with 24ms stagger, opacity + 4px
y-rise only — ledgers never bounce. Chips crossfade 150ms. Approval rows slide
out 200ms on approve. Targets ≥44px, ≥8px apart; **Send next step now** and
"write off" are hold-to-confirm (600ms radial fill). Pull-to-refresh re-syncs
accounting (also a header control). Haptics native-only, never load-bearing.

## Reduced motion & fallback
Settle rule → instant PAID state with a single 100ms opacity fade; row
reorder → immediate. Stagger → ≤100ms fade. Counters swap directly. Every
animated state (paid, promised, escalated) is also plain text in the row.
