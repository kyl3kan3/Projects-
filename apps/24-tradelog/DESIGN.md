# TradeLog — Design Specification

## Vision
A performance lab, not a casino. Every trading product screams dopamine; TradeLog
whispers discipline — a dark analytical instrument in institutional graphite where the
only drama is the truth. The emotional target is a coach reviewing film with you: clinical
surfaces, championship standards, and one signature act — the leak, found and named in
plain language with a dollar figure.

## Mobile layout (390 × 844)
Traders journal at the desk but review on the phone; the truth has to read one-handed.
- **Nav:** bottom tab bar (Dashboard · Journal · Insights · Import), safe-area-aware.
- **Dashboard:** the equity curve as a compact hero chart (SVG, HTML-rendered, not a
  canvas), then stat blocks (win rate, profit factor, expectancy) as a 2-column grid in
  mono, then the top leak card. All above the fold reads without horizontal scroll.
- **Insights (the point):** one leak per screen, severity-ordered; swipe or a "Next leak"
  button advances. The finding card carries the plain-language sentence and the mono
  dollar figure; "Show me the trades" expands the evidence as a tappable list.
- **Calendar heatmap** and wide execution tables scroll inside their own
  `overflow-x:auto` container — the body never scrolls sideways.
- **Primary action** (Import / Next leak / Save review) is a full-width control in the
  thumb zone.

## Identity
| Role | Name | Hex |
|---|---|---|
| Graphite | Base | `#101418` |
| Panel | Panel | `#171C22` |
| Brand | Analyst blue | `#4C8DFF` |
| Profit | Institutional green | `#2EBD85` |
| Loss | Institutional red | `#F6465D` |
| Leak | Warning amber | `#FFB020` |

Text `#E6EBF2`, muted `#8593A6`.

- **Display & UI:** `Suisse Intl` (fallback `Inter`), 16px min on mobile. **Data:**
  `Suisse Intl Mono` (fallback `IBM Plex Mono`) tabular — P&L, R-multiples, ratios;
  numbers are the interface. **Discipline rule:** profit/loss colors are used *only* for
  money outcomes — every button, link, and state uses analyst blue.
- **Signature detail — the counterfactual gap:** the product's moat, rendered with
  restraint. On the insights screen the equity curve draws once (`ease-out-quart`), then
  for the active leak a brighter "you without this leak" counterfactual line reveals above
  it (600ms), the space between filling with a translucent amber region that *is* the
  dollar cost, while the finding card's figure counts up. One leak at a time; the restraint
  is the clinical credibility. Pure SVG + lightweight-charts, 60fps on a phone.

## Responsive
Phone-first. At `md` the dashboard lays the equity curve beside the stat grid; at `lg` the
journal becomes a film-room split (price chart + execution table + ruled notes). The
insights examination keeps its one-leak-at-a-time focus at every size — width buys margin,
not more leaks on screen. **Optional desktop enhancement:** none beyond richer charts; no
3D anywhere — this is a data instrument.

## Motion & touch
- Shared tokens: curve draw `ease-out-quart`; import rows stream with a 20ms stagger cap;
  every stat animates once on first view (odometer, `dur-emphasis`) then never again in
  the session — respect for the analyst's eye.
- Targets ≥44px; destructive actions (delete account/import) are outline-red with
  hold-to-confirm.
- Calendar cells fill in reading order (6ms stagger); a day tap lifts its trades into a
  mini-stack. Trade review drops entry/exit pins (staggered 120ms) with the R-multiple
  bracket drawing between them.
- Weekly review: each completed reflection fills a segment of a sober discipline ring
  (not a streak flame); finishing presses a "reviewed" stamp in analyst blue.

## Key screens
1. **Dashboard:** equity curve hero, mono stat blocks, calendar heatmap, top leak teaser.
2. **Insights (money screen):** the counterfactual-gap examination, leaks queued by dollar
   impact, each with an evidence expansion and a "watch this pattern" toggle that adds a
   live guardrail chip to the dashboard.
3. **Journal / trade detail:** film-room chart, execution table, ruled notes with emotion
   chips (FOMO / revenge / planned), setup tag with per-setup expectancy inline
   ("ORB breakout: +0.4R avg over 34 trades").
4. **Marketing hero:** the leak detector on demo data with the counterfactual split;
   headline "Your edge is leaking. We can show you where." plus the honesty manifesto
   (descriptive stats, min sample sizes, no signals).

## Component language
- Buttons: 6px radius, analyst blue; destructive outline-red with hold-to-confirm. ≥44px.
- Stat blocks: mono number, small-caps label, spark underline in P/L color only when the
  stat is money.
- Cards: hairline borders, no shadows; leak cards get the amber 2px left rule.
- Empty state: a flat baseline curve: "Import your trades. The curve doesn't lie."

## Reduced-motion & fallback
Curve draw → instant with an endpoint glow. Counterfactual reveal → static two-curve chart
with the gap pre-filled and labeled. Evidence expansion → plain list. Odometers → direct
values. Every insight is fully readable as text.
