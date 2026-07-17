# ChairFlow — Design Specification (v5, redline level)

## Vision
Clipper-metal and appointment-book paper. ChairFlow reads like a barber's
station kept immaculate: cool paper grounds, near-black ink, chrome-adjacent
neutrals, and clipper-housing cobalt used only where protection lives — the
policy, the saved card, the fee that collected itself. The satisfying moment
is deadpan: a missed slot flips, and the ledger line writes itself.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `paper` | `#F5F6F8` | The ground. Every screen — cool station paper |
| `card` | `#FCFDFE` | Appointment cards, ledger panels, sheets only |
| `hairline` | `#E1E4EA` | 1px dividers & panel borders — never darker |
| `ink` | `#1F242C` | Primary text AND primary button fill (near-black steel) |
| `ink-2` | `#636B77` | Secondary text |
| `ink-3` | `#959CA8` | Faint (timestamps, placeholders) |
| `cobalt` | `#3A62B8` | THE accent. <=10% of any screen: policy marks, card-on-file glyph, links, active states, focus rings, the fee ledger line |
| `green` | `#3E7C55` | Completed / paid / rebooked only |
| `amber` | `#B5883B` | Late-cancel / rent due / offer pending only |
| `red` | `#B14A3E` | No-show / failed charge / rent late only |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: `cobalt` never fills a button or a surface; `ink` is the only
high-emphasis fill (paper text on it); semantic colors carry appointment/
money state only. Committed to the single cool-light world — the booking
page a client sees and the dashboard the stylist works share one identical
theme: the stylist's brand is the photo and the handle, not a theme editor
(v1, by choice). No dark theme in v1.

## Type — exact specimen

Faces: **Hanken Grotesk** (400/500/700 — humanist-grotesk, warm enough for a
service trade, sharp enough for money) for display, UI, and body ·
**JetBrains Mono** (500) for every price, time, phone, and ledger line. Both
self-hosted woff2, preloaded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (marketing hero) | HG 700 | `clamp(32px, 8.5vw, 54px)` / 1.08 | −0.015em |
| Hero stat (protected $) | JBM 500 | `clamp(34px, 9.5vw, 52px)` / 1.05 | −0.01em, tabular; cents 60% size |
| H2 (screen title) | HG 700 | 22 / 1.2 | −0.01em |
| Title (appointment/client row) | HG 600 | 16 / 1.3 | 0 |
| Body | HG 400 | 16 / 1.55 | 0 |
| Policy text (booking page) | HG 500 | 15 / 1.5 | 0 |
| Secondary | HG 400 | 13 / 1.45 | 0 |
| Label | HG 700 | 11 / 1.2 | +0.08em, uppercase |
| Data / money / times | JBM 500 | 13 / 1.2 | 0, tabular figures |
| Button | HG 700 | 15 / 1 | 0 |

