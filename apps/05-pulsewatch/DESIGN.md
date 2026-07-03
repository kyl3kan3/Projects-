# PulseWatch — Design Specification

## Design vision
A night-shift operations room built for one person. Phosphor traces on black glass,
the calm authority of medical telemetry: your services have a heartbeat and
PulseWatch is the monitor that never blinks. The design lives on the line between
mission-critical and cozy — an indie dev at 2am should feel *watched over*, not
alarmed.

## Brand identity

| Role | Color | Hex |
|---|---|---|
| Void | True black-green | `#070B0A` |
| Glass panel | `#0E1513` |
| Brand | Phosphor green | `#3DFFA2` |
| Trace dim | `#1E6B4A` |
| Alert | Flatline red | `#FF4D5E` |
| Degraded | Amber | `#FFC24D` |
| Text | `#DCE7E2` / muted `#7C8F87` |

- **Display & UI:** `Space Grotesk` — technical but warm.
- **Everything telemetric** (latencies, uptimes, timestamps): `IBM Plex Mono`. The 99.98% figure is typographic hero material — huge, mono, phosphor.
- **Logo:** "pulsewatch" lowercase mono; the "l" is an ECG spike. Favicon animates a 2px heartbeat (respecting reduced-motion).
- **Voice:** steady operator. "api.acme.dev — down 42s. Two regions confirm. On it."

## Art direction
- CRT sensibility, executed tastefully: traces have a 1px core + 6px phosphor bloom (`box-shadow`/canvas glow); a barely-there scanline texture (3% opacity) on marketing only.
- Data-ink discipline: no gridlines except a 20%-opacity baseline; charts are traces, not areas.
- Status is a **light language**: green steady, amber breathing (3s), red pulsing (1s) — a wall of monitors readable from across the room.

## The signature moment — "The Heartbeat Wall"
Marketing hero: a 3D wall of monitor tiles (R3F, instanced planes with emissive
shader) receding in slight perspective, each tile running a live ECG trace. One
tile flatlines — its trace drops, the tile pulses red, and a probe network
visualization fires: three points of light race from Sydney/Frankfurt/Virginia
across a dark mini-globe arc toward the tile (confirmations), then a Slack-style
alert card materializes in the foreground with the incident already opened:
"Down 8s. 3/3 regions. Alerted you before your users noticed." The tile recovers,
trace resumes, wall breathes on. 20s loop, mouse parallax ±4°.

## Motion system
- **Live traces** everywhere: each monitor row has a 60px sparkline drawing right-to-left in real time (canvas, 30fps, cheap).
- **Incident open:** the row flatlines — the sparkline literally drops to baseline and runs flat — while the row's left edge ignites red. This single metaphor carries the whole product.
- **Recovery:** the trace *jumps* back with one exaggerated spike (400ms overshoot) then normalizes; the row edge fades green over 2s.
- **Check pulses:** on each real probe cycle, a 1px tick of light travels the row's baseline (ambient proof-of-life, 20% opacity).
- **Status page (public):** the 90-day uptime bars fill on scroll with 8ms stagger — 90 tiny satisfying ticks.

## Key screens
1. **Marketing hero:** Heartbeat Wall full-bleed; single stat beneath: "Median detection: 11 seconds." Pricing table styled as rack units.
2. **Monitor wall (core):** dense rows — status light, name, live sparkline, p50/p99 mono figures, region dots; header carries the global "All systems: steady" line with a slow ambient trace behind it.
3. **Money screen — Incident view:** vertical timeline of the incident: detection tick (with the three region confirmations fanning in), alerts sent (channel chips), acknowledgment, recovery spike; below, the response-time trace across the window with the outage band shaded red at 10%.

## Component language
- Buttons: mono-labeled, 6px radius, phosphor outline; primary fills phosphor with void text. Hover = bloom intensifies.
- Cards/tiles: glass panels with 1px `#1C2A24` border; incident cards get the red edge-light.
- Empty state: a single trace drawing across the void: "No monitors yet. Give us a URL to watch."
- Alert config: channel toggles snap with `spring-snappy` and emit a one-frame glow of their channel color.

## Reduced motion & fallback
Wall → poster frame. Live sparklines → static last-5-min images refreshed on poll. Pulsing lights → solid color states. Flatline metaphor retained as a static flat trace (it's informational, not decorative).
