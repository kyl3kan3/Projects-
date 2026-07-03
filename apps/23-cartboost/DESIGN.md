# CartBoost — Design Specification (v3, redline level)

## Vision
The cash-register moment, celebrated with merchant-grade taste. CartBoost
lives inside Shopify's admin, so it is Polaris-deferential — light paper
ground, ink actions, quiet cards — carrying exactly one signature: found
money, acknowledged once, in register green. The shopper-facing offer page is
faster and more honest than anything else in checkout, because checkout speed
is sacred.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load. Inside the admin, when Polaris and this spec
conflict, Polaris wins — merchants must feel zero foreignness.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `ground` | `#F6F6F7` | Admin page ground (Polaris surface) |
| `card` | `#FFFFFF` | Cards, the offer page ground |
| `hairline` | `#E1E3E5` | 1px dividers & card borders |
| `ink` | `#202223` | Primary text and **primary buttons** (white text on it) |
| `ink-2` | `#6D7175` | Secondary text |
| `ink-3` | `#A6ABB0` | Faint (placeholders, disabled) |
| `violet` | `#7B5CFF` | THE accent. ≤10% of any screen: brand mark, active funnel nodes, links, focus rings, selected tabs |
| `green` | `#108043` | Found-money semantic only — revenue figures, the money chip, acceptance states |
| `amber` | `#B98900` | Warnings only (free-tier cap at 80%, A/B low sample) |
| `red` | `#D82C0D` | Errors/destructive only |

Hard rules: violet never fills a button or a surface; `ink` is the only
high-emphasis fill (Polaris-dark primary); green appears only on dollar
values and accepted-offer states — never as decoration.

## Type — exact specimen

Faces: **Inter** (400/500/600 — Polaris-compatible) for all UI · **IBM Plex
Mono** (400/500) for the tape feed and IDs · **Cabinet Grotesk** (800,
Fontshare) for marketing display only. Self-hosted woff2, preloaded; the
shopper page uses the checkout's own font loading, no extra requests.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (marketing) | Cabinet Grotesk 800 | `clamp(36px, 9vw, 64px)` / 1.05 | −0.02em |
| Found-money headline | Inter 600 | 32 / 1.1 | −0.01em, tabular |
| H2 (screen/card title) | Inter 600 | 20 / 1.25 | 0 |
| Title (row, offer name) | Inter 600 | 16 / 1.3 | 0 |
| Body | Inter 400 | 16 / 1.55 | 0 |
| Secondary | Inter 400 | 13 / 1.45 | 0 |
| Label | Inter 600 | 11 / 1.2 | +0.08em, uppercase |
| Money (all amounts) | Inter 600 | per context | 0, **always tabular figures** |
| Tape feed / IDs | IBM Plex Mono 500 | 13 / 1.4 | 0, tabular figures |
| Button | Inter 600 | 15 / 1 | 0 |

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Admin gutter **16**
  (Polaris), shopper page gutter **20**.
- Radii: **8** (controls & cards — Polaris scale) · **12** (offer product
  image, modals) · **20** (mobile sheets). Nothing else.
- Elevation: Polaris card shadow (`0 1px 2px rgba(31,33,36,0.08)`) on admin
  cards only; the shopper page is flat white with hairlines.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `cart-plus` (upsell), `funnel` (split arrows), `tag` (offer),
`flask` (A/B test), `chart` (analytics), `receipt` (tape), `check`, `close`,
`chevron-down`, `chevron-right`, `plus`, `drag` (grip dots), `settings`,
`arrow-down` (downsell). Admin nav 20px, inline 16px. **No emoji, anywhere,
ever** — acceptance renders as a mono percentage (`31%`), not a face.

## Component construction (exact)
- **Primary button:** ink fill, white text, radius 8, height 44 admin / 48
  shopper (full-width), Inter 600 15. Press: fill `#3A3B3D`. Disabled:
  `#F1F2F3` fill, `ink-3` text. Never violet-filled, never green-filled.
- **Secondary:** white fill, 1px `#BABEC3` border, ink text (Polaris basic).
- **Quiet action / links:** violet text, no underline until hover.
- **Money chip:** `+$14.50` — Inter 600 tabular on a `#E8F5EE` pill-less
  chip, radius 8, green text, height 24, padding 4/8. The brand's most
  repeated glyph; printed once per event, never animated twice.
