# Dunly — Design Specification (v3, redline level)

## Vision
A Swiss-bank ledger, not a confetti cannon. Dunly shows founders money returning
that was walking out the door, stated in figures you can trust. Calm graphite,
mono numerals, and one rationed banknote green that appears only where a dollar actually
came back. Nothing decorative moves; the number moving *is* the product.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `graphite` | `#101315` | The ground. Every dark screen. |
| `carbon` | `#181D20` | Sheets, grouped stat panels, sequence step cards only |
| `hairline` | `#232A2E` | 1px dividers & panel borders — never brighter |
| `text` | `#EDF1F0` | Primary text |
| `text-2` | `#8FA099` | Secondary text |
| `text-3` | `#5A6660` | Faint (timestamps, placeholders) |
| `paper` | `#F2F5F4` | **Primary buttons** (graphite text on it), hero numerals |
| `banknote` | `#33A06F` | THE accent. ≤10% of any screen: recovered figures, the `$` glyph, active states, links, the settle sweep |
| `amber` | `#F5B84D` | At-risk / in-dunning states only |
| `red` | `#F0655A` | Failed / churned only |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: banknote never fills a button or a surface; `paper` is the only
high-emphasis fill; amber/red appear only where they mean risk or loss. No
glows anywhere — recovered money gets the underline sweep, not light. The
day-one light theme swaps ground to `#F7F9F8`, text to `#181D20`, hairline to
`#E3E8E5`; primary buttons there are **ink** (`#181D20`) fill with paper text.

## Type — exact specimen

Faces: **Instrument Sans** (400/500/600) for display and UI · **IBM Plex Mono**
(500/600) for every figure. Both self-hosted woff2, preloaded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (marketing hero) | IS 600 | `clamp(32px, 8.5vw, 56px)` / 1.08 | −0.015em |
| Hero stat (Recovered) | IPM 600 | `clamp(40px, 11vw, 64px)` / 1.0 | −0.01em, tabular; cents 60% size |
| H2 (screen title) | IS 600 | 22 / 1.2 | −0.01em |
| Title (row) | IS 600 | 16 / 1.3 | 0 |
| Body | IS 400 | 16 / 1.55 | 0 |
| Secondary | IS 400 | 13 / 1.45 | 0 |
| Label | IS 600 | 11 / 1.2 | +0.08em, uppercase |
| Data / money | IPM 500 | 13 / 1.2 | 0, tabular figures |
| Button | IS 600 | 15 / 1 | 0 |

All money is mono tabular, always. The `$` on recovered figures is `banknote`;
everywhere else it inherits text color.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **10** (controls: buttons, inputs, chips) · **14** (panels/stat groups) ·
  **20** (sheets). Nothing else.
- Elevation: none. Depth is `carbon` vs `graphite` plus hairlines. Only the
  sheet scrim shadows.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `gauge` (overview), `hourglass` (at-risk), `list-steps`
(sequences), `gear` (settings), `arrow-down-left` (recovered event), `refresh`
(retry), `mail`, `message-sms`, `pause`, `play`, `download` (export), `card`,
`check`, `chevron-right`, `plus`. Nav renders at 22px, inline at 18px.
**No emoji, anywhere, ever** — recovery events get `arrow-down-left`, not a
party popper.

## Component construction (exact)

- **Primary button:** paper fill, graphite text, radius 10, height 48 mobile
  (full-width in thumb zone), IS 600 15. Press: scale 0.98 + fill `#E1E7E4`.
  Disabled: `#2A3236` fill, `text-3` text.
- **Secondary:** transparent, 1px hairline, `text`. Press: border `#2F383D`.
- **Quiet action:** text-only, banknote, no underline; press dims to 80%.
- **Input:** graphite fill, hairline border, radius 10, height 48, 16px text.
  Focus: border banknote + 2px offset ring at 25% banknote.
- **Chips (period filter: 7d / 30d / 90d):** height 36, radius 10, hairline;
  active = banknote 1px border + banknote text.
