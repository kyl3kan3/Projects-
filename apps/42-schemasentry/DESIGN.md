# SchemaSentry — Design Specification (v3, redline level)

## Vision
A code-review terminal with a conscience. SchemaSentry lives where engineers
already read diffs, so it looks like the best diff they've ever read: carbon
ground, mono type doing the talking, one break-red that appears only where a
consumer would feel it. The selling moment is a red line striking through a
removed field — everything else stays out of the way.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `carbon` | `#121417` | The ground. Every screen — a single dark world |
| `panel` | `#191C21` | Diff frames, finding cards, sheets only |
| `hairline` | `#262B33` | 1px dividers & frame borders — never brighter |
| `text` | `#E9ECEF` | Primary text |
| `text-2` | `#8B94A1` | Secondary text, meta |
| `text-3` | `#586170` | Faint (timestamps, line numbers) |
| `paper` | `#F2F4F6` | **Primary buttons** (carbon text), key verdict numerals |
| `break` | `#B54834` | THE accent. ≤10% of any screen: brand mark, BREAKING findings, the strike-draw, active states, links, focus rings |
| `amber` | `#C99038` | RISKY findings only |
| `green` | `#4E9B6F` | COMPATIBLE / check-passed only |
| `diffdim` | `#3A4250` | Diff syntax chrome (pointers, brackets) — data, not accent |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: `paper` is the only high-emphasis fill; break never fills a
button or a surface — the accent and the breaking semantic are one
deliberately unified meaning (it appears only where its meaning is true).
Amber/green carry risky/compatible only. No glows; a passing check is a
green word, not a celebration.

## Type — exact specimen

Faces: **Manrope** (400/600/700) for UI · **JetBrains Mono** (400/600) for
every pointer path, endpoint, verdict, version label, and diff line. Both
self-hosted woff2, preloaded. The mono is the voice of the product.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (verdict stamp) | JBM 600 | `clamp(28px, 8vw, 40px)` / 1.05 | +0.02em, uppercase |
| H2 (screen title) | Manrope 700 | 22 / 1.15 | −0.01em |
| Title (row/card) | Manrope 600 | 16 / 1.3 | 0 |
| Body | Manrope 400 | 16 / 1.55 | 0 |
| Secondary | Manrope 400 | 13 / 1.45 | 0 |
| Label | Manrope 600 | 11 / 1.2 | +0.08em, uppercase |
| Data (pointers, versions) | JBM 400 | 13 / 1.5 | 0, tabular figures |
| Diff line | JBM 400 | 13 / 1.6 | 0 |
| Button | Manrope 700 | 15 / 1 | 0 |

Endpoints and pointers always mono: `POST /v1/orders`,
`#/components/schemas/Order/properties/status`, `9f3c2ab → 4d81e07`.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **8** (controls: buttons, inputs, chips) · **12** (diff frames,
  finding cards) · **20** (sheets). Nothing else.
- Elevation: none. Depth is `panel` on `carbon` plus hairlines; sheets alone
  get a scrim.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `timeline`, `diff` (two offset brackets), `consumers`
(three nodes on a line), `scroll` (changelog), `shield-check`, `shield-x`,
`pointer` (hash-arrow), `ack` (check in a speech outline), `slack-hash`,
`branch`, `tag`, `copy`, `rss`, `plus`, `chevron-right`, `key`. Nav at 22px,
inline at 18px. **No emoji, anywhere, ever** — including Slack messages and
PR comments: verdicts are Labels + figures, never sirens or warning signs.

## Component construction (exact)

- **Primary button:** `paper` fill, `carbon` text, radius 8, height 48
  (full-width in thumb zone on mobile), Manrope 700 15. Press: scale 0.98 +
  fill `#DFE3E8`. Disabled: `#242A33` fill, `text-3` text.
- **Secondary:** transparent, 1px hairline, `text`. Press: border `#313845`.
- **Quiet action:** text-only break, no underline; press dims to 80%.
- **Input:** `carbon` fill, hairline border, radius 8, height 48, 16px text.
  Focus: border break + 2px offset ring at 25% break.
- **Chips (env / verdict filters):** height 36, radius 8, hairline; active =
  break 1px border + break text. Never filled.
- **Verdict stamp:** NOT a card — the top of the diff screen itself. Label
  `DEPLOY 4d81e07 VS 9f3c2ab`, then `BREAKING` (break) / `RISKY` (amber) /
  `COMPATIBLE` (green) in Display JBM, then mono counts
  (`2 BREAKING · 3 RISKY · 11 COMPATIBLE`) in `text-2`.
