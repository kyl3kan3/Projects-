# TradeLog

**A trading journal that tells you the truth: import every trade automatically, see exactly which setups make you money and which habits bleed you dry.**

---

## The Problem

Millions of retail traders (stocks, options, futures, crypto) share one statistical reality: most lose money, and nearly all of them don't know *why*. The difference between a losing trader and a breakeven-or-better one is almost always process visibility — which setups actually win, what time of day they overtrade, how revenge trades follow losses, whether they cut winners early and let losers run.

Journaling fixes this and traders know it — "keep a journal" is the most repeated advice in every trading community. But manual journaling in Excel dies within two weeks. Auto-importing journals exist (Tradervue, TraderSync, Tradezella) and prove strong willingness to pay ($29–$79/mo), but they're aging, expensive at the tiers that matter, and their analytics stop at dashboards instead of answering the actual question: *what should I stop doing?*

## Target User

- **Primary:** active retail traders — 5–100 trades/week — in US equities/options and futures, who already lose more than $49/mo to their own mistakes and know it. Passionate, community-organized (Discord, X, YouTube), and willing to pay for edge.
- **Secondary:** prop-firm challenge traders (funded-account evaluations *require* discipline metrics); trading educators reviewing students' journals.
- **Not targeting:** buy-and-hold investors, HFT/algo traders.

## Market & Profitability

- The niche is validated hard: Tradezella (~$49/mo), TraderSync ($29–$79/mo), Tradervue ($29–$49/mo) all sustain real businesses on this exact product; trading-tool audiences monetize at some of the highest ARPUs in consumer-adjacent SaaS.
- Realistic outcome: **$10k–$60k MRR.** The audience concentrates in reachable places (fintwit, trading Discords, YouTube) and churns primarily when they quit trading — not to competitors.
- Costs are modest (broker-data parsing + Postgres + charts); margins 90%+.
- Expansion: prop-firm B2B dashboards (firms monitor cohorts of funded traders) is a natural, higher-ACV second act.

## Monetization

| Tier | Price | Limits |
|------|-------|--------|
| Free | $0 | 1 account, 30 trades/mo, core stats |
| Trader | $19/mo (or $190/yr) | Unlimited trades, all analytics, setups/tags, images |
| Pro | $49/mo (or $490/yr) | Multi-account, options/futures analytics, backtesting vs journal, API export, mentor sharing |

Undercuts Tradezella/TraderSync meaningfully at the entry tier — land on price, expand on depth.

## MVP Features

- [ ] Broker imports: CSV for the long tail + direct sync where APIs allow (Interactive Brokers Flex, Tradovate, ThinkorSwim/Schwab exports, crypto exchange APIs)
- [ ] Auto trade-matching: executions → round-trip trades (scaling in/out handled correctly — this is the hard part competitors get wrong)
- [ ] Journal view: per-trade P&L, R-multiple, screenshots/chart snapshots, notes, emotional-state tags
- [ ] Setup & tag system: user-defined playbooks ("ORB breakout", "VWAP fade") with per-setup expectancy
- [ ] The truth dashboard: win rate, profit factor, expectancy, drawdown, P&L by setup / time-of-day / day-of-week / hold time
- [ ] **Leak detector:** automated findings — "your first trade after a stop-out loses 2.3× your average", "trades after 11:30 are net negative"
- [ ] Calendar heatmap + equity curve; weekly review ritual (guided template)

## Differentiation

1. **Leak detection over dashboards.** Competitors show numbers; TradeLog issues findings in plain language, ranked by dollar impact. This is the screenshot traders share, and shared screenshots are the growth loop.
2. **Correct trade-matching for scaling** in/out and options multi-leg — the #1 complaint thread on every incumbent.
3. **Priced to land** at $19 where incumbents start at $29–$49.

## Go-to-Market

- Trading Discords + fintwit: leak-detector screenshots are inherently shareable content; partner with mid-size trading YouTubers/streamers (affiliate 30% recurring — this audience converts through creators, full stop).
- SEO: "tradezella alternative", "tradervue vs tradersync", broker-specific import guides ("how to journal ThinkorSwim trades").
- Prop-firm partnerships: journals are recommended (sometimes required) for funded traders — a referral pipe.
- Free tier as the demo; the 30-trade cap hits an active trader within a week.

## Competition

| Competitor | Price | Weakness we exploit |
|------------|-------|---------------------|
| Tradezella | $49+/mo | Price; analytics stop at pretty dashboards |
| TraderSync | $29–$79/mo | Aging UX, weak scaling-trade matching |
| Tradervue | $29–$49/mo | Oldest UI in the category, minimal insight layer |
| Excel/Notion DIY | Free | Dies in two weeks; no auto-import |

## Key Risks

- **Broker-import brittleness:** every broker exports differently and formats drift; treat import parsers as the core engineering asset with fixture tests per broker, and let users report format breaks in-app.
- **Audience churn from quitting:** traders stop trading; annual plans + prop-firm B2B smooth it.
- **Not financial advice line:** leak findings are descriptive statistics about the user's own history — keep language factual, add disclaimers, never generate trade signals.
- **Data sensitivity:** P&L data is intimate; encryption at rest, easy export/delete, no data sales — state it loudly.
