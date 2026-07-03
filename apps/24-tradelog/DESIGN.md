# TradeLog — Design Specification (v3, redline level)

## Vision
A performance lab, not a casino. Every trading product screams dopamine;
TradeLog whispers discipline — a graphite terminal where numbers are the
interface, profit and loss color nothing but money, and the one act of drama
is the truth: the leak, found and named in plain language with a dollar
figure. The feel is a coach reviewing film with you.

## Ground rules inherited
Obeys DESIGN_LANGUAGE.md v2.1 fully: no emoji anywhere, no gradient/glow on
controls, SVG icon set only, space-before-boxes, 4px spacing scale, hairlines,
real content, fonts must load.

---

## Color — exact values and usage ratios

| Token | Hex | Use |
|---|---|---|
| `graphite` | `#101418` | The ground. Every screen. |
| `panel` | `#171C22` | Cards, sheets, chart wells only |
| `hairline` | `#232B34` | 1px dividers, table rules, card borders |
| `text` | `#E6EBF2` | Primary text |
| `text-2` | `#8593A6` | Secondary text |
| `text-3` | `#4E5A68` | Faint (placeholders, disabled) |
| `paper` | `#EFF2F6` | **Primary buttons** (graphite text on it), key non-money numerals |
| `blue` | `#4C8DFF` | THE accent. ≤10% of any screen: links, active tab, focus rings, selection, the "reviewed" stamp |
| `profit` | `#2EBD85` | Realized gains ONLY (see P/L rules) |
| `loss` | `#F6465D` | Realized losses + destructive confirmation ONLY |
| `leak` | `#FFB020` | Leak findings semantic only — left rules, the gap fill |

**P/L color rules (exact, binding):** `profit`/`loss` may color: money and
R-multiple values, the P&L table column, calendar heatmap cells, and the fill
of daily bars. They may NEVER color: buttons, icons, links, backgrounds,
banners, tab states, or non-money stats (win rate is `text`, not green).
A green button in this product is a build failure.

## Type — exact specimen (mono-heavy by design)

Faces: **IBM Plex Mono** (400/500/600) carries the product — every number,
table, and stat · **Inter** (400/500/600) for prose and labels only. Both
self-hosted woff2, preloaded. Numbers are the interface; if a value can be
set in mono, it is.

| Role | Face/weight | Mobile size/lh | Tracking |
|---|---|---|---|
| Display (marketing) | Inter 600 | `clamp(32px, 8.5vw, 56px)` / 1.08 | −0.02em |
| H2 (screen title) | Inter 600 | 22 / 1.2 | −0.01em |
| Stat numeral | IBM Plex Mono 600 | 28 / 1.1 | 0, tabular |
| Leak dollar figure | IBM Plex Mono 600 | 32 / 1.1 | 0, tabular |
| Finding sentence | Inter 500 | 17 / 1.45 | 0 |
| Body / notes | Inter 400 | 16 / 1.55 | 0 |
| Table cell | IBM Plex Mono 400 | 13 / 1.4 | 0, tabular |
| Secondary | Inter 400 | 13 / 1.45 | 0 |
| Label | Inter 600 | 11 / 1.2 | +0.08em, uppercase |
| Button | Inter 600 | 15 / 1 | 0 |

## Spacing, radius, elevation
- Scale: `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80`. Screen gutter **20**;
  table cell padding 8/12.
- Radii: **6** (controls: buttons, inputs, chips) · **10** (cards, chart
  wells) · **14** (sheets). Nothing else.
- Elevation: none. Depth is `panel` on `graphite` plus hairlines. No shadows
  except the sheet scrim. Charts sit in flat wells, not framed screenshots.

## Iconography
Single SVG set, 20×20 viewBox, stroke 1.75, round caps/joins, currentColor.
Required glyphs: `curve` (equity line), `journal` (ruled page), `leak`
(droplet), `import` (tray + arrow), `calendar`, `tag` (setup), `filter`,
`chevron-down`, `chevron-right`, `check`, `close`, `alert` (triangle),
`camera` (chart snapshot), `eye` (watch pattern), `trash`. Tab bar 22px,
inline 16px. **No emoji, anywhere, ever** — emotion tags are Labels
(`REVENGE`, `FOMO`, `PLANNED`) in hairline chips, never faces.

## Component construction (exact)
- **Primary button:** paper fill, graphite text, radius 6, height 48 mobile
  (full-width in thumb zone), Inter 600 15. Press: scale 0.98 + fill
  `#DDE2E9`. Disabled: `#232B34` fill, `text-3` text.
