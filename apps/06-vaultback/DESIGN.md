# VaultBack — Design Specification (v3, redline level)

## Vision
Backup assurance for people who deliberately chose not to run servers.
VaultBack reads as precision-engineered steel — machined surfaces, deep
shadows, brass only on the parts that lock — and communicates one promise:
your data is safe *and verified*. Green is earned by a passing checksum, never
by an attempt. Industrial calm, zero whimsy.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `gunmetal` | `#0F1214` | The ground. Every screen. |
| `steel` | `#191E22` | Sheets, drill-report panels, pipeline strip only |
| `hairline` | `#252C31` | 1px dividers & panel borders — never brighter |
| `text` | `#E9EDF0` | Primary text |
| `text-2` | `#8A96A0` | Secondary text |
| `text-3` | `#525C64` | Faint (timestamps, placeholders) |
| `paper` | `#F1F4F6` | **Primary buttons** (gunmetal text on it), key figures |
| `brass` | `#D9A441` | THE accent. ≤10% of any screen: active tab, the key-turn, lock glyphs, links, pipeline progress |
| `seal` | `#4CC38A` | Verified states ONLY — a backup is never green until its checksum passes |
| `torch` | `#E5534B` | Failed / destructive only |

Hard rules: brass never fills a button or a surface — it marks the things that
lock; `paper` is the only high-emphasis fill; `seal` is a semantic earned by
verification, not a decoration. The design enforces the product's honesty.

## Type — exact specimen

Faces: **Archivo** (500/600/700) for display and UI · **IBM Plex Mono**
(400/500) for the artifacts of proof. All self-hosted woff2, preloaded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (hero) | Archivo 700 | `clamp(32px, 8.5vw, 56px)` / 1.08 | −0.015em |
| H2 (screen title) | Archivo 600 | 22 / 1.2 | −0.01em |
| Title (database name) | Archivo 600 | 16 / 1.3 | 0 |
| Body | Archivo 400 | 16 / 1.55 | 0 |
| Secondary | Archivo 400 | 13 / 1.45 | 0 |
| Label | Archivo 600 | 11 / 1.2 | +0.08em, uppercase |
| Data (checksums, sizes, cron) | IPM 400 | 13 / 1.2 | 0, tabular figures |
| Button | Archivo 600 | 15 / 1 | 0 |

Checksums, byte sizes, timestamps, and cron expressions are always mono —
they are the evidence the product sells.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **6** (controls: buttons, inputs, chips — tight, machined) · **10**
  (panels/cards) · **16** (sheets). Nothing else. The chamfered-corner motif
  survives only in the brand seal glyph, not on components.
- Elevation: none. Depth is `steel` vs `gunmetal` plus hairlines; only the
  sheet scrim shadows.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `vault` (dial-door), `restore` (counterclockwise arrow),
`drill` (target-check), `gear` (settings), `database`, `key`, `lock`,
`shield-check` (verified seal), `bucket` (S3/R2), `bolt-slide` (two offset
bars), `clock`, `download`, `check`, `alert-triangle`, `chevron-right`,
`plus`. Nav renders at 22px, inline at 18px. **No emoji, anywhere, ever** — a
verified backup gets `shield-check` in seal green, not a padlock emoji.

## Component construction (exact)

- **Primary button:** paper fill, gunmetal text, radius 6, height 48 mobile
  (full-width in thumb zone), Archivo 600 15. Press: scale 0.98 + fill
  `#E0E6E9`. Disabled: `#2A3238` fill, `text-3` text.
- **Secondary:** transparent, 1px hairline, `text`. Press: border `#333C42`.
- **Quiet action:** text-only, brass, no underline; press dims to 80%.
- **Input:** gunmetal fill, hairline border, radius 6, height 48, 16px text;
  connection strings render in IPM 13 with a masked middle. Focus: border
  brass + 2px offset ring at 25% brass.
- **Chips (frequency: Hourly / Daily):** height 36, radius 6, hairline;
  active = brass 1px border + brass text.
- **Database rows:** NO boxes. Full-bleed hairline rows ≥64px: provider glyph
  18px, Title name, IPM last-backup age ("`52m ago · 1.2 GB`"), and the
  verified seal right — `shield-check` in seal green only after checksum pass;
  pending shows a hollow `text-3` outline.
