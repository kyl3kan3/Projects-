# Dunly — Design Specification

## Vision
Dunly hands recovered revenue back to founders, so the design is calm, numeric, and
quietly triumphant — a Swiss-bank ledger, not a confetti cannon. The one emotion it
sells is the visible *return* of money that was walking out the door, stated in
figures you can trust.

## Mobile layout (390 × 844 — the primary spec)
Founders check recovery on their phone the way they check MRR — a quick glance, often
first thing. The phone view is a one-screen answer to "is it working?"

- **Nav:** bottom tab bar, 4 items — Overview · At-risk · Sequences · Settings —
  above the home indicator. Solid, no glow.
- **Overview / landing:** the top third is the single number that matters —
  **Recovered this period**, huge in mono tabular, dollar sign in Recovery green.
  Beneath it, two smaller stat rows (At risk · In recovery). Below the fold: a live
  activity feed of recovery events, newest first.
- **Primary action** in the thumb zone: on the empty/first-run state a full-width
  **Connect Stripe** button; once connected, a bottom-anchored **Export ROI
  statement** button on the Overview.
- **Key components at phone width:** stat block (label small-caps, value mono, no
  decoration); at-risk payment row (customer, amount, retry countdown — opacity +
  4px slide on enter, never bouncy); retry timeline as a compact horizontal node
  strip inside its own `overflow-x:auto` track; sequence card (drag handle ≥44px).
- Charts on phone are single thin traces (1.5px), no gridlines, one label at each end
  — legible one-handed, never a dashboard crammed sideways.

## Identity
| Role | Hex |
|---|---|
| Base graphite | `#101315` |
| Panel carbon | `#181D20` |
| Recovery green | `#2FD07E` |
| Bank green (deep) | `#0E8C52` |
| Dunning amber | `#F5B84D` |
| Churn red | `#F0655A` |
| Text | `#EDF1F0` / muted `#8FA099` |

- **Display/text:** `Söhne` (fallback `Instrument Sans`), medium — banking-grade
  neutrality; body ≥16px on mobile.
- **Data/mono:** `Söhne Mono` tabular for all money; cents at 60% size; the `$` always
  Recovery green. Numerals are the brand.
- **Signature detail — the return tick.** Every recovered dollar rolls the headline
  counter upward: an odometer digit roll (`spring-gentle`, ≤600ms) with a brief green
  underline sweep on settle. Rate-limited to one animation per 5s, batched otherwise.
  Green glow is reserved *exclusively* for recovered money — nothing else in the
  product glows. That restraint is the identity; no coin-physics, no 3D field.

## Responsive
The phone's stacked stat blocks become a top band of three (Recovered 2× size) on
tablet, and on desktop (≥1024px) add a center "recovery river" of active sequences as
swim-lanes plus a right-rail live feed. Tables gain columns progressively; on phone
they stay a two-line row. A **light theme ships day one** (`#F7F9F8` base, carbon
text) for CFO demos — equal care both themes, driven by CSS custom properties.
**Optional desktop enhancement:** none beyond the swim-lane river; no 3D. The number
is the hero at every size.

## Motion & touch
- Shared tokens throughout. At-risk rows enter with 24ms stagger, opacity + 4px
  x-slide, no y-movement (finance tables don't bounce).
- Retry node: success flips green with a 300ms radial wipe; failure crossfades to
  amber and draws the connector to the next attempt (240ms left→right).
- **Touch:** targets ≥44px, ≥8px apart. Destructive actions (pause dunning) use
  hold-to-confirm — a 600ms radial fill — reachable by thumb.
- **Gestures:** swipe an at-risk row to reveal "Pause retries" (also in row overflow
  menu); pull-to-refresh re-syncs Stripe (also a header refresh control). Web haptics
  where available, never load-bearing.

## Key screens (mobile-first)
1. **Overview:** giant Recovered figure, two sub-stats, live feed, Export button
   pinned bottom.
2. **At-risk:** list of payments in a sequence, each with retry countdown and a
   compact timeline; swipe to pause.
3. **ROI statement:** a bank-statement-styled page — hairlines, mono figures, closing
   line "Dunly recovered $X — 41× your subscription." One-tap export to PDF; this
   page is the retention weapon and must look like fine stationery on a phone.
4. **Sequence editor:** reorderable email/SMS step cards with a green insertion
   hairline on drag.

## Reduced-motion & fallback
Counter roll → direct number swap with a single green flash. Retry radial wipes →
instant state change. Row stagger → ≤100ms opacity fade. Timeline pulses → static
state dots. Every animated signal (recovered, failed, at-risk) is also plain text.
