# ClientDock — Design Specification (v3, redline level)

## Vision
ClientDock makes a small agency feel like a firm with a lobby. The client
arrives on a phone from a magic link, so the portal's mobile experience is the
product: ivory hospitality surfaces, the client's name in serif, brass used
like hotel signage, ink buttons like a concierge's pen. Every visual token is
white-label replaceable — vanishing gracefully is the system's flex.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `ivory` | `#F4F1EA` | The ground. Every screen |
| `card` | `#FBF9F4` | Module cards, sheets, deliverable mats only |
| `hairline` | `#E3DED2` | 1px dividers & card borders — never darker |
| `ink` | `#20241F` | Primary text; **primary buttons** (ivory text) |
| `ink-2` | `#6E6A5E` | Secondary text |
| `ink-3` | `#9C978A` | Faint (timestamps, "via ClientDock") |
| `brand` | `#1E4D3B` | Welcome band + monogram ground ONLY (default club green; agency-replaceable) |
| `brass` | `#A8843F` | THE accent. ≤10% of any screen: signage chips, timeline rail fill, links, active tab dot, the stamp |
| `green` | `#3E8E5A` | APPROVED state only |
| `amber` | `#C08A2D` | AWAITING YOU state only |

> **Color law (v5):** No purple — violet/lavender/purple-indigo hues (~250–310°) are banned outright as the strongest AI-design tell. No framework-default palette hexes (Tailwind/Bootstrap swatches). Accents are custom-mixed, slightly desaturated, and anchored in the product's real world.

Hard rules: `ink` is the only high-emphasis fill; `brass` never fills a button
or a surface; `brand` appears only as the welcome band and monogram tile.

**White-label tokens (exact):** agencies may replace `--wl-brand` (welcome
band), `--wl-accent` (brass role — contrast ≥3:1 on ivory enforced),
`--wl-display-font`, `--wl-logo` (SVG, max-height 28), `--wl-domain`, and
`--wl-email-from`. Spacing, radii, type sizes, ink, and semantic green/amber
are structural and never themeable. White-label accent values are validated
against the same color law (v5): purple-family hues (~250–310°) are rejected
outright, and contrast ≥3:1 on ivory is enforced. Solo tier appends an 11px
`ink-3` "via ClientDock" footer line; Agency+ removes every trace.

## Type — exact specimen

Faces: **Playfair Display** (600) for display · **Inter** (400/500/600) for UI
· **IBM Plex Mono** (500) for ledger data. All self-hosted woff2, preloaded.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (guest name) | Playfair 600 | `clamp(28px, 7.5vw, 44px)` / 1.12 | 0 |
| H2 (module title) | Playfair 600 | 22 / 1.2 | 0 |
| Title (row/card) | Inter 600 | 16 / 1.3 | 0 |
| Body | Inter 400 | 16 / 1.55 | 0 |
| Secondary | Inter 400 | 13 / 1.45 | 0 |
| Label (signage) | Inter 600 | 11 / 1.2 | +0.08em, uppercase |
| Data (audit, invoices) | IBM Plex Mono 500 | 13 / 1.2 | 0, tabular figures |
| Button | Inter 600 | 15 / 1 | 0 |

Status is always signage Label: IN PROGRESS · AWAITING YOU · APPROVED.

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**.
- Radii: **10** (buttons, inputs, chips) · **14** (module cards, deliverable
  frames) · **20** (sheets). Nothing else.
- Elevation: none. Depth is `card` on `ivory` plus hairlines; only sheets carry
  a scrim. No warm drop-shadow theatrics.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `timeline` (rail + dots), `folder` (files), `stamp`
(approvals), `message`, `invoice` (doc + currency line), `bell` (awaiting),
`chevron-left`, `check`, `x`, `eye` (client view), `duplicate`, `send`,
`link`, `toggle`. Nav at 22px, inline at 18px. **No emoji, anywhere, ever** —
celebration on approval is the stamp, not confetti or a party-popper glyph.

## Component construction (exact)

- **Primary button:** `ink` fill, `ivory` text, radius 10, height 48
  (full-width in thumb zone). Press: scale 0.98 + fill `#31352E`. Disabled:
  `#DCD7C9` fill, `ink-3` text.
- **Secondary:** transparent, 1px hairline, `ink` text. Press: border `#CFC8B8`.
- **Quiet action:** text-only `brass`, no underline; press dims to 80%.
- **Welcome band:** `brand` fill, full-bleed, padding 24/20: monogram tile 40×40
  (radius 10, `ivory` letterform), "Welcome, Meridian" in Playfair `ivory`,
  Secondary line at 70% ivory ("Prepared by Northbeam Studio").
