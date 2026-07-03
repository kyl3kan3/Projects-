# MailProbe — Design Specification

## Vision
MailProbe is a developer API whose brand is epistemic honesty — it says "unknown"
when the rest of the industry fakes certainty. The design reads like calibrated lab
equipment: matte surfaces, a monospace soul, evidence trails, and one dignified
titanium mark for the honest state. Docs and playground must be fully usable on a
phone; the dashboard is a real mobile surface, not a shrunk desktop grid.

## Mobile layout (390 × 844)
- **Nav:** a top bar with the caliper-envelope mark and a menu; primary sections (Playground
  · Docs · Dashboard · Keys) in a bottom tab bar. Docs use a collapsible section drawer,
  not a persistent sidebar.
- **Hero (Playground):** a single **specimen chip** input at the top — a mono address in a
  bezeled well — with a full-width **Verify** button directly beneath, in the thumb zone.
  The result appears as a **verdict card**: the four-state chip (✓ deliverable / ✕
  undeliverable / ⚠ risky / ◌ unknown), a confidence number in large mono, and real
  timing (`842ms`). Tap the card to expand its evidence trace.
- **Evidence trace:** the four checks (SYNTAX · DNS · MX · SMTP) stack as a vertical list
  of pass/fail rows with reasons in mono — this replaces the horizontal "assay line" on
  phone, where a wide rig would never fit.
- **Key components at phone width:** code samples scroll inside their own `overflow-x:auto`
  block with a copy button; bulk upload is a full-width drop/attach zone; dashboard gauges
  stack vertically.

## Identity
| Role | Name | Hex |
|---|---|---|
| Lab slate | `#14171C` |
| Bench (panel) | `#1C2128` |
| Calibration teal (brand/CTA) | `#2DD4A8` |
| Deliverable | `#34D399` |
| Undeliverable / Risky | `#F26D6D` / `#F5B84D` |
| Unknown (titanium — the honest state) | `#A8B2C1` |

Text `#E8ECF2`, muted `#8A94A4`.

- **Type:** **Inter** for UI/prose (≥16px mobile); **IBM Plex Mono** for every address,
  verdict, key, and API value — an email is a specimen and always renders mono in a chip;
  marketing headings in **Archivo** (expanded) for instrument-plate lettering.
- **Signature detail — the confidence dial + the ◌ mark:** each verdict resolves a compact
  **confidence gauge** with true needle physics (`spring`, mass 1.4, slight overshoot,
  settle) to its zone — small enough to sit inside the verdict card on a phone at 60fps.
  The four-verdict chip system is sacred and identical across API, dashboard, CSV, and
  docs; the ◌ open-circle for *unknown* is worn proudly and never visually minimized.
- Evidence-first: no verdict is asserted without its checks one tap away.

## Responsive
The stacked mobile playground expands on `lg` into the horizontal **assay line** — the
specimen chip travels through four bezeled station gates that light as it passes, ending
at a larger analog confidence dial. Docs gain a sticky station diagram that tracks the
current section. **Optional desktop enhancement:** the animated traveling-chip assay as
marketing hero — lazy, pointer surface, with the stacked evidence list as its complete
mobile/reduced-motion equivalent.

## Motion & touch
- Dashboard verdict distribution: four horizontal bars grow on load (`ease-out-quart`,
  staggered 60ms); the unknown bar is equal height, titanium fill — never minimized.
- Bulk jobs: a mono counter streams (`12,481 / 50,000 · 214/s`) filling four verdict bins;
  completion drops a results-file chip into a downloads tray.
- Targets ≥44px. Destructive actions (key rotation) use hold-to-confirm. Copy buttons on
  every code cell and address give a light haptic on native. Docs language tabs switch with
  a machined click.

## Key screens
1. **Playground (money screen, mobile-first):** specimen input → verdict card → expandable
   evidence, plus a bulk drop zone. Every run prints real timing.
2. **Docs:** bench-styled, collapsible sections, runnable code cells that execute against
   the live playground and print the response line-by-line.
3. **Dashboard:** usage meter, the four verdict-distribution gauges, per-key table, and a
   quiet "within tolerances" abuse-status lamp — all stacking cleanly on a phone.
4. **Marketing hero:** the Assay (desktop) / stacked evidence (mobile) with the headline
   "We measure. We don't guess."; pricing etched as a spec plate with per-check price in
   large mono; the public accuracy benchmark typeset as a lab report.

## Reduced-motion & fallback
Assay travel → all stations shown at once with the trace listed. Needle → set at value
with a 120ms sweep. Bulk stream → counter + progress bar. Character-resolve on keys →
instant. Every animated verdict is also printed as text the moment it exists. Motion
collapses to ≤100ms opacity.
