# PulseWatch — Design Specification (v3, redline level)

## Vision
A monitor that never blinks, built for one person. Phosphor traces on black
glass — the calm authority of medical telemetry. Your services have a
heartbeat and PulseWatch watches it; an indie dev at 2am should feel watched
over, not alarmed. The only motion is information: the trace runs, or it
flatlines.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `void` | `#070B0A` | The ground. Every screen. |
| `glass` | `#0E1513` | Sheets, incident panels, status-page cards only |
| `hairline` | `#1A2420` | 1px dividers & panel borders — never brighter |
| `text` | `#DCE7E2` | Primary text |
| `text-2` | `#7C8F87` | Secondary text |
| `text-3` | `#48564F` | Faint (timestamps, placeholders) |
| `paper` | `#F0F5F2` | **Primary buttons** (void text on it) |
| `phosphor` | `#48B784` | THE accent. ≤10% of any screen: live traces, up-status dots, active tab, the 99.98% hero figure, links |
| `trace-dim` | `#1E6B4A` | Historical traces, filled uptime bars — phosphor's quiet past |
| `red` | `#FF4D5E` | Down / flatline only |
| `amber` | `#FFC24D` | Degraded / slow only |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: phosphor never fills a button or a surface; `paper` is the only
high-emphasis fill; red and amber appear only as true states. Single visual
world — no light theme; the public status page shares these exact tokens.

## Type — exact specimen

Faces: **Space Grotesk** (500/700) for display · **Inter** (400/500/600) for
body/UI · **IBM Plex Mono** (400/500) for every metric. All self-hosted woff2,
preloaded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (hero) | SG 700 | `clamp(32px, 8.5vw, 56px)` / 1.08 | −0.015em |
| Hero stat (99.98%) | IPM 500 | `clamp(36px, 10vw, 60px)` / 1.0 | −0.01em, tabular |
| H2 (screen title) | SG 700 | 22 / 1.2 | −0.01em |
| Title (monitor name) | SG 500 | 16 / 1.3 | 0 |
| Body | Inter 400 | 16 / 1.55 | 0 |
| Secondary | Inter 400 | 13 / 1.45 | 0 |
| Label | Inter 600 | 11 / 1.2 | +0.08em, uppercase |
| Data (latency, uptime, cron) | IPM 400 | 13 / 1.2 | 0, tabular figures |
| Button | Inter 600 | 15 / 1 | 0 |

Every latency, percentage, and timestamp is mono tabular, no exceptions.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **8** (controls: buttons, inputs, chips) · **12** (panels/cards) ·
  **18** (sheets). Nothing else.
- Elevation: none. Depth is `glass` vs `void` plus hairlines; only the sheet
  scrim shadows. Status lights are flat dots — no bloom, no glow.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `pulse` (monitors), `flame` (incidents), `broadcast` (status
pages), `gear` (settings), `globe` (region), `heartbeat` (cron), `lock-ssl`,
`bell`, `webhook`, `slack-hash`, `discord`, `pause`, `check`, `chevron-right`,
`plus`, `refresh`. Nav renders at 22px, inline at 18px. **No emoji, anywhere,
ever** — an outage is a red dot and the word "DOWN", not a siren glyph.

## Component construction (exact)

- **Primary button:** paper fill, void text, radius 8, height 48 mobile
  (full-width in thumb zone), Inter 600 15. Press: scale 0.98 + fill `#DFE8E3`.
  Disabled: `#22302B` fill, `text-3` text.
- **Secondary:** transparent, 1px hairline, `text`. Press: border `#27332E`.
- **Quiet action:** text-only, phosphor, no underline; press dims to 80%.
- **Input:** void fill, hairline border, radius 8, height 48, 16px text; URL
  and cron fields render in IPM. Focus: border phosphor + 2px offset ring at
  25% phosphor.
- **Chips (check type: HTTP / Cron / SSL):** height 36, radius 8, hairline;
  active = phosphor 1px border + phosphor text.
