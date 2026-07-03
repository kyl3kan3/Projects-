# MailProbe — Design Specification

## Design vision
A metrology lab for email addresses. MailProbe's brand *is* epistemic honesty —
we say "unknown" when others fake certainty — so the design language is
calibration equipment: matte lab surfaces, a precision dial, evidence trails,
and a monospace soul. It should look like the instrument a standards bureau
would use; the confidence dial's needle physics must be so good it becomes the
product's mascot.

## Brand identity

| Role | Color | Hex |
|---|---|---|
| Lab slate | `#14171C` |
| Bench | `#1C2128` |
| Brand | Calibration teal | `#2DD4A8` |
| Deliverable | `#34D399` |
| Undeliverable | `#F26D6D` |
| Risky | `#F5B84D` |
| **Unknown (the honest state)** | Titanium | `#A8B2C1` — deliberately dignified, never gray-as-shame |
| Text | `#E8ECF2` / muted `#8A94A4` |

- **UI:** `Inter`; **addresses, verdicts, API everything:** `Berkeley Mono` (fallback `IBM Plex Mono`) — an email address is a specimen and always renders mono, in a specimen chip.
- **Display (marketing):** `Söhne Breit` (fallback `Archivo` expanded) — instrument-plate lettering.
- **Logo:** an envelope inside a caliper. Icon: caliper-envelope on slate.
- **Voice:** metrologist. "catch-all domain. We won't guess. Confidence: 61."

## Art direction
- Instrument-panel composition: verdict readouts in bezeled wells, screw-head details at marketing-panel corners, silkscreen small-cap labels (`SYNTAX · DNS · MX · SMTP`).
- **The four-verdict system is sacred:** each verdict has a fixed chip design (color + glyph: ✓ / ✕ / ⚠ / ◌) used identically in API docs, dashboard, CSV exports, and marketing — the ◌ open-circle for *unknown* is the brand's honesty mark, worn proudly.
- Evidence-first layouts: every verdict is expandable to its pipeline trace — nothing asserted without its checks shown.

## The signature moment — "The Assay"
Marketing hero and playground share it. An address chip (`sarah@acme.com`, mono)
is dropped into the instrument: it travels a horizontal **assay line** through
four stations — SYNTAX, DNS, MX, SMTP — each a bezeled gate that illuminates as
the chip passes (150ms dwell per station, real check semantics: a green pass-
light, or amber/red with the failing reason printed beneath in mono). Between
stations the chip glides on a light rail. At the line's end, the **confidence
dial** — a large analog gauge — winds up with true needle physics (`spring`
mass 1.4, slight overshoot and settle) to its verdict zone, and the verdict
chip stamps beside it. Then the honesty beat: the demo cycles to
`info@catchall-corp.com` — stations pass until SMTP, where the gate half-lights
and prints `catch-all detected — mailbox unverifiable`, and the needle settles
respectfully mid-dial at 61 with the titanium ◌ verdict. The hero headline
completes: "We measure. We don't guess." In the live playground the same rig
runs real verifications with real timings printed (`842ms`).

## Motion system
- **Bulk jobs:** the assay line miniaturizes into a throughput view — chips streaming through at rate, a mono counter (`12,481 / 50,000 · 214/s`), verdict tallies filling four bins; completion prints a results-file chip that slides into the downloads tray.
- **API key management:** keys render as etched tags; reveal = character-resolve left to right; rotation physically swaps the tag with a machined slide (240ms).
- **Dashboard verdict distribution:** four horizontal gauge bars grow on load (`ease-out-expo`, 500ms, staggered 60ms); the unknown bar is *never visually minimized* — equal height, titanium fill.
- **Webhook log:** deliveries as stamped receipts; failures show retry countdowns as small winding dials.
- **Docs code samples:** language tabs flip with a machined click; the "run it" cell executes against the live playground and prints the response with a measured line-by-line reveal (30ms).

## Key screens
1. **Marketing hero:** The Assay, center; beneath, the pricing table etched as an instrument spec plate (per-check price in large mono), then the accuracy-methodology section with our public benchmark — including the honest-unknown rates — typeset as a lab report.
2. **Playground (money screen):** single-address assay rig + a bulk drop zone; every run shows timing and the full evidence trace expandable per station.
3. **Dashboard:** usage burette, verdict distribution gauges, per-key breakdown table, abuse-status indicator (a quiet green "within tolerances" lamp).
4. **Docs:** bench-styled, sticky assay-line diagram that highlights the station relevant to the current section as you scroll.

## Component language
- Buttons: 6px radius, calibration teal with slate text; destructive = red-outline with hold-to-confirm dial fill.
- Specimen chips: mono address in a bezeled well with the verdict glyph docked right.
- Cards: bench panels, 1px `#2A313C` borders, silkscreen labels.
- Empty state: an empty specimen tray: "Drop an address in. Watch the assay."

## Reduced motion & fallback
Assay travel → stations light simultaneously with the trace listed. Needle physics → needle set at value with a 120ms sweep. Streaming bulk view → counter + progress bar. Character-resolve → instant reveal. Every animated verdict also printed as text the moment it exists.