- **Stat block:** Label(11) over IPM value — no box, no accent bar. Grouped
  stats may share one `carbon` panel (radius 14, padding 16), never nested.
- **At-risk rows:** NO boxes. Full-bleed rows ≥56px, 16px vertical padding,
  hairline between: Title(16) customer, mono amount right, Secondary retry
  countdown ("retry #3 in 2d 4h") in `text-3`, amber 6px status dot left.
- **Retry timeline:** horizontal node strip in its own `overflow-x:auto` track;
  nodes 10px circles — banknote filled = succeeded, amber ring = scheduled, red =
  failed — joined by 1px hairline connectors, mono dates beneath.
- **Status pill:** height 28, 6px dot + Label(11): amber "IN DUNNING", banknote
  "RECOVERED", red "CHURNED".
- **Bottom tab bar:** height 56 + safe-area, `carbon` at 94% + blur, hairline
  top. Four items at 22px icons + 10px IS 600 labels; active = `text` + 2px
  banknote dot; inactive = `text-3`.

## The signature — the return tick (kept, refined)
When an invoice recovers, the headline Recovered figure odometer-rolls upward:
digits roll vertically with `spring-gentle`, ≤600ms total, and on settle a
1.5px banknote underline sweeps left→right beneath the figure in 240ms
`ease-out-quart`, then fades over 400ms. Rate-limited to one roll per 5s;
simultaneous recoveries batch into one roll. The feed row lands with
`arrow-down-left` in banknote. This is the entire brand animation — no glow, no
confetti, no coin physics. Everything else is state feedback ≤240ms.

## Mobile layout (390×844 — primary spec)
- **Overview:** gutter 20. Top row: brand mark + period chip row. Hero stat:
  Label "RECOVERED THIS PERIOD" over `$4,213.88` (mono, `$` banknote). Two stat
  rows beneath: "At risk `$1,860.00`" (amber dot) · "In recovery `14 invoices`".
  Then Label "ACTIVITY" and the live feed as hairline rows, newest first —
  "Acme Design · `$49.00` · recovered via retry #2 · `08:42`". Primary button
  **Export ROI statement** pinned above the safe-area.
- **At-risk:** hairline rows with countdowns and inline retry timelines; swipe
  left reveals **Pause retries** (also in row overflow). Pause is
  hold-to-confirm: a 600ms radial fill on the button.
- **ROI statement:** fine stationery on a phone — paper-light page, hairline
  rules, IPM figures, closing line "Dunly recovered `$4,213` — 28× your
  subscription." One-tap PDF export.
- **Sequence editor:** step cards (`carbon`, radius 14, drag handle ≥44px):
  Label kind ("EMAIL · DAY 3"), subject line in Title, mono send stats
  ("41% open · 12% click"). A 2px banknote insertion hairline shows drop position.
- **First run:** full-width **Connect Stripe** primary button in the thumb
  zone; above it, a 90-day recovery preview panel with real math
  ("We'd have recovered ≈ `$1,912` last quarter").

## Responsive
≥768px: stat blocks form a top band of three (Recovered at 2× size), tables
gain columns (attribution, method), gutters 32. ≥1024px: left rail replaces
the tab bar; center becomes active-sequence swim-lanes; right rail is the live
feed; max content width 1120 centered. No desktop spectacle — the odometer is
the signature at every size.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. At-risk rows enter with 24ms stagger, opacity
+ 4px x-slide only — finance tables never bounce. Retry node success: 300ms
radial wipe to banknote; failure crossfades to amber and draws the connector to
the next node in 240ms. Chips crossfade 150ms. Targets ≥44px, ≥8px apart;
destructive actions hold-to-confirm (600ms); pull-to-refresh re-syncs Stripe
(also a header control). Haptics on native only, never load-bearing.

## Reduced motion & fallback
Odometer → direct number swap with a single 100ms banknote underline fade. Radial
wipes and sweeps → instant state change. Stagger → ≤100ms opacity fade. Every
animated signal (recovered, failed, at-risk) is also plain text in the row.
