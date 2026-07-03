# MailProbe — Design Specification (v3, redline level)

## Vision
MailProbe is a developer API whose brand is epistemic honesty — it says
"unknown" when the industry fakes certainty. The design reads like calibrated
lab equipment in a dark room: matte slate, a monospace soul, evidence one tap
away, paper-filled actions, and the titanium ◌ of the honest state worn
proudly. Docs, playground, and dashboard are real phone surfaces.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `slate` | `#14171C` | The ground. Every screen |
| `bench` | `#1B2027` | Verdict cards, code blocks, sheets only |
| `hairline` | `#262C36` | 1px dividers & card borders — never brighter |
| `text` | `#E8ECF2` | Primary text |
| `text-2` | `#8A94A4` | Secondary text |
| `text-3` | `#5A6372` | Faint (placeholders, footnotes) |
| `paper` | `#F2F4F7` | **Primary buttons** (slate text), key numerals |
| `teal` | `#35A483` | THE accent. ≤10% of any screen: brand mark, links, active tab dot, focus rings, live-request lamp |
| `green` | `#34D399` | DELIVERABLE verdict only |
| `red` | `#F26D6D` | UNDELIVERABLE verdict only |
| `amber` | `#F5B84D` | RISKY verdict only |
| `titanium` | `#A8B2C1` | UNKNOWN verdict only — never dimmed below the other three |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: `paper` is the only high-emphasis fill; `teal` never fills a button
or a surface; verdict colors appear ONLY inside verdict constructions (chips,
bars, trace rows) — never as decoration.

## Type — exact specimen

Faces: **Archivo** (600, SemiExpanded) for display · **Inter** (400/500/600)
for UI · **IBM Plex Mono** (400/500) for every address, verdict, key, price,
and API value. All self-hosted woff2, preloaded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (marketing) | Archivo 600 | `clamp(32px, 8.5vw, 56px)` / 1.08 | −0.01em |
| H2 (screen title) | Archivo 600 | 22 / 1.15 | 0 |
| Title (row/card) | Inter 600 | 16 / 1.3 | 0 |
| Body / docs prose | Inter 400 | 16 / 1.55 | 0 |
| Secondary | Inter 400 | 13 / 1.45 | 0 |
| Label | Inter 600 | 11 / 1.2 | +0.08em, uppercase |
| Specimen (address) | IBM Plex Mono 500 | 15 / 1.3 | 0 |
| Data (confidence, timing) | IBM Plex Mono 500 | 13 / 1.2 | 0, tabular figures |
| Confidence numeral | IBM Plex Mono 500 | 40 / 1 | 0, tabular figures |
| Code | IBM Plex Mono 400 | 13 / 1.6 | 0 |
| Button | Inter 600 | 15 / 1 | 0 |

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **8** (buttons, inputs, chips, code blocks) · **12** (verdict cards,
  panels) · **20** (sheets). Nothing else.
- Elevation: none. Depth is `bench` on `slate` plus hairlines; sheets alone
  get a scrim.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `flask` (playground), `book` (docs), `gauge` (dashboard),
`key`, `chevron-down` (trace expand), `copy`, `upload` (bulk), `webhook`,
`rotate` (key rotation), `shield` (abuse lamp), plus the four **verdict
glyphs** below. Nav at 22px, inline at 18px. **No emoji, anywhere, ever.**

**Verdict glyphs (constructed, 20×20, stroke 1.75, round caps):**
- `verdict-check` — polyline `4,11 8.5,15.5 16,5.5`, `green`.
- `verdict-cross` — lines `5,5→15,15` and `15,5→5,15`, `red`.
- `verdict-risk` — triangle `10,3 18,17 2,17` round-joined + 1.75 stem
  `10,9→10,12.5` + dot at `10,15`, `amber`.
- `verdict-unknown` — the ◌: circle cx10 cy10 r7, stroke only, no fill, with a
  2.5px gap at 45° (an open, honest circle), `titanium`.

## Component construction (exact)

- **Primary button:** `paper` fill, `slate` text, radius 8, height 48
  (full-width in thumb zone). Press: scale 0.98 + fill `#E1E5EB`. Disabled:
  `#2A313C` fill, `text-3` text.
- **Secondary:** transparent, 1px hairline, `text`. Press: border `#333B48`.
- **Quiet action:** text-only `teal`, no underline; press dims to 80%.
- **Specimen well:** `bench` fill, hairline border, radius 8, height 52, mono
  15 text, `text-3` placeholder `name@company.com`. Focus: `teal` border + 2px
  offset ring at 25% teal. An address is a specimen: always mono, everywhere.
