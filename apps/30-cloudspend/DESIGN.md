# CloudSpend — Design Specification (v3, redline level)

## Vision
CloudSpend watches an engineer's cloud bill so they don't have to — the moment
that matters is a Slack alert at the wrong hour naming the deploy that did it.
A dark observatory: night-sky ground, money as tabular mono telemetry,
paper-filled actions, one rationed cyan, and a signature that draws the
deploy-correlation thesis literally.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `night` | `#0C111C` | The ground. Every screen |
| `panel` | `#141B2B` | Chart frames, alert cards, sheets only |
| `hairline` | `#232C40` | 1px dividers & card borders — never brighter |
| `text` | `#E8EDF7` | Primary text |
| `text-2` | `#8794AD` | Secondary text |
| `text-3` | `#57627A` | Faint (axis labels, placeholders) |
| `paper` | `#F1F4F9` | **Primary buttons** (night text), key numerals |
| `cyan` | `#38BDF8` | THE accent. ≤10% of any screen: brand mark, now-line, active tab dot, links, focus rings |
| `steel` | `#4A5C85` | Chart series fill/stroke (data, not accent) |
| `amber` | `#FFB020` | Anomaly flare + open-anomaly state only |
| `green` | `#34D399` | Resolved / savings only |

Hard rules: `paper` is the only high-emphasis fill; `cyan` never fills a
button, a surface, or a chart series; amber/green appear only where they mean
anomaly or recovery.

## Type — exact specimen

Faces: **Geist** (400/500/600) for UI · **Geist Mono** (500) for every dollar
figure, delta, timestamp, and deploy hash. Both self-hosted woff2, preloaded.
No display face — the numerals are the display.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (MTD figure) | Geist Mono 500 | `clamp(32px, 8.5vw, 48px)` / 1.05 | −0.01em, tabular |
| H2 (screen title) | Geist 600 | 22 / 1.15 | 0 |
| Title (row/card) | Geist 600 | 16 / 1.3 | 0 |
| Body | Geist 400 | 16 / 1.55 | 0 |
| Secondary | Geist 400 | 13 / 1.45 | 0 |
| Label | Geist 600 | 11 / 1.2 | +0.08em, uppercase |
| Data (deltas, hashes) | Geist Mono 500 | 13 / 1.2 | 0, tabular figures |
| Button | Geist 600 | 15 / 1 | 0 |

Money always mono, always tabular: `$12,483.07`, `+$342/DAY`, `9f3c2ab`.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **8** (buttons, inputs, chips) · **12** (alert cards, chart frames) ·
  **20** (sheets). Nothing else.
- Elevation: none. Depth is `panel` on `night` plus hairlines; sheets alone get
  a scrim.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `pulse` (spend), `flare` (anomalies: dot + 4 short rays),
`rocket-pennant` (deploys: flag on a mast), `broom` (waste), `chevron-down`
(account switcher), `check` (ack), `magnifier` (investigate), `bell`, `plug`
(add account), `slack-hash`, `arrow-down-right` (savings), `clock`. Nav at
22px, inline at 18px. **No emoji, anywhere, ever** — including inside Slack
messages: severity is a Label + figure, never a siren or fire emoji.

## Component construction (exact)

- **Primary button:** `paper` fill, `night` text, radius 8, height 48
  (full-width in thumb zone). Press: scale 0.98 + fill `#DFE5EE`. Disabled:
  `#222B3F` fill, `text-3` text.
- **Secondary:** transparent, 1px hairline, `text`. Press: border `#2E3952`.
- **Quiet action:** text-only `cyan`, no underline; press dims to 80%.
- **MTD block:** NOT a card — the top of the page itself. `MONTH TO DATE`
  Label, `$12,483.07` Display numeral in `paper`, second line mono
  (`FORECAST $19,940 · +8% VS JUNE`) in `text-2`.
- **Spend chart:** `panel` frame, radius 12, padding 16; area series in `steel`
  at 35% fill / 100% 1.5px stroke; dashed 1px `text-3` baseline ghost; the
  now-line is 1px `cyan`. Deploy pennants: 10px flags on 1px masts along the
  axis; tap raises a plumb-line + metadata chip (`9f3c2ab · api-server ·
  TUE 14:02`).