- **Finding card:** `panel`, radius 12, padding 16: level Label (6px dot +
  `BREAKING`), Title reason ("Removed enum value `cancelled`"), mono pointer
  path in `diffdim` (tap to copy), the mini-diff (below), consumer impact
  row ("Breaks: Acme webhooks · iOS app"), and an `ack` quiet action.
- **Mini-diff:** inside finding cards, 2-6 mono lines in the card's own
  `overflow-x:auto` track: removed lines prefixed `-` in break at 90%, added
  `+` in green at 90%, context `text-2`, line numbers `text-3`. Never a
  full-file dump — the finding is the excerpt.
- **Deploy timeline rows:** NO boxes. Full-bleed hairline rows ≥56px:
  `tag` glyph, mono version label, Secondary relative time, right verdict
  word in its color (JBM 13). Baseline row carries a `BASELINE` Label chip.
- **Consumer rows:** hairline rows: name Title, declared-usage mono count
  (`12 ENDPOINTS · 41 FIELDS`), notify toggle; impacted state shows a break
  6px dot.
- **Changelog entry (public page):** magazine-set on carbon: date Label,
  Title, body ≤65ch, breaking entries lead with a 2px break left rule; mono
  version anchors; footer mark "Watched by SchemaSentry" in Secondary.
- **Slack alert (Block Kit, mirrored in-app):** header "API change —
  payments-api"; fields `*Verdict*\nBREAKING (2)` · `*Deploy*\n4d81e07`;
  one section per top finding (reason + mono pointer); actions `View diff` ·
  `Acknowledge`. No emoji, no images.
- **Bottom tab bar (mobile dashboard):** height 56 + safe-area, `panel` 94%
  + blur, hairline top: timeline / diff / consumers / scroll at 22px + 10px
  Manrope 600 labels; active = `text` + 2px break dot; inactive = `text-3`.

## The signature — the strike-draw
When a diff opens, findings settle in order and the breaking ones perform the
product's one move: in the mini-diff, the removed line's text gets a 1.5px
break strikethrough drawn left→right in 240ms `ease-out-quart`, immediately
followed by the verdict word stamping in (scale 1.04 → 1.0, 160ms,
`spring-snappy`). One pass per diff view, top three breaking findings only,
40ms stagger; everything after appears settled. Pure CSS/SVG stroke — no
canvas, 60fps on a phone. This is the entire brand animation; acks, filters,
and navigation are state feedback ≤240ms.

## Mobile layout (390×844 — primary spec)
- **Diff view (money screen):** gutter 20. Verdict stamp at top, then
  finding cards ordered breaking → risky → compatible (compatible collapsed
  behind a count row). Thumb zone: **Publish changelog draft** primary when
  a draft exists; otherwise **Copy check command**.
- **Timeline:** env chips (prod / staging / PRs), deploy rows; tapping two
  rows arms compare mode (Label `COMPARING 2` + a Compare primary).
- **Consumers:** registry rows + an Add consumer sheet (name, declared
  endpoints as a searchable mono list); impact history per consumer.
- **Changelog editor:** draft entries with auto-drafted body_md, editable
  inline; Publish is primary; preview matches the public page exactly.
- **Empty state (first run):** a copyable mono terminal block —
  `npx schemasentry push --api payments spec.yaml` — with "your first diff
  appears here" in Secondary. No illustration.

## Responsive
≥768px: finding cards go two-column (diff left, impact right); timeline
docks as a left rail; gutters 32. ≥1024px: three-pane dashboard — timeline
rail, diff center (max 720), consumer impact right; the public changelog
stays a single ≤65ch column at every size (a document, not an app). Max
content 1200. No desktop spectacle — the strike-draw is the signature at
every size.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Finding cards enter with 24ms stagger,
opacity + 4px rise — dev tools never bounce. Compare-mode arming crossfades
150ms; copy actions flash the mono text's background to `panel` for 120ms.
Ack is hold-to-confirm (600ms radial fill) and requires a note — recording
intent is the interaction. Targets ≥44px, ≥8px apart; the public changelog
is fully keyboard/reader accessible.

## Reduced motion & fallback
Strike-draw → strikethrough and stamp render complete instantly. Card stagger
→ ≤100ms opacity fade. Copy flash → a text "Copied" confirmation. Every
verdict, level, and impact is plain text + a labeled dot — color-blind-safe,
never motion-only. Slack/PR surfaces are static text by nature and carry the
full verdict without the app.