- **Verdict chip (sacred, identical across API/dashboard/CSV/docs):** height
  28, radius 8, `bench` fill, 1px border in the verdict color at 60%; verdict
  glyph 14px + Label in the verdict color: `DELIVERABLE` · `UNDELIVERABLE` ·
  `RISKY` · `UNKNOWN`. The unknown chip is identical in size and weight.
- **Verdict card:** `bench`, hairline, radius 12, padding 16: specimen mono on
  top, verdict chip, confidence numeral 40 in `paper` with `CONFIDENCE` Label,
  timing right-aligned mono (`842 MS`), `chevron-down` to expand the trace.
- **Evidence trace rows:** NO boxes. Hairline rows inside the card: Label left
  (`SYNTAX` · `DNS` · `MX` · `SMTP`), result mono right (`PASS · MX 2
  RECORDS`), row glyph 14px in verdict color.
- **Code block:** `bench`, radius 8, mono 13, own `overflow-x:auto`, 44px copy
  button top-right; language tabs as chips (active = teal text + 1px border).
- **Distribution bars (dashboard):** four horizontal bars, 8px tall, radius 8,
  chip + mono count labels (`DELIVERABLE 8,412` · `UNKNOWN 1,207`); the
  titanium bar is full-height, never minimized.
- **Bottom tab bar:** height 56 + safe-area, `bench` 94% + blur, hairline top:
  flask / book / gauge / key at 22px + 10px labels; active = `text` + 2px teal
  dot; inactive = `text-3`.

## The signature — the confidence gauge + the ◌
Each verdict resolves a 72px analog gauge inside the verdict card: a 270° arc
track in `hairline`, a 1.75px `paper` needle springing to the score (stiffness
210, damping 26 — one slight overshoot, settle ≈700ms), ticks at 25/50/75 in
`text-3`, numeral counting up in sync; the arc tip lights in the verdict color
after settle (120ms fade). For UNKNOWN the needle parks at the true confidence
and the ◌ draws its 315° stroke over 300ms `ease-out-quart` beside it —
honesty gets the flourish. SVG transform + opacity, 60fps on any phone. This
is the entire brand animation.

## Mobile layout (390 × 844 — primary spec)
- **Playground (money screen):** gutter 20. Specimen well + full-width
  "Verify" primary beneath, in the thumb zone. Result: the verdict card —
  `jane@acmecorp.com` → DELIVERABLE chip, gauge to `97`, `312 MS`; trace
  `SYNTAX PASS · RFC 5322`, `DNS PASS`, `MX PASS · ASPMX.L.GOOGLE.COM`,
  `SMTP PASS · MAILBOX EXISTS`. Second run: `ops@corvid-labs.io` → ◌ UNKNOWN
  at `61`, trace ending `SMTP NO ANSWER · CATCH-ALL DOMAIN`. Below: bulk drop
  zone (dashed hairline, radius 12, `upload` 24px) — "Drop a CSV · up to 1M
  rows".
- **Docs:** collapsible section drawer, prose at 16, runnable code cells that
  hit the live playground and print the JSON response line-by-line in mono;
  the first cell is the one-line curl.
- **Dashboard:** usage meter (mono `41,208 / 75,000`), the four distribution
  bars, per-key hairline rows (`pk_live_…9f2c`, `rotate` behind
  hold-to-confirm), abuse lamp: `shield` + `WITHIN TOLERANCES` + 6px teal dot.
- **Marketing hero:** the stacked trace playing once + "We measure. We don't
  guess." in Archivo; pricing as a spec plate — hairline rows, per-check price
  in large mono (`$0.006 / VERIFICATION`), breaks at 50K/250K/1M; the public
  accuracy benchmark typeset as a lab report table.

## Responsive
≥1024px: the playground expands into the horizontal **assay line** — the
specimen chip passes four bezeled station gates (SYNTAX → DNS → MX → SMTP)
that light as checks complete, ending at a 120px gauge; docs go two-pane
(prose left, code right). Optional desktop enhancement: the animated
traveling-chip assay as the marketing hero — lazy, pointer surface; the
stacked trace is its complete mobile equivalent.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Trace rows print top-down, 60ms stagger, as
real checks complete — never faked faster than the API. Distribution bars grow
on load (`ease-out-quart`, 60ms stagger). Bulk jobs stream a mono counter
(`12,481 / 50,000 · 214/S`) into four verdict bins; completion drops a results
chip into the downloads tray. Targets ≥44px; key rotation is hold-to-confirm
(600ms ring fill); copy gives a light haptic on native.

## Reduced motion & fallback
Gauge → needle set at value with a 120ms sweep; numeral printed immediately.
◌ draw → shown complete. Trace stagger, bar growth, counter stream → instant
values + a plain progress bar. Every animated verdict is also printed as text
the moment it exists. All motion collapses to ≤100ms opacity.