- **Signage chip:** height 24, radius 10, 1px `brass` border at 60%, Label text
  — amber text/border for AWAITING YOU, green for APPROVED, `ink-2` for
  IN PROGRESS. Never filled.
- **Module cards:** the lobby's framed rooms — `card` fill, hairline border,
  radius 14, padding 16, ≥72px: glyph 20px, Title, one-line status Secondary
  ("2 files added Tue"), signage chip right. Inside a module, content is
  hairline rows, never nested cards.
- **Front desk list:** NO boxes. Hairline rows under an 11px `SINCE YOUR LAST
  VISIT` Label: "Homepage v3 uploaded · Tue", "Invoice #0042 — $4,800 due
  Jul 15" (mono figures), bell glyph on items awaiting the client.
- **Approval bar:** fixed bottom third — primary "Approve" (ink fill) full
  width, secondary "Request changes" beneath, 8px gap.
- **Timeline:** a 2px `hairline` vertical rail filling `brass` through
  completed phases; 8px phase dots; per-phase mono stamp (`UPDATED JUN 30`).
- **Agency tab bar:** height 56 + safe-area, `ivory` 94% + blur, hairline top:
  Portals / Needs attention / Compose / Settings at 22px + 10px labels; active
  = `ink` + 2px `brass` dot; inactive = `ink-3`.

## The signature — the brass stamp
Tapping Approve presses a stamp: a 64px `stamp` glyph descends 8px and scales
1.06→1.0 in 200ms `ease-in-out-soft` (anticipate 60ms, press 140ms), landing as
an embossed `APPROVED` seal — 1.5px `green` double ring, uppercase Label,
rotated −6°, at 90% opacity over the deliverable corner. Beneath it the audit
line types on in mono over 300ms: `APPROVED BY S. OKAFOR · JUL 3, 11:42 AM`.
One light haptic at the press. CSS transform + opacity only, 60fps on any
phone. This is the entire brand animation; the arrival is quieter: module cards
light their signage chips in an 80ms stagger (≈480ms total), skippable by
scroll, first session only.

## Mobile layout (390 × 844 — primary spec)
- **Client portal (the artifact):** slim top bar (agency logo left, menu).
  Welcome band → front desk rows → module cards in a vertical list: Timeline ·
  Files · Approvals · Messages · Invoices. Thumb-zone action is contextual —
  "Review Homepage v3" (ink primary) when an approval waits. Empty module:
  "Nothing here yet — Northbeam will stock this room." in `ink-2`, no
  illustration box.
- **Approval screen:** deliverable preview full-width on a `card` mat (radius
  14), version tabs as chips (V1 · V2 · V3 active), the approval bar fixed
  below; request-changes opens a margin-note sheet (radius 20, grab handle
  40×4 `hairline`) with a text field and file pin.
- **Agency dashboard (money screen):** "Needs attention" queue first — hairline
  rows ("Meridian Roasters — approval waiting 3 days", bell glyph amber), then
  portal cards: client monogram, Title, freshness in mono (`LAST VIEWED 2D
  AGO`), sparkline 48×16 in `ink-2`. One-tap "Post an update" composer via
  Compose tab.
- **Portal composer:** module toggles as 44px switch rows (hairline-divided),
  template row "Duplicate the Meridian setup", live client-view preview behind
  the `eye` action.

## Responsive
≥768px: portal centers at ~65ch, modules become a 2-up grid; gutters 32.
≥1024px: agency dashboard becomes a portfolio wall of portal cards with the
attention queue docked left; max content 1120. Optional desktop enhancement:
the marketing page's live re-skin demo (type agency name, pick two colors,
watch the portal re-theme) — pointer surface, never on the client's mobile
path.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Module cards enter with a 12px rise,
`spring-gentle`, 30ms stagger ≤6. New file version slides atop its stack
(`spring-gentle`) with prior tab peeking. Timeline rail fills 400ms
`ease-in-out-soft` on first view. Targets ≥44px, ≥8px apart; pull-to-refresh
the front desk with a refresh button equivalent; light haptic on approve
(native).

## Reduced motion & fallback
Arrival → lobby fully lit with a 120ms fade, no stagger. Stamp → seal + audit
line appear at once (haptic kept). Rail fill, card rise, version slide →
instant. Sparklines static. Theming is structural and always preserved. All
motion collapses to ≤100ms opacity; nothing is motion-only.
