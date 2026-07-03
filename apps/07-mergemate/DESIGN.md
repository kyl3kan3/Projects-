# MergeMate — Design Specification

## Vision
A senior engineer's desk lamp at midnight: dark editor chrome, syntax-color accents,
quiet competence. MergeMate should feel like it was designed *by* the tools developers
already trust — GitHub-native restraint — with one personality trait: surgical
precision. Every finding looks placed with tweezers, never sprayed from a hose. Silence
is a feature.

## Mobile layout (390 × 844 — the primary spec)
Developers triage review notifications from their phone — a finding lands, they open it,
read the defect, accept the patch or dismiss it. The phone is the read-and-decide
surface; deep config lives on desktop but must be legible here.

- **Nav:** bottom tab bar — Reviews · Repos · Rulebook · Account — above the safe-area
  inset. Violet on the active item only.
- **Findings feed (core):** a single scrolling column of finding cards, one per issue,
  never a wall. Each card: `file:line` in mono, rule chip, a **5-segment confidence
  bar** (segments below threshold render as empty sockets — low-noise is *visible*),
  the one-line defect, and a suggested-patch diff in a recessed well.
- **Primary action** in the thumb zone: full-width **Apply patch** and a secondary
  **Dismiss** on each finding; a per-PR **Approve review** bar when clear.
- **PR summary:** one card at top — "This PR: 2 findings" or "Passed clean" — expandable.
  A clean PR shows a single violet node and "That's the point."
- **Key components at phone width:** finding card (1px `#30363D` border, violet 2px
  left rule); confidence sockets; rule chip; noise-ratio sparkline on the dashboard;
  `.mergemate.yml` viewer (read-focused on phone, horizontal scroll in its own track).

## Identity
| Role | Hex |
|---|---|
| Editor black | `#0D1117` |
| Panel | `#161B22` |
| Merge violet | `#A371F7` |
| Diff green (additions) | `#3FB950` |
| Diff red (deletions) | `#F85149` |
| PR blue (info) | `#58A6FF` |
| Text | `#E6EDF3` / muted `#8B949E` |

- **UI/text:** `Inter`, 16px min on mobile. **Data/mono:** `JetBrains Mono`, ligatures
  off (diff fidelity beats prettiness), for all code, diffs, and rule IDs.
- GitHub-adjacent surfaces so devs feel at home instantly, with violet as the single
  signature: focus rings, the merge-node motif, finding markers.
- **Signature detail — the confidence meter.** A small horizontal 5-segment bar beside
  every finding, filling left→right (60ms each) with the last segment landing hard
  (`spring-snappy`) when confidence is high. Below-threshold findings show *empty
  sockets* — the low-noise stance made literally visible. It's the whole product
  philosophy in one 60fps component; no scan-field, no time-dilation, no WebGL.

## Responsive
The phone's single-column findings feed becomes a two-pane view on desktop (feed +
finding detail with full diff context) and the rulebook editor gains a live-preview
pane ("which findings this config would have raised on the last 5 PRs"). The dashboard's
noise-ratio graph widens. **Optional desktop-only enhancement:** the marketing hero's
"gauntlet" (a diff scrolling through a violet scan-field, catching the occasional line)
may use a 2D/WebGL hybrid, lazy-loaded behind a static poster of one caught line; it
never loads on mobile, where the hero is a static poster plus a real PR screenshot with
exactly two comments (the restraint demo).

## Motion & touch
- Shared tokens. Finding cards enter with `spring-gentle` from 8px below, **one at a
  time** — even the animation argues restraint.
- Suggested-patch apply: red lines compress out, green lines expand in (height
  auto-animate, 240ms `ease-in-out-soft`), then a violet check-run tick draws (300ms
  stroke).
- Rulebook toggle: a mono `on/off` split-flap tile; the example-finding preview
  crossfades (150ms).
- **Touch:** targets ≥44px; Apply/Dismiss in the thumb zone.
- **Gestures:** swipe a finding card to dismiss — it collapses to a 24px receipt line
  ("dismissed — won't repeat this pattern") that fades to 60% (also a Dismiss button).
  Native haptic on apply in the mobile client; web silent.

## Key screens (mobile-first)
1. **Findings feed:** PR summary card + one card per finding, confidence sockets,
   Apply/Dismiss.
2. **Finding detail:** defect, evidence, suggested patch, the exact rule + rulebook
   version that fired.
3. **Rulebook:** `.mergemate.yml` viewer with per-rule on/off; desktop adds live
   preview.
4. **Noise dashboard:** noise-ratio trending down over weeks — the graph a champion
   screenshots for their lead.

## Reduced-motion & fallback
Confidence fill → instant segment state. Patch apply animation → instant diff swap.
Split-flaps → text swap. Stroke-drawn checks → instant checkmark. Card entrances →
≤100ms fade. Hero gauntlet → static caught-line poster. Confidence and dismissal
states are always stated in text, never motion-only.
