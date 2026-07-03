# TradeLog — Design Specification

## Design vision
A performance lab, not a casino. Every trading product screams dopamine;
TradeLog whispers discipline — a dark analytical instrument in institutional
graphite where the only drama is the truth. The emotional design target: the
feeling of a coach reviewing film with you. Clinical surfaces, championship
standards, and one signature act: the leak, found and named in plain language
with a dollar figure.

## Brand identity

| Role | Color | Hex |
|---|---|---|
| Graphite | `#101418` |
| Panel | `#171C22` |
| Brand | Analyst blue | `#4C8DFF` |
| Profit | Institutional green | `#2EBD85` |
| Loss | Institutional red | `#F6465D` |
| Leak | Warning amber | `#FFB020` |
| Text | `#E6EBF2` / muted `#8593A6` |

- **Display & UI:** `Suisse Intl` (fallback `Inter`); **every number in the product:** `Suisse Intl Mono` (fallback `IBM Plex Mono`) tabular — P&L, R-multiples, ratios; numbers are the interface.
- Profit/loss colors are *never* used for anything but money outcomes — buttons, links, and states use analyst blue exclusively (a discipline most trading apps fail).
- **Logo:** "TradeLog" where the "T" is a candlestick with its wick as the letter's stem. Icon: the T-candle on graphite.
- **Voice:** performance coach. "Your first trade after a stop-out loses 2.3× your average. That cost $4,120 this quarter."

## Art direction
- Charting is the craft centerpiece: 1.5px equity curves with soft glow only at the current point, dot-grid paper (6% opacity), inverted-nothing — clean lightweight-charts styling tuned to the palette.
- The journal aesthetic: trade notes render on ruled lines with the emotional-state tags as small clinical chips (FOMO, revenge, planned) — self-honesty made routine.
- Density: pro-terminal information design, 13–14px, generous only around the insights.

## The signature moment — "The Leak Detector"
The insights screen stages an examination. The user's equity curve draws across
the screen (1.2s, `ease-out-expo`) — then the analysis begins: a thin amber
scan-line traverses the curve left to right (800ms), and where the leak lives,
**the curve splits into two ghosts**: the real curve, and above it a brighter
"you without this leak" counterfactual curve (draws in analyst blue, 600ms),
the gap between them filling with a translucent amber region that *is* the
dollar cost. The finding card types itself beneath in plain language with the
mono dollar figure counting up: "Trades after 11:30am: –$4,120 this quarter."
A "show me the trades" affordance explodes the evidence — the culpable trades
scatter-plot onto the gap region as dots you can tap into. One leak presented
at a time (severity-ordered); the restraint is clinical credibility. This
counterfactual-gap visualization is the product's moat, rendered.

## Motion system
- **Import:** broker rows stream into the ledger with a 20ms stagger cap (feels fast, not showy); the matching engine's work surfaces as execution dots pairing into trade brackets (small connecting braces draw between entry/exit dots).
- **Calendar heatmap:** day cells fill in reading order (6ms stagger) — green/red/flat; hovering a day lifts its trades into a mini-stack.
- **Trade review (film room):** opening a trade slides the price chart in with the entry/exit markers dropping as pins (staggered 120ms) and the R-multiple bracket drawing between them.
- **Weekly review ritual:** completing each reflection section fills a segment of a discipline ring (not a streak flame — a ring; sober); finishing presses a "reviewed" stamp in analyst blue.
- **Numbers:** every stat animates once on first view (odometer, 400ms) then never again during the session — respect for the analyst's eye.

## Key screens
1. **Marketing hero:** the Leak Detector running on demo data, autoplaying the counterfactual split; headline: "Your edge is leaking. We can show you where." Below, the honesty manifesto strip (descriptive stats, min sample sizes, no signals — differentiation as copy).
2. **Dashboard:** equity curve hero, stat blocks (win rate, profit factor, expectancy in mono), calendar heatmap, and the top leak card teaser.
3. **Money screen — Insights:** the full Leak Detector examination, leaks queued by dollar impact, each with evidence explosion and a "watch this pattern" toggle that adds a live guardrail chip to the dashboard.
4. **Journal/trade detail:** film-room chart, execution table, ruled notes with emotion chips, setup tag with per-setup expectancy inline ("ORB breakout: +0.4R avg over 34 trades").

## Component language
- Buttons: 6px radius, analyst blue; destructive = outline red with hold-to-confirm.
- Stat blocks: mono number, small-caps label, spark underline in P/L color only when the stat is money.
- Cards: hairline borders, no shadows; leak cards get the amber 2px left rule.
- Empty state: a flat baseline curve: "Import your trades. The curve doesn't lie."

## Reduced motion & fallback
Curve draws → instant with endpoint glow. Scan-line + counterfactual split → static two-curve chart with the gap pre-filled and labeled. Evidence explosion → list view. Odometers → direct values. All insights fully readable as text.
