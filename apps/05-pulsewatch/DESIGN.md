# PulseWatch — Design Specification

## Vision
A monitor that never blinks, built for one person. Phosphor traces on black glass,
the calm authority of medical telemetry: your services have a heartbeat and PulseWatch
watches it. The feeling sits between mission-critical and cozy — an indie dev at 2am
should feel watched over, not alarmed.

## Mobile layout (390 × 844 — the primary spec)
The core interaction is a glance: something broke, or nothing did. Indie devs get the
alert on their phone and open the app one-handed to triage, so the phone is where the
product has to be perfect.

- **Nav:** bottom tab bar — Monitors · Incidents · Status pages · Settings — above the
  safe-area inset. Mono labels.
- **Monitor wall (core):** a single scrolling column of monitor rows. Each row:
  **status light** (left), name, a 60px live sparkline, p50/p99 in mono, region dots.
  A header line reads the global state — "All systems: steady" — with a slow ambient
  trace behind it. Status is a light language: green steady, amber breathing (3s), red
  pulsing (1s), readable at a glance.
- **Primary action** in the thumb zone: a full-width **Add monitor** button pinned
  bottom (time-to-first-monitor under 60s is a product goal — the form is one screen).
- **Incident detail:** a vertical timeline — detection tick, region confirmations,
  alerts sent (channel chips), acknowledgment, recovery — with the response-time trace
  below and the outage band shaded red at 10%.
- **Key components at phone width:** monitor row (self-contained, tappable ≥44px);
  incident card (red edge-light); alert-channel toggles; the public status page in a
  clean light-on-dark read, 90-day uptime bars scrollable in their own track.

## Identity
| Role | Hex |
|---|---|
| Void (black-green) | `#070B0A` |
| Glass panel | `#0E1513` |
| Phosphor green | `#3DFFA2` |
| Trace dim | `#1E6B4A` |
| Flatline red | `#FF4D5E` |
| Degraded amber | `#FFC24D` |
| Text | `#DCE7E2` / muted `#7C8F87` |

- **Display/UI:** `Space Grotesk` — technical but warm; body ≥16px on mobile.
- **Data/mono:** `IBM Plex Mono` for every latency, uptime, timestamp. The 99.98%
  figure is typographic hero material — large, mono, phosphor.
- **Signature detail — the live trace, and the flatline.** Each monitor row runs a
  60px sparkline drawing right-to-left in real time (canvas, ~30fps, a few KB). When a
  monitor fails, its sparkline literally **drops to baseline and runs flat** while the
  row's left edge ignites red; on recovery the trace jumps back with one exaggerated
  spike (400ms overshoot) then normalizes. This single, informational metaphor carries
  the whole product — no 3D globe, no perspective wall on the phone.

## Responsive
The phone's single column of rows becomes a denser multi-column wall on desktop, and
the incident timeline gains a side-by-side trace panel. The public status page scales
from a phone-width card to a wide grid. **Optional desktop-only enhancement:** the
marketing hero's "heartbeat wall" (a receding grid of tiles with a probe-network
confirmation animation) may use R3F, lazy-loaded behind a static poster; it never
loads on mobile, where the hero is a single live sparkline on the void with the stat
"Median detection: 11 seconds." Live sparklines are canvas, not WebGL — they run
everywhere.

## Motion & touch
- Shared tokens. Ambient check-pulse: on each real probe cycle a 1px tick of light
  travels the row baseline (20% opacity) — quiet proof-of-life, not decoration.
- Status-page uptime bars fill on scroll with 8ms stagger.
- Alert-channel toggles snap with `spring-snappy` and emit a one-frame glow of the
  channel's color.
- **Touch:** targets ≥44px, ≥8px apart; Add-monitor and channel toggles in the thumb
  zone.
- **Gestures:** swipe a monitor row to pause/mute (also in row overflow); pull-to-
  refresh forces a re-check (also a header control). Native haptic on incident
  acknowledge in the mobile client; web silent.

## Key screens (mobile-first)
1. **Monitor wall:** global-state header, scrolling rows with live traces, Add button
   bottom.
2. **Incident view:** detection → confirmations → alerts → recovery timeline with the
   outage band.
3. **Add monitor:** one-screen form, sane defaults, big Save in the thumb zone.
4. **Public status page:** phosphor-clean, 90-day bars, incident history, "monitored
   by PulseWatch" footer on free tier.

## Reduced-motion & fallback
Live sparklines → static last-5-min images refreshed on poll. Pulsing/breathing status
→ solid color states. Recovery spike → instant. The flatline is *retained as a static
flat trace* — it's information, not decoration. Marketing wall → poster frame. Every
state has a text equivalent ("down 42s · 2/3 regions").
