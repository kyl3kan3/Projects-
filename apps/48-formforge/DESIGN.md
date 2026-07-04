# FormForge — Design Specification (v3, redline level)

## Vision
A well-run clinic front desk: warm paper, unhurried type, nothing flashing.
FormForge commits to a single light world — PHI deserves daylight, not a dark
dashboard — with ink-filled buttons, one rationed clinic teal, and an audit
trail that renders like a stamped ledger. The patient side reads like a calm
printed packet that happens to fill itself in.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `linen` | `#F7F6F1` | The ground. Every screen (warm clinical paper) |
| `chart` | `#FFFFFF` | Sheets, the patient packet card, grouped panels only |
| `hairline` | `#E4E1D6` | 1px dividers & panel borders — never darker |
| `ink` | `#1D2628` | Primary text AND **primary buttons** (linen text on ink) |
| `ink-2` | `#5C6B6D` | Secondary text |
| `ink-3` | `#95A0A0` | Faint (timestamps, placeholders, helper text) |
| `teal` | `#33808A` | THE accent. ≤10% of any screen: brand mark, active states, links, focus rings, progress, the audit stamp |
| `moss` | `#4C8A5F` | Signed / completed only |
| `clay` | `#BC5B4A` | Overdue / error only |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: `ink` is the only high-emphasis fill (light-ground rule); `teal`
never fills a button or a surface; `moss`/`clay` appear only where they mean
signed or overdue. This app deliberately ships light-only — a single visual
world chosen for clinical trust, per DESIGN_LANGUAGE.md theming clause.

## Type — exact specimen

Faces: **Public Sans** (400/500/600) for display and UI · **IBM Plex Mono**
(500) for every timestamp, hash, score, and audit entry. Both self-hosted
woff2, preloaded. Public Sans is the US-government civic face — earned trust,
zero fashion.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (marketing / packet title) | PS 600 | `clamp(30px, 8vw, 48px)` / 1.1 | −0.015em |
| H2 (screen title) | PS 600 | 22 / 1.2 | −0.01em |
| Title (row, block heading) | PS 600 | 16 / 1.3 | 0 |
| Body / patient questions | PS 400 | 17 / 1.6 | 0 |
| Secondary | PS 400 | 13 / 1.45 | 0 |
| Label | PS 600 | 11 / 1.2 | +0.08em, uppercase |
| Data (audit, scores, hashes) | IPM 500 | 13 / 1.4 | 0, tabular figures |
| Button | PS 600 | 15 / 1 | 0 |

Patient-side body runs 17px — packets are read by stressed people on phones.
Screener scores are mono (`PHQ-9 · 14 · MODERATE`); hashes truncate to 12
chars with full value on tap.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **8** (buttons, inputs, chips) · **12** (panels, block cards) ·
  **20** (sheets). Nothing else.
- Elevation: none. Depth is `chart` on `linen` plus hairlines; only the sheet
  scrim shadows.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `inbox-tray` (intakes), `blocks` (builder: three stacked
rects), `patients` (two heads), `ledger` (audit: ruled page), `gear`
(settings), `signature` (pen nib + line), `shield-check` (compliance),
`bell` (reminder), `download` (export), `send`, `check`, `chevron-right`,
`plus`, `clock`. Nav renders at 22px, inline at 18px. **No emoji, anywhere,
ever** — a completed packet gets `check` in moss, not a celebration.

## Component construction (exact)

- **Primary button:** `ink` fill, `linen` text, radius 8, height 48 mobile
  (full-width in thumb zone). Press: scale 0.98 + fill `#313B3D`. Disabled:
  `#D8D5CA` fill, `ink-3` text.
- **Secondary:** transparent, 1px hairline, `ink`. Press: border `#CFCBBE`.
- **Quiet action:** text-only `teal`, no underline; press dims to 80%.
- **Input:** `chart` fill, hairline border, radius 8, height 48, 17px text.
  Focus: border `teal` + 2px offset ring at 25% teal. Patient-side inputs
  get 12px labels above, never floating placeholders.
- **Status pill:** height 28, 6px dot + Label(11): `ink-3` "SENT", `teal`
  "STARTED", `moss` "SIGNED", `clay` "OVERDUE".
- **Intake rows (status board):** NO boxes. Full-bleed rows ≥56px, hairline
  between: status dot left, Title(16) patient name, Secondary form name +
  clinician, mono age right (`4d` in `ink-3`; overdue in `clay`).