- **Secondary:** transparent, 1px hairline, `text`. Press: border `#2F3A46`.
- **Quiet action:** text-only blue; press dims to 80%.
- **Destructive (delete import/account):** transparent, 1px `loss` border at
  60%, `loss` text, hold-to-confirm — a 1.5px border sweep completes over
  800ms hold; release early cancels.
- **Stat block:** NO boxes — Label(11) over a mono numeral 28, hairline rules
  between grid cells only. Money stats get a 24px spark underline in the P/L
  color; non-money stats (win rate 54%, profit factor 1.62) stay `text`.
- **Execution table:** hairline rows, no zebra; mono 13 cells right-aligned;
  P&L column colored by sign; scaling legs grouped under their round-trip
  parent with a 12px indent and a 1px `hairline` spine. Lives in its own
  `overflow-x:auto` container.
- **Leak card:** `panel`, radius 10, hairline border + a 2px `leak` left
  rule; Label `LEAK Nº 1 — HIGHEST COST`, finding sentence 17, dollar figure
  mono 32, "Show me the trades" quiet action expanding a tappable evidence
  list; "Watch this pattern" toggle adds a guardrail chip to the dashboard.
- **Calendar heatmap:** 4px-radius day cells, fill scaled by daily P&L
  (`profit`/`loss` at 15–80% opacity, zero = `panel`); mono day numbers;
  a day tap lifts its trades into a mini-stack sheet.
- **Emotion/setup chips:** height 32, radius 6, hairline, Label text; active
  = 1px blue border + blue text.

## The signature — the counterfactual gap
On the insights screen the equity curve draws once — 600ms `ease-out-quart`
stroke-dashoffset, 1.5px `text-2` line. Then, for the active leak, the
"you without this leak" counterfactual draws above it: 1.5px `paper` line,
600ms, starting 200ms after the base settles. The region between fills with
`leak` `#FFB020` at 12% opacity, revealed top-down over 400ms — the gap *is*
the dollar cost — while the finding's figure counts up in mono over the same
600ms ("This costs you **$412/mo**"). One leak at a time, one draw per
session; the restraint is the clinical credibility. Pure SVG, 60fps on a
phone.

## Mobile layout (390×844 — primary spec)
- **Nav:** bottom tab bar 56px + safe-area (`curve` Dashboard · `journal`
  Journal · `leak` Insights · `import` Import), 22px glyphs, 10px Inter 600
  labels; active = `text` + 2px blue dot.
- **Dashboard:** equity curve hero in a chart well (radius 10, height 200,
  SVG); under it a 2-column stat grid on hairlines — `WIN RATE 54%` ·
  `PROFIT FACTOR 1.62` · `EXPECTANCY +$38` · `MAX DD −$2,140` (money in P/L
  color, ratios in `text`). Then the calendar heatmap, then the top-leak
  teaser card. Everything above the fold, no horizontal body scroll.
- **Insights (money screen):** one leak per screen, severity-ordered by
  dollar impact — "Your first trade after a stop-out loses 2.3× your
  average." — with the counterfactual chart and evidence expansion; "Next
  leak" is a full-width 48px primary in the thumb zone (swipe advances too).
- **Journal / trade detail:** price chart with entry/exit pins and the
  R-multiple bracket, execution table, ruled notes with emotion chips, setup
  tag with inline expectancy ("ORB breakout: +0.4R avg over 34 trades").
- **Import:** broker rows on hairlines (`IBKR FLEX — SYNCED 09:00` mono),
  CSV drop target (dashed hairline, radius 10), then matched-trade preview
  rows streaming in.

## Responsive
Phone-first. ≥768px: dashboard lays the curve beside the stat grid, gutters
32. ≥1024px: journal becomes a film-room split (chart + execution table +
notes); insights keeps one-leak-at-a-time at every size — width buys margin,
never more leaks. No 3D, no desktop spectacle; richer charts only.

## Motion & touch
Tokens from DESIGN_LANGUAGE.md. Every stat odometers once on first view
(`dur-emphasis`) then never again that session. Import rows stream with a
20ms stagger cap. Calendar cells fill in reading order, 6ms stagger. Entry/
exit pins drop 120ms apart, bracket draws between them 300ms. Weekly review
fills a sober discipline ring segment per reflection (blue, not a flame);
completing presses a blue `REVIEWED` stamp, 250ms. Targets ≥44px.

## Reduced motion & fallback
Curve draw → instant with an endpoint dot. Counterfactual → static two-line
chart, gap pre-filled and labeled with the figure. Odometers → direct values.
Cell/pin staggers off. Hold-to-confirm keeps the timing (it is a safety, not
a decoration) but the sweep becomes a static countdown numeral. Every insight
is fully readable as text.