All money is mono tabular, always. The ledger line ("no-show fee · per
policy agreed Jun 12 · +$22.50") is one mono line — the product's most
important sentence, typeset like a receipt.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **8** (controls: buttons, inputs, chips, slots) · **12**
  (appointment cards, ledger panels) · **20** (sheets, the policy panel).
  Nothing else.
- Elevation: none. Depth is `card` on `paper` plus hairlines; only sheet
  scrims shadow.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `chair-seat` (brand mark), `day-grid` (schedule),
`people-book` (clients), `shield-card` (card on file / protection),
`policy-scroll` (the policy), `ledger-line` (fees), `pulse-return`
(cadence nudge), `bell-slot` (waitlist), `key-rent` (rent ledger),
`link-bio` (booking page), `waive-hand`, `calendar-sync`, `download`,
`chevron-right`, `plus`. Nav renders at 22px, inline at 18px. **No emoji,
anywhere, ever** — a no-show gets its status pill, not a ghost emoji.

## Component construction (exact)

- **Primary button:** `ink` fill, `paper` text, radius 8, height 48 mobile
  (full-width in thumb zone), HG 700 15. Press: scale 0.98 + fill `#2A303A`.
  Disabled: `#D7DAE0` fill, `ink-3` text.
- **Secondary:** transparent, 1px hairline, `ink`. Press: border `#CBD0D9`.
- **Quiet action:** text-only, `cobalt`, no underline; press dims to 80%.
- **Input:** `card` fill, hairline border, radius 8, height 48, 16px text.
  Focus: border `cobalt` + 2px offset ring at 25% cobalt.
- **Day-strip slots (dashboard + landing device):** full-width rows, radius
  8, hairline: mono time left ("2:00"), client Title + service Secondary,
  mono price right. States: booked = `card`; completed = `green` dot +
  price stays; no-show = the flip (below); open = `ink-3` dashed hairline
  "open". Card-on-file bookings carry the tiny `shield-card` glyph in
  `cobalt` at row end.
- **The policy panel (booking page):** `card`, radius 20, padding 16:
  Label "THE POLICY", the stylist's policy text at 15/1.5, then the
  agreement line — "Booking means you agree" with the mono timestamp
  stamped post-booking. Versioned text, never truncated, never a tooltip.
- **The ledger line:** one mono row, hairline above: kind + policy
  reference + signed amount ("no-show fee · per policy agreed Jun 12 ·
  +$22.50") in `ink`, amount in `cobalt`. Waived lines strike the amount
  and append "waived" in `ink-3`. The protection ledger is these lines
  stacked, nothing fancier.
- **Client rows:** NO boxes. Full-bleed rows >=56px, hairline between:
  Title(16) name, Secondary "every 3 weeks · last in Jun 26" with mono
  figures, `shield-card` glyph when a card is on file; drifted clients
  (past due + grace) get a `pulse-return` glyph in `amber`.
- **Fee/waive controls:** the flagged appointment card offers three 44px
  actions — Completed / No-show / Grace. No-show opens the fee sheet:
  policy math itemized in mono (service $45 -> fee 50% -> deposit applied
  -$10 -> charge $12.50), primary **Charge per policy**, quiet **Waive**
  beneath. Waive is one tap, always visible, logged.
- **Rent grid (Shop tier):** chairs x weeks; cells radius 8: paid =
  `green` dot + mono amount, due = `amber`, late = `red`, waived = struck.
  Tapping a cell shows both sides' same history — one ledger, two viewers.
- **Status pill:** height 28, 6px dot + Label(11): `green` "COMPLETED" /
  "PAID" / "REBOOKED", `amber` "LATE CANCEL" / "RENT DUE" / "OFFERED",
  `red` "NO-SHOW" / "FAILED" / "LATE".
- **Bottom tab bar:** height 56 + safe-area, `card` at 96% + blur, hairline
  top: `day-grid` / `people-book` / `ledger-line` / `link-bio` at 22px +
  10px labels; active = `ink` + 2px `cobalt` dot; inactive = `ink-3`.

## The signature — the slot flips, the ledger writes (four beats)
When a no-show fee resolves (charge succeeds, or a deposit converts),
<=900ms total, mobile-first:

1. **The flip** — the appointment slot flips on its x-axis (240ms,
   `ease-in-out-soft`) from booked face to its `red` NO-SHOW face — the
   appointment-book page turning.
2. **The math writes** — beneath the slot, the fee arithmetic types itself
   in mono, one line, left to right (200ms wipe, not typewriter-per-char):
   "50% of $45 · deposit kept $10".
3. **The ledger line lands** — the finished line slides into the ledger
   list (16px rise, `spring-gentle`), amount in `cobalt`.
4. **The counter settles** — the protected-this-month hero number rolls up
   once, odometer-style (<=300ms). The chair got paid anyway.

No confetti, no coins, no red flash beyond the slot face. Everything else
is state feedback <=240ms.

## Mobile layout (390×844 — primary spec)
- **Today (home):** gutter 20. Label "THURSDAY JUL 17" + hero stat
  `$212.50` protected this month with Secondary "3 fees · 2 deposits kept ·
  1 waived", then the day-strip slots. Flagged appointments float a
  resolve card to the top. Thumb-zone primary: **Add appointment**;
  share-your-link quiet action in the header.
- **Booking page (/b/[handle], client-facing):** stylist photo + handle +
  shop, service rows (mono prices, durations), slot picker (day chips +
  time grid), contact + SMS consent, the policy panel, Stripe payment
  element, **Book it** primary. One column, thumb-only, no client account
  anywhere.
- **Clients:** search, client rows; client detail = history rows (mono
  dates, status pills), cadence line ("every 3 weeks · due Jul 10"),
  card-on-file state, notes, no-show record; quiet actions: nudge now,
  waitlist add.
- **Ledger:** month header with the hero stat, then ledger lines stacked;
  filter chips (Fees / Deposits / Waived / Failed). Failed rows expand to
  the retry payment link.
- **Rent (Shop, owner view):** the rent grid, tap-through cell history,
  **Send payment link** on due cells.
- **First run:** three cards — claim your handle (live URL preview),
  add services + policy (template policies to edit, not blank fields),
  connect Stripe (Express; page works cardless until done). Ends with the
  booking page live and a test booking walked through.

## Responsive
>=768px: Today becomes week view + detail pane; the ledger gains a monthly
chart (bars, `cobalt`, one series); gutters 32. >=1024px: left rail replaces
the tab bar; the rent grid shows a full quarter; max content width 1120
centered. The slot-flip beats remain the signature at every size; no desktop
spectacle. The booking page stays a single column at every width — it is a
phone page that happens to open on desktops.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Rows enter with 24ms stagger, opacity + 4px
y-slide only — schedules never bounce. Chips crossfade 150ms; sheets 320ms
`spring-gentle`; the slot flip reserves its 240ms for the signature only.
Targets >=44px, >=8px apart. Money-moving and record actions (charge fee,
waive, refund, mark rent paid) are hold-to-confirm (600ms fill) and always
audit-logged; waive alone is deliberately a single tap (grace should be
easy, charging should be deliberate). Pull-to-refresh on Today re-checks
webhooks. Haptic on the ledger-line landing, native only, never
load-bearing.

## Reduced motion & fallback
Slot flip -> the NO-SHOW face appears with a <=100ms fade; the math line
appears complete; the ledger line appears in place; the counter swaps
directly. Stagger -> <=100ms opacity fade. No-show/fee/waive states are
always plain text + pill in the row — nothing is motion-only.