- **Snapshot rows:** hairline rows: IPM timestamp ("`2026-07-03 04:00 UTC`"),
  size, truncated checksum ("`sha256:9f3c…a41d`"); selected = 2px brass left
  rule.
- **Drill report cards:** only these are framed — `steel` fill, hairline
  border, radius 10, padding 16: Label "RESTORE DRILL · `JUN 29`", pass/fail
  pill, IPM table counts ("`214,882 rows · 41 tables · match`").
- **Pipeline strip:** five labeled stations (DUMP → COMPRESS → ENCRYPT →
  UPLOAD → VERIFY) as Label(11) over 8px nodes joined by hairlines, in its own
  `overflow-x:auto` track; the active leg fills brass, completed nodes seal.
- **Status pill:** height 28, 6px dot + Label: seal "VERIFIED", brass
  "RUNNING", torch "FAILED", `text-3` "SCHEDULED".
- **Bottom tab bar:** height 56 + safe-area, `steel` at 94% + blur, hairline
  top. Four items (Vault · Restore · Drills · Settings), 22px icons + 10px
  labels; active = `text` + 2px brass dot; inactive = `text-3`.

## The signature — the checksum lock (kept, refined)
When a backup verifies, its checksum line scrambles — mono characters cycling
for 300ms — then locks in character-by-character left→right over 400ms
(`ease-out-quart`, ~24 glyphs), ending with `shield-check` drawing in seal
green (150ms stroke). Simultaneously the row's bolt glyph slides 24px right in
200ms `ease-in-out-soft`. Textual, mono, honest — it reads as proof, runs at
60fps on any phone, needs no 3D. Everything else is state feedback ≤240ms.

## Mobile layout (390×844 — primary spec)
- **Vault dashboard:** gutter 20. Header Label "COVERAGE" + Archivo line
  "3 of 3 databases verified this week." Database rows with real content —
  "prod-supabase · `52m ago · 1.2 GB`", "neon-analytics · `4h ago · 310 MB`",
  "railway-queue · `1d ago · 88 MB`". During a run the pipeline strip appears
  under the active row. Empty state: primary **Connect a database** in the
  thumb zone over a plain-language promise, no illustration theater.
- **Restore (money screen):** snapshot rows top; selecting one opens a
  plain-language impact panel ("Restores into a NEW database. Nothing is
  overwritten. Target: connection string you provide."); then the **key-turn
  confirm** in the thumb zone — a 48px-high control where a brass key glyph
  drags 90° to arm (button fallback: press-and-hold 900ms with a radial ring).
- **Drill report:** report card + IPM evidence block; footer note "This
  evidence feeds your compliance PDF."
- **Connect database:** one screen — connection-string input (IPM, masked),
  provider auto-detect chip appearing inline ("SUPABASE — pooler detected"),
  reachability/permissions checklist as hairline rows with seal ticks.

## Responsive
≥768px: database rows become a table (adds size sparkline and retention
columns), gutters 32. ≥1024px: left rail replaces the tab bar; Restore
becomes two panes (snapshots · impact); max width 1200. The marketing hero's
R3F vault door stays desktop-only, lazy behind a sealed-door poster; on phone
the hero is that poster plus a blueprint-style pipeline schematic in hairlines.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Pipeline: 2px brass dashes travel the active
leg (1.2s loop, the one permitted ambient motion, running only during a real
backup). Retention pruning: expired rows compress to 0 height 240ms
`ease-in-out-soft`, storage meter rebalances `spring-gentle`. Drill pass: key
glyph rotates 90° `spring-snappy`, report unfolds beneath 320ms. Targets
≥44px; key-turn and Run-backup in the thumb zone. Swipe a row for quick
actions (also overflow). Destructive delete is hold-to-confirm: 900ms radial
ring, releasing early rewinds. Native haptics on verify and key-turn; web
silent.

## Reduced motion & fallback
Checksum scramble → direct text swap ending on the seal tick. Pipeline dashes
→ static schematic with stage checkmarks. Key-turn → plain press-and-hold
progress ring. Row compression → instant removal. Vault-door hero → sealed
poster. Every state (verified, running, failed, pruned) is also plain text.
