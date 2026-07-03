# CloudSpend — Design Specification

## Vision
CloudSpend watches an engineer's cloud bill so they don't have to — and the moment
that matters happens on a phone: a Slack anomaly alert at the wrong hour, telling
you which deploy did it. So the two flagship surfaces are the **Slack alert card**
and a **mobile dashboard** an on-call engineer can actually read. Calm night-watch
palette, money as telemetry in tabular mono, no theme-park terrain scene.

## Mobile layout (390 × 844)
- **Nav:** top bar with account switcher and the anomaly-count badge; bottom tab bar
  (Spend · Anomalies · Deploys · Waste). The dashboard is a vertical stack, not a wide
  terrain canvas.
- **Hero (dashboard):** top card is **month-to-date + forecast** in large tabular mono with
  a delta vs last month. Below it, a **spend sparkline / small area chart** sized to phone
  width, with deploy markers as tick pennants along the time axis (tap a pennant for its
  metadata). Then the **open-anomalies rail** as full-width cards, flares first.
- **Slack alert card (co-flagship):** designed for Slack Block Kit and mirrored in-app — a
  compact card with the service and region, the dollar delta in mono (`+$340/day`), the
  correlated deploy hash and time, a small trend thumbnail, and an **Ack** button that
  renders identically in Slack and in-app (muscle memory across surfaces).
- **Primary action:** on an anomaly, a full-width **Ack** / **Investigate** button sits in
  the thumb zone; the dashboard's primary action is **Add account** when empty.
- **Key components at phone width:** budgets show as a burn-rate meter, not altitude lines;
  waste findings are a dollar-ranked list with one-line remedies; wide tables scroll inside
  their own `overflow-x:auto` frame.

## Identity
| Role | Name | Hex |
|---|---|---|
| Night sky | `#0C111C` |
| Panel | `#141B2B` |
| Watch cyan (brand/CTA/now-line) | `#38BDF8` |
| Spend steel blue | `#3B4A6B` |
| Anomaly flare amber | `#FFB020` |
| Savings aurora green | `#34D399` |

Text `#E8EDF7`, muted `#8794AD`.

- **Type:** **Geist** (Inter fallback) for UI/body (≥16px mobile); **Geist Mono** tabular
  for all money, deltas, and deploy hashes — a cloud bill is telemetry. Small-caps labels
  on stat blocks.
- **Signature detail — the flare + survey line:** when an anomaly opens, the offending
  service's spark rises above its faint dashed baseline ghost, a single amber flare pulses
  at the peak, and a thin survey line drops from the flare to the correlated deploy pennant
  — the deploy-correlation thesis drawn literally, in a 2D chart, at phone size and 60fps
  (no WebGL). Ack settles the flare to a steady lamp; resolve sweeps the excess region
  aurora-green once. This is the whole signature — a data reveal, not a landscape.
- Ack buttons are pixel-identical in Slack and app.

## Responsive
The stacked mobile dashboard widens on `lg`: the spend chart grows into a full terrain-grammar
area chart with layered service strata, the anomaly rail docks right, deploys run as a strip
beneath, and budgets render as altitude lines on the chart. **Optional desktop enhancement:**
a WebGL "rising range" terrain on the marketing hero only (≤40k tris, lazy, poster fallback) —
never in the app bundle, never on mobile; the 2D chart is the complete everywhere-else story.

## Motion & touch
- Dashboard chart draws left-to-right on load (800ms, `ease-out-quart`); tapping a point
  raises a plumb-line with cost breakdown as strata chips. Deploy pennants stick in (120ms).
- Anomaly lifecycle: open = one flare pulse + card in the rail; ack = stamp press, pulse
  stops; resolve = green sweep, card files to history.
- Forecast morphs gently (400ms `ease-in-out-soft`) when new data lands — never jumpy.
- Targets ≥44px. Ack is a large button (also swipe-to-ack on a card, with the button as
  equivalent). Push/haptic on a new anomaly (native + Slack).

## Key screens
1. **The Watch (dashboard, money screen, mobile-first):** MTD + forecast, spend chart with
   deploy pennants, open-anomaly rail — the stacked layout above.
2. **Slack alert card (co-flagship):** the Block Kit card and its in-app twin, spec'd
   pixel-for-pixel; the primary place many users meet CloudSpend.
3. **Anomaly detail:** zoomed chart window around the event, contributor strata, the
   correlated deploy's metadata, a live cost-since-start counter, and the action log.
4. **Waste report ("the roast"):** dollar-ranked findings with one-line remedies and a
   recoverable-total that rolls down as items are actioned; the monthly email shares this
   design in static form.

## Reduced-motion & fallback
Chart draw → instant, plumb-lines on tap intact. Flare pulse → steady lamp. Forecast morph
→ stepped update. Aurora sweep → a green badge. Marketing WebGL → poster of the flare-and-
survey moment. Every correlation and figure is always present as a text row beneath the
chart. Motion collapses to ≤100ms opacity.