- **Monitor rows:** NO boxes. Full-bleed hairline rows ≥64px: 8px status dot
  left (phosphor steady / amber breathing 3s / red pulsing 1s), Title name,
  IPM p50/p99 ("`212ms · 480ms`"), a 60×20 live canvas sparkline right, region
  dots (3×4px) beneath. Whole row tappable.
- **Incident cards:** `glass` fill, hairline border, radius 12, a 2px red left
  rule; Title, IPM duration ("`down 4m 12s`"), channel chips.
- **Alert-channel toggles:** 44×28 track, radius 14 (pill exception for
  toggles); on = paper knob on `trace-dim` track — never phosphor-filled.
- **Uptime bars (status page):** 90 cells of 3×24px, radius 0; filled =
  `trace-dim`, incident days = red, today = phosphor. Scrolls in its own
  `overflow-x:auto` track.
- **Bottom tab bar:** height 56 + safe-area, `glass` at 94% + blur, hairline
  top. Four items, 22px icons + 10px Inter 600 labels; active = `text` + 2px
  phosphor dot; inactive = `text-3`.

## The signature — the live trace, and the flatline (kept, refined)
Each monitor row's 60px sparkline draws right-to-left in real time — canvas,
~30fps, 1.5px phosphor stroke on transparent, a few KB of points. On failure
the trace **drops to baseline and runs flat** in red while the row's left edge
shows a 2px red rule; on recovery it rejoins with one exaggerated 400ms
overshoot spike, then normalizes. Ambient proof-of-life: each real probe cycle
sends a 1px tick of phosphor at 20% opacity along the row baseline. That is
the entire brand animation — no globe, no radar. Everything else is state
feedback ≤240ms.

## Mobile layout (390×844 — primary spec)
- **Monitor wall:** gutter 20. Header: Label "ALL SYSTEMS" + SG "Steady." with
  a slow ambient trace behind at 8% phosphor. Then monitor rows with real
  content — "api.helvet.ico · `184ms · 402ms`", "nightly-backup (cron) ·
  `last ping 22m ago`", "SSL: shopfront.dev · `expires in 41d`". Primary
  button **Add monitor** pinned in the thumb zone.
- **Incident detail:** vertical hairline timeline — detection tick
  (`02:14:07`), region confirmations ("`2/3 regions`"), alerts sent (channel
  chips), acknowledge, recovery — with the response trace below, outage band
  shaded red at 10% opacity.
- **Add monitor:** one screen, sane defaults (60s interval, 3 regions, 2-fail
  threshold), URL field in IPM, primary **Start watching** in the thumb zone.
  Time-to-first-monitor under 60s is a layout requirement.
- **Public status page:** `void` ground, brand name + Label "ALL SYSTEMS
  OPERATIONAL", per-service rows with 90-day bars, incident history as
  hairline rows, "Monitored by PulseWatch" footer (free tier).

## Responsive
≥768px: monitor rows become a 2-column wall, incident timeline gains a
side-by-side trace panel, gutters 32. ≥1024px: 3-column wall, persistent left
rail replaces the tab bar, max width 1280. The marketing hero's R3F
"heartbeat wall" stays desktop-only, lazy behind a poster; on phone the hero
is one live sparkline plus "`Median detection: 11s`" in IPM. Sparklines are
canvas everywhere — never WebGL.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Status-page bars fill on scroll with 8ms
stagger. Toggles snap `spring-snappy` — no glow frame. Row status changes
crossfade 200ms. Targets ≥44px, ≥8px apart; Add-monitor and toggles in the
thumb zone. Swipe a row to pause/mute (also row overflow); pull-to-refresh
forces a re-check (also a header control). Native haptic on incident
acknowledge; web silent.

## Reduced motion & fallback
Live sparklines → static last-5-minutes image refreshed on poll. Breathing/
pulsing dots → solid states. Recovery spike → instant rejoin. The flatline is
retained as a static flat trace — it is information, not decoration. Marketing
wall → poster. Every state also reads as text ("down 42s · 2/3 regions").