- **Funnel node card (builder):** white, radius 8, hairline; Label kind
  (`OFFER` / `DOWNSELL`), product thumb 40px radius 8, trigger summary 13.
  Active/selected = 2px violet border. Phone: stacked vertical list, 44px
  drag handles; ≥768px: horizontal canvas, nodes joined by 1.5px `#D6CCFF`
  splines (violet at 40% — connections stay quiet).
- **Ledger table (per-offer):** hairline rows, no zebra; columns Shown /
  Accepted / Revenue; numerals tabular right-aligned; revenue cells green
  only when incremental.
- **Free-tier meter:** 4px track in `hairline`, ink fill toward $200; at 80%
  the label turns amber ("$164 of $200 — upgrade before it pauses") — words,
  not glows.

## Shopper offer page construction (exact — the artifact)
Single column, white, gutter 20, max-width 480 centered. Total interaction
budget 400ms: rendered by Shopify's post-purchase extension surface, product
image preloaded during payment, zero spinners, zero layout shift.
- Label `ONE-TIME OFFER — ADDED TO YOUR ORDER Nº 1042` 11px, `ink-2`.
- Product image 1:1, radius 12, hairline border, width 100%.
- Title 20/600; one honest benefit line 16/`ink-2` ("Pairs with the grinder
  you just bought").
- Price row: offer price Inter 600 24 tabular + compare-at strikethrough
  16/`ink-3` + savings Label in green (`SAVE 20%`).
- **Add button:** full-width, height 48, radius 8, ink fill (merchant brand
  color may override via extension settings), "Add to my order — $23.20".
- **Decline:** directly below, full-width 44px text button, `ink` at 100%
  opacity, 16px: "No thanks, complete my order." Equal honesty, no shrinking.
- No fake timers, no fake stock counts, real prices only. One offer per
  screen; a declined offer may show one downsell, then always completes.

## The signature — the drop
When a shopper taps Add: the product thumb (40px) arcs into the order-summary
line along a quadratic path — 200ms total, `ease-in-out-soft` for the arc,
`spring-snappy` on the 1px settle. The order total crossfades with a 250ms
tabular count-up, and one money chip prints beneath it: `+$14.50 — found
money`, rising 4px with a 200ms fade. In the merchant dashboard, the live
tape prints one mono line per real accepted upsell ("09:41 order #1042
+$14.50 — Espresso Scale"), rising 200ms `ease-out-quart`, rate-limited to
one per 2s. Nothing loops; found money is acknowledged exactly once.

## Mobile layout (390×844 — merchant app, embedded)
- Polaris top bar; single column of cards at 16px gaps; no bottom tabs
  (embedded apps keep Shopify's chrome).
- **Dashboard:** found-money headline card — Label `FOUND THIS MONTH`, then
  `$1,840` Inter 600 32 tabular in green, then `You pay $29 — 63×` 13/`ink-2`.
  Below: the tape feed (last 8 lines, mono), then active funnels as node
  cards with acceptance sparklines (ink line, violet endpoint dot), then the
  setup checklist with strike-throughs.
- **Funnel builder:** vertical node list (trigger → offer → downsell), 44px
  edit taps, drag to reorder; "Preview offer" opens the real shopper page in
  a sheet (radius 20).
- **Funnel performance (money screen):** the ledger table in its own
  `overflow-x:auto` container; the ROI line typeset large — "CartBoost: $29.
  Found: $1,840." — the screenshot merchants share.

## Responsive
Admin follows Polaris breakpoints exactly. ≥768px: funnel builder becomes the
horizontal node canvas; analytics ledger goes two-column; max content width
per Polaris. The shopper page is identical at every size — one product, one
button, honest decline. No desktop enhancement anywhere; this product's charm
is that it never shows off in someone else's store.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Ledger rows print top-down on load
(`ease-out-quart`, 40ms stagger, max 12 then instant). Acceptance dial sweeps
once, 600ms `ease-out-quart`. Offer-editor edits update the live preview with
a 150ms crossfade. Targets ≥44px; shopper Add 48px. Shopper-page motion is
the drop only, and merchants can disable even that (setting: "No animation").

## Reduced motion & fallback
The drop → item appears in the summary with a green flash; total crossfades
100ms; chip prints statically. Tape → rows fade in. Dial → set position.
Sparklines static. Conversion never waits on animation; the shopper page is
fully functional as plain HTML.