- **Anomaly card:** `panel`, hairline, radius 12, padding 16: Label state
  (`OPEN` amber · `ACKED` `text-2` · `RESOLVED` green), Title ("EC2 —
  us-east-1"), delta in mono 20 (`+$342/DAY`), correlated deploy row in mono,
  48×16 trend thumbnail in `steel`, and a full-width Ack primary.
- **Burn-rate meter (budgets):** 4px track `hairline`, fill `steel` (amber
  past 80%), mono caption (`$3,120 OF $4,000 · RESETS IN 9D`).
- **Waste rows:** NO boxes. Hairline rows, dollar-ranked: mono figure left
  (`$611/MO`), Title ("8 unattached EBS volumes"), one-line remedy in
  Secondary ("Delete or snapshot; last attached 47d ago"), `check` action.
- **Bottom tab bar:** height 56 + safe-area, `panel` 94% + blur, hairline top:
  pulse / flare / rocket-pennant / broom at 22px + 10px labels; active =
  `text` + 2px `cyan` dot; inactive = `text-3`.

## The Slack alert card (co-flagship, Block Kit — exact)
Mirrored pixel-for-pixel in-app. Blocks, in order:
1. `header`: `Cost anomaly — EC2 in us-east-1`.
2. `section` with two `fields`: `*Delta*\n+$342/day vs baseline` ·
   `*Since*\nTue 14:00 UTC (9h)`; `accessory`: 300×80 trend image (steel
   series, dashed baseline, amber flare dot at the peak — server-rendered PNG,
   2x).
3. `section`: `*Probable cause*\nDeploy \`9f3c2ab\` of \`api-server\`, 2h
   before onset` (deploy hash links to the commit).
4. `context`: `CloudSpend · acct 4821-prod · <View in dashboard>` — no emoji,
   no image icons.
5. `actions`: button `Ack` (default styling, never `danger`), button
   `Investigate` (anomaly-detail deep link).
Ack updates the message in place: header prefixed `Acked —`, actions replaced
by context `Acked by @dana 11:42 UTC`. The in-app Ack button matches exactly.

## The signature — the flare + survey line
When an anomaly opens on the chart: the service's series rises above its
dashed baseline ghost; a single amber flare (6px dot, one 1.5px expanding ring
1→2.2× over 900ms `ease-out-quart`, two pulses max) marks the peak; then a 1px
amber survey line draws down from the flare to the correlated deploy pennant
in 400ms `ease-in-out-soft`, and the excess area between series and baseline
tints amber at 18%. Ack: pulsing stops, flare settles to a steady 4px lamp.
Resolve: the excess region sweeps `green` at 25% once (600ms) and the card
files to history. Pure SVG stroke/opacity — phone-size, 60fps, no WebGL. This
is the entire brand animation.

## Mobile layout (390 × 844 — primary spec)
- **The Watch (dashboard, money screen):** top bar: account switcher
  (`4821-prod` mono + chevron), `flare` badge with count. MTD block, spend
  chart (14-day window) with deploy pennants, then the open-anomaly rail —
  flares first: the EC2 card above, then "NAT Gateway — egress +$88/day".
  Empty state: "Connect your first AWS account — read-only, 5 minutes." over
  a `plug` glyph, primary "Add account".
- **Anomaly detail:** zoomed chart window with the full signature; contributor
  strata as hairline rows (`i-09f3… g4dn.xlarge · +$212/DAY`); deploy metadata
  in mono; live counter (`$127 SINCE TUE 14:00`); action log rows (`ACKED BY
  DANA · 11:42`). Thumb-zone: Ack primary, Investigate secondary.
- **Waste report ("the roast"):** recoverable total in Display mono
  (`$1,847/MO RECOVERABLE`) that rolls down as items are actioned; then the
  dollar-ranked rows ("3 idle g4dn GPU instances — $438/mo", "Stale snapshots
  older than 180d — $196/mo"). The monthly email reuses this layout statically.
- **Deploys:** vertical list of pennant rows (`9f3c2ab · api-server · TUE
  14:02 · +$342/DAY CORRELATED`), hairline-divided, GitHub link per row.

## Responsive
≥768px: chart grows, anomaly rail docks right, gutters 32. ≥1024px: full
area chart with layered service strata, deploys as a strip beneath, budgets
as altitude lines; max content 1200. Optional desktop enhancement: a WebGL
"rising range" terrain on the marketing hero only (≤400KB, ≤40k tris, lazy,
poster fallback) — never in the app bundle, never on mobile.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Chart draws left-to-right on load (800ms,
`ease-out-quart`), once per session. Pennants stick in (120ms). Forecast
morphs 400ms `ease-in-out-soft` — never jumpy. Tapping a chart point raises a
plumb-line with strata chips. Swipe-to-ack on anomaly cards, Ack button always
present. Targets ≥44px; push + haptic on a new anomaly (native).

## Reduced motion & fallback
Chart draw → instant, plumb-lines intact. Flare → steady lamp, no rings.
Survey line + tint → shown complete. Aurora sweep → a green `RESOLVED` chip.
Counter → updates stepwise. Marketing WebGL → poster of the flare-and-survey
moment. Every correlation and figure is always present as a text row beneath
the chart. All motion collapses to ≤100ms opacity; nothing is motion-only.