- **Block card (builder):** `chart`, hairline, radius 12, padding 16, drag
  handle ≥44px: Label kind ("SCREENER · PHQ-9"), Title question preview,
  mono config summary ("9 items · auto-scored"). A 2px teal insertion
  hairline shows drop position. Never nested in another card.
- **Consent block (patient):** the consent text set in Body on `chart` with
  a hairline frame (this is a truly framed object), then the signature
  area: 1px hairline signature line, typed/drawn toggle chips (height 36,
  radius 8), and the disclosure sentence in Secondary above the sign action.
- **Progress (patient):** a 2px `teal` bar under the packet header plus
  mono step counter (`SECTION 3 OF 6`) — no percentage rings.
- **Audit rows:** mono-first: `14:02:11 · VIEWED · packet — Dana R. (front
  desk) · 73.92.1.8`, 13px IPM, hairline-divided, verb in `ink` 600, rest
  `ink-2`. Filter chips above (Views / Edits / Exports / Sends).
- **Bottom tab bar (practice app):** height 56 + safe-area, `chart` at 96% +
  blur, hairline top. Four items — inbox-tray / blocks / patients / ledger —
  22px icons + 10px PS 600 labels; active = `ink` + 2px teal dot; inactive =
  `ink-3`.

## The signature — the audit stamp
When a patient signs, the signature (typed name set in the drawn-style, or
the actual drawn stroke) replays as an SVG stroke over 600ms
`ease-out-quart`; on settle, the evidence line stamps in beneath it — one
row, mono 13: `SIGNED · JUL 4 2026 · 14:02 UTC · SHA-256 9F3C…2AB1` — sliding
up 8px with `spring-gentle`, and a 1.5px teal underline sweeps beneath the
row in 240ms, then fades over 400ms. The same stamp motion marks new rows
landing on the practice's audit screen (rate-limited to one per 5s). This is
the entire brand animation; everything else is state feedback ≤240ms.

## Mobile layout (390 × 844 — primary spec)
- **Intakes (practice home):** gutter 20. Top: practice name + Label
  completion stat (`92% COMPLETION · 30D`). Status chip row (All / Awaiting /
  Signed / Overdue), then intake rows newest-first. Primary button **Send
  intake** pinned above the safe-area; sheet: patient picker + form picker +
  channel toggles.
- **Patient packet (`/intake/[token]`):** no chrome but a small practice
  wordmark, the progress bar, and one section per screen. Blocks stack
  single-column; save-and-resume note in Secondary at top ("Your answers
  save automatically"). Consent + signature per the component spec; final
  screen: moss `check`, "You're all set — Dr. Osei has your packet," no
  app upsell.
- **Builder:** block list as cards with drag handles; tapping a block opens
  its config sheet (radius 20). Add-block sheet lists structured kinds with
  Secondary descriptions. **Publish** primary pinned; publishing shows the
  mono version stamp (`V4 · JUL 4`).
- **Audit:** filter chips + the mono ledger rows; per-patient scope via
  search. Export quiet action top-right (audit-logs itself, visibly — the
  export appears as the newest row).

## Responsive
≥768px: status board gains columns (form, clinician, last reminder), builder
becomes two-pane (block list + live phone-width preview), gutters 32.
≥1024px: left rail replaces the tab bar; the builder preview stays phone-width
— the packet is always seen as patients see it; max content width 1120
centered. No desktop spectacle.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Intake rows enter with 24ms stagger, opacity
+ 4px y-slide. Patient sections advance with a 200ms `ease-in-out-soft`
horizontal slide (16px), previous section exits at 0.6x. Chips crossfade
150ms. Signature replay per the signature spec. Targets ≥44px, ≥8px apart;
destructive actions (delete patient, revoke link) are hold-to-confirm
(600ms radial fill). Pull-to-refresh on the status board. Haptics native
wrappers only, never load-bearing.

## Reduced motion & fallback
Signature replay → the completed signature fades in over 100ms with the
evidence row already present. Stamp slide + teal sweep → 100ms opacity fade.
Section slides → crossfade ≤100ms. Progress bar updates discretely. Every
state (signed, overdue, exported) is always plain text + pill, never
motion-only. The patient flow is fully functional with JavaScript-light
progressive enhancement — server-rendered forms post per section.
