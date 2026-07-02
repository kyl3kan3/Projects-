# TradeLog Roadmap

## Phase 0 — Setup (week 0)
- Next.js + Postgres + Redis running; canonical execution schema settled
- Parser harness with fixture tests scaffolding

**Done when:** a sample ThinkorSwim CSV imports into canonical executions with a row-level error report.

## Phase 1 — MVP (weeks 1–6)
- Parsers: ThinkorSwim/Schwab, IBKR Flex, Tradovate, one crypto exchange (fixture-tested)
- Trade matcher incl. scaling in/out; options grouping v1
- Journal view (notes, tags, screenshots); setups + per-setup expectancy
- Truth dashboard (win rate, profit factor, expectancy, segments) + equity curve + calendar
- Stripe tiers; free-tier 30-trade cap

**Done when:** 20 beta traders import real history with <1% unmatched executions and the matcher survives their scaling patterns.

## Phase 2 — Launch (weeks 7–10)
- Leak detector v1 (5 finding types, dollar-ranked, sample-size gated)
- Weekly review ritual; shareable stat cards (watermarked — the growth loop)
- SEO: broker import guides + alternative pages; creator affiliate program (30% recurring)
- Launch in trading Discords + fintwit

**Done when:** 100 paying; ≥30% of actives complete a weekly review; first affiliate-driven cohort converting.

## Phase 3 — Growth (months 3–8)
- More brokers (Webull, Robinhood exports, NinjaTrader); auto-sync expansion
- Pro: multi-account, futures/options depth, mentor share links, API export
- Prop-firm B2B: cohort dashboards for funded-trader programs (higher ACV)
- Backtest-vs-journal comparisons

**Done when:** $10k MRR; import-success rate ≥99%; ≥1 prop-firm pilot signed.
