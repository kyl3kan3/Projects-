import type { Metadata } from "next";
import Link from "next/link";
import { CounterfactualCurve } from "@/components/CounterfactualCurve";
import { DrawOnce } from "@/components/DrawOnce";
import { HERO_DEMO, REVERSAL_CSV, REVERSAL_DEMO } from "./demo";
import { PLANS, monthlyEquivalent } from "@/lib/plans";
import { MIN_SEGMENT, MIN_TRADES } from "@/lib/leaks";
import { formatCents, formatPercent, formatRatio } from "@/lib/money";
import { IconArrowRight, IconCheck } from "@/components/icons";

export const metadata: Metadata = {
  title: "TradeLog — the trading journal that tells you the truth",
  description:
    "Import every trade automatically, see which setups make you money, and get told in plain language which habits bleed you dry. $19/mo where the incumbents start at $29–$49.",
};

/** The one CTA phrase, repeated verbatim (MARKETING_PLAYBOOK law 7). */
const CTA = "See your leaks free";

export default function LandingPage() {
  const { summary, finding, actual, without, actualLabel, withoutLabel, gapLabel } = HERO_DEMO;

  return (
    <>
      <header className="screen flex items-center justify-between pt-6 pb-2">
        <span className="t-label">TradeLog</span>
        <nav className="flex items-center gap-5">
          <Link href="/login" className="t-secondary no-underline">
            Sign in
          </Link>
          <Link href="/signup" className="btn btn-primary no-underline" style={{ height: 40 }}>
            {CTA}
          </Link>
        </nav>
      </header>

      <main className="screen pb-20">
        {/* ---------------------------------------------------------- 1. hero --- */}
        <section className="pt-10 pb-14">
          <h1 className="t-display">
            The gap between your curve
            <br />
            and your leak-free curve.
          </h1>
          <p className="t-body mt-5" style={{ color: "var(--color-text-2)", maxWidth: "38ch" }}>
            Most traders lose money and almost none of them know why. TradeLog imports every fill,
            matches it into real round trips, and names the one habit costing you the most — with the
            dollar figure attached.
          </p>

          <div className="mt-8">
            <DrawOnce sessionKey="marketing-hero">
              {(animate) => (
                <CounterfactualCurve
                  actual={actual}
                  without={without}
                  animate={animate}
                  height={220}
                  label={`A demonstration history ends at ${actualLabel}; without the trades behind its biggest leak it would read ${withoutLabel}`}
                />
              )}
            </DrawOnce>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
              <span className="t-secondary flex items-center gap-2">
                <span
                  aria-hidden="true"
                  style={{ width: 16, height: 1.5, background: "var(--color-text-2)" }}
                />
                What happened · {actualLabel}
              </span>
              <span className="t-secondary flex items-center gap-2">
                <span
                  aria-hidden="true"
                  style={{ width: 16, height: 1.5, background: "var(--color-paper)" }}
                />
                Without this one leak · {withoutLabel}
              </span>
            </div>
          </div>

          <div className="leak-card mt-6">
            <p className="t-label" style={{ color: "var(--color-leak)" }}>
              Leak Nº 1 — highest cost
            </p>
            <p className="t-finding mt-3">{finding.statement}</p>
            <p className="t-leak-figure mt-4" style={{ color: "var(--color-leak)" }}>
              {gapLabel}
            </p>
            <p className="t-secondary mt-2">{finding.detail}</p>
            <p className="t-secondary mt-4" style={{ color: "var(--color-text-3)" }}>
              Demo history, {summary.closedCount} trades — staged so we can show the product without
              publishing a real customer&rsquo;s P&amp;L. The sentence, the figure and the chart above
              it were all produced by the code that ships.
            </p>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/signup" className="btn btn-primary btn-full no-underline sm:w-auto">
              {CTA}
              <IconArrowRight size={18} />
            </Link>
            <span className="t-secondary flex items-center sm:ml-2">
              No card. One account, 30 trades a month, your biggest leak in full.
            </span>
          </div>
        </section>

        {/* ------------------------------------------------------- 2. the enemy --- */}
        <section className="hairline-t py-14">
          <p className="t-label">The enemy</p>
          <h2 className="t-h2 mt-3" style={{ maxWidth: "34ch" }}>
            Not the market. The spreadsheet you abandoned in week two.
          </h2>
          <p className="t-body mt-4" style={{ color: "var(--color-text-2)", maxWidth: "46ch" }}>
            &ldquo;Keep a journal&rdquo; is the most repeated advice in trading and almost nobody
            manages it, because the work is transcription and the payoff is invisible. TradeLog does
            the transcription and makes the payoff a sentence you cannot unread.
          </p>

          <dl className="mt-8">
            {[
              ["Broker export in", "ThinkorSwim/Schwab, IBKR Flex (CSV or XML), Tradovate, Binance."],
              [
                "Round trips out",
                "Scaling in, scaling out, and reversals that flip through flat — split correctly, FIFO, net of every commission.",
              ],
              [
                "Findings, ranked by cost",
                "Time of day, day of week, the trade after a loss, hold-time asymmetry, position-size drift, overtrading, and setups that stopped working.",
              ],
            ].map(([term, detail]) => (
              <div key={term} className="hairline-b py-4">
                <dt className="t-body">{term}</dt>
                <dd className="t-secondary mt-1">{detail}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ------------------------------------- 3. receipts: the matching proof --- */}
        <section className="hairline-t py-14">
          <p className="t-label">Receipts</p>
          <h2 className="t-h2 mt-3" style={{ maxWidth: "36ch" }}>
            The fill that flips through flat, matched correctly.
          </h2>
          <p className="t-body mt-4" style={{ color: "var(--color-text-2)", maxWidth: "46ch" }}>
            Long 100, then a 150-share sell. That one row closes a long <em>and</em> opens a short,
            and it is the single most common matching bug in this category — competitors report one
            trade and leave a position that never closes. Here is the file, and here is what our
            matcher does with it. The numbers below are computed from that file at build time.
          </p>

          <div className="table-scroll mt-6">
            <pre className="t-cell" style={{ color: "var(--color-text-2)" }}>
              {REVERSAL_CSV.trim()}
            </pre>
          </div>

          <div className="table-scroll mt-6">
            <table className="exec">
              <thead>
                <tr>
                  <th scope="col">Fill</th>
                  <th scope="col">Qty</th>
                  <th scope="col">Price</th>
                  <th scope="col">Fees</th>
                </tr>
              </thead>
              <tbody>
                {REVERSAL_DEMO.fills.map((fill, index) => (
                  <tr key={index}>
                    <td>
                      {fill.when} {fill.side}
                    </td>
                    <td>{fill.qty}</td>
                    <td>{fill.price}</td>
                    <td>{fill.fees}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="table-scroll mt-6">
            <table className="exec">
              <thead>
                <tr>
                  <th scope="col">Round trip</th>
                  <th scope="col">Qty</th>
                  <th scope="col">Entry → exit</th>
                  <th scope="col">Gross</th>
                  <th scope="col">Fees</th>
                  <th scope="col">Net</th>
                </tr>
              </thead>
              <tbody>
                {REVERSAL_DEMO.trades.map((trade, index) => (
                  <tr key={index}>
                    <td>
                      {trade.direction} {trade.symbol}
                    </td>
                    <td>{trade.qty}</td>
                    <td>
                      {trade.entry} → {trade.exit}
                    </td>
                    <td>{trade.gross}</td>
                    <td>{trade.fees}</td>
                    <td className={trade.sign > 0 ? "v-profit" : trade.sign < 0 ? "v-loss" : ""}>
                      {trade.net}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="t-secondary mt-4">
            Two trades, not one. The 150-share sell paid $1.50 in commission and it is split{" "}
            {REVERSAL_DEMO.trades[0].fees} / {REVERSAL_DEMO.trades[1].fees} across them, pro rata by
            quantity, with the remainder assigned so the parts sum to the whole exactly.
          </p>
        </section>

        {/* -------------------------------------------- 4. the buyer's own math --- */}
        <section className="hairline-t py-14">
          <p className="t-label">The math</p>
          <h2 className="t-h2 mt-3" style={{ maxWidth: "34ch" }}>
            One leak, priced against the subscription.
          </h2>
          <div className="stat-grid mt-6">
            <div className="stat">
              <p className="t-label">Demo leak, per month</p>
              <p className="t-stat mt-2" style={{ color: "var(--color-leak)" }}>
                {finding.monthlyImpactCents !== null
                  ? formatCents(finding.monthlyImpactCents)
                  : gapLabel}
              </p>
            </div>
            <div className="stat">
              <p className="t-label">TradeLog Trader</p>
              <p className="t-stat mt-2">${PLANS.trader.priceMonthly}</p>
            </div>
            <div className="stat">
              <p className="t-label">Demo win rate</p>
              <p className="t-stat mt-2">{formatPercent(summary.winRatePct)}</p>
            </div>
            <div className="stat">
              <p className="t-label">Demo profit factor</p>
              <p className="t-stat mt-2">{formatRatio(summary.profitFactor)}</p>
            </div>
          </div>
          <p className="t-secondary mt-5" style={{ maxWidth: "46ch" }}>
            A trader taking twenty trades a week does not need the subscription to pay for itself
            twice; they need to stop one habit once. That is the whole pitch, and it is why the
            findings carry dollar figures instead of badges.
          </p>
        </section>

        {/* ---------------------------------------------- 5. objection killers --- */}
        <section className="hairline-t py-14">
          <p className="t-label">The objections</p>
          <h2 className="t-h2 mt-3">Three reasons not to trust a tool like this.</h2>
          <dl className="mt-6">
            {[
              [
                "“It will find a pattern in noise.”",
                `It refuses to. A finding needs ${MIN_TRADES} closed trades overall and ${MIN_SEGMENT} inside the pattern before it will be shown, and below that TradeLog says nothing at all — not "insufficient data", nothing. Every finding carries its sample size and a list of the exact trades behind it.`,
              ],
              [
                "“The P&L will be subtly wrong.”",
                "There is no floating-point arithmetic anywhere in the money path — every value is an exact fixed-point integer, and the one rounding step happens once per trade, at the cent. Fees are held to nineteen decimal places so a sub-cent regulatory fee on nine hundred fills is still the $4.50 it really is.",
              ],
              [
                "“It will tell me what to do.”",
                "It will not. Every finding is a descriptive statistic about your own closed trades, written in the past tense. No signals, no predictions, no advice — just the arithmetic, with the trades attached so you can check it.",
              ],
            ].map(([question, answer]) => (
              <div key={question} className="hairline-b py-5">
                <dt className="t-finding">{question}</dt>
                <dd className="t-body mt-2" style={{ color: "var(--color-text-2)" }}>
                  {answer}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ------------------------------------------------------- 6. pricing --- */}
        <section className="hairline-t py-14">
          <p className="t-label">Pricing</p>
          <h2 className="t-h2 mt-3" style={{ maxWidth: "32ch" }}>
            $19 where the incumbents start at $29 to $49.
          </h2>

          <div className="mt-8 flex flex-col gap-4">
            {Object.values(PLANS).map((tier) => (
              <div key={tier.id} className="card p-5">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="t-label">{tier.name}</p>
                  <p className="t-stat">
                    {tier.priceMonthly === 0 ? "$0" : `$${tier.priceMonthly}`}
                  </p>
                </div>
                <p className="t-secondary mt-2">
                  {tier.priceYearly > 0
                    ? `a month · $${tier.priceYearly} a year, which is $${monthlyEquivalent(tier.id)} a month`
                    : "free, and it stays free"}
                </p>
                <p className="t-body mt-3">{tier.pitch}</p>
                <ul className="mt-4 flex flex-col gap-2">
                  {[
                    Number.isFinite(tier.tradesPerMonth)
                      ? `${tier.tradesPerMonth} trades a month`
                      : "Unlimited trades",
                    `${tier.accounts} ${tier.accounts === 1 ? "brokerage account" : "brokerage accounts"}`,
                    Number.isFinite(tier.findingsVisible)
                      ? `Your top ${tier.findingsVisible} leak in full`
                      : "Every finding, ranked by cost",
                    tier.setups ? "Playbook with per-setup expectancy" : null,
                    tier.chartImages ? "Chart snapshots on every trade" : null,
                    tier.dataExport ? "CSV and JSON export" : null,
                    tier.mentorSharing ? "Share link for a mentor or prop firm" : null,
                  ]
                    .filter((line): line is string => Boolean(line))
                    .map((line) => (
                      <li key={line} className="t-secondary flex items-start gap-2">
                        <IconCheck size={14} className="mt-1 shrink-0" />
                        {line}
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>

          <p className="t-secondary mt-6" style={{ maxWidth: "46ch" }}>
            Prices for Tradezella, TraderSync and Tradervue are their published list prices at the
            time of writing. We are not comparing features we have not verified — the comparison here
            is the price.
          </p>
        </section>

        {/* ---------------------------------------------------- 7. final CTA --- */}
        <section className="hairline-t py-14">
          <h2 className="t-h2" style={{ maxWidth: "30ch" }}>
            Find out what your trading actually looks like.
          </h2>
          <p className="t-body mt-4" style={{ color: "var(--color-text-2)", maxWidth: "42ch" }}>
            Import one export. If there is nothing to find, TradeLog will say nothing — and that is
            worth knowing too.
          </p>
          <Link href="/signup" className="btn btn-primary btn-full mt-8 no-underline sm:w-auto">
            {CTA}
            <IconArrowRight size={18} />
          </Link>
        </section>
      </main>

      <footer className="screen hairline-t py-10">
        <p className="t-label">TradeLog</p>
        <p className="t-secondary mt-3" style={{ maxWidth: "52ch" }}>
          TradeLog reports descriptive statistics about trades you have already made. It is not
          investment advice, it does not generate signals, and past results in your own journal are
          not a prediction of future ones. Your P&amp;L is yours: it is never sold, never shared, and
          exportable and deletable on request.
        </p>
        <nav className="mt-5 flex gap-5">
          <Link href="/login" className="t-secondary no-underline">
            Sign in
          </Link>
          <Link href="/signup" className="t-secondary no-underline">
            {CTA}
          </Link>
        </nav>
      </footer>
    </>
  );
}
