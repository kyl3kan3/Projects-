import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { closedTradesFor, listAccounts, listTrades } from "@/lib/trades";
import { listFindings } from "@/lib/findings";
import {
  dailyPnl,
  equityCurve,
  summarize,
  type ClosedTrade,
} from "@/lib/analytics";
import { formatCents, formatPercent, formatRatio } from "@/lib/money";
import { displaySymbol } from "@/lib/instruments";
import { zonedDateKey, zonedParts } from "@/lib/tz";
import { plan, visibleFindings } from "@/lib/plans";
import { EquityCurve } from "@/components/EquityCurve";
import { DrawOnce } from "@/components/DrawOnce";
import { CalendarHeatmap, type HeatmapDay } from "@/components/CalendarHeatmap";
import { Money, Stat, pnlClass } from "@/components/Money";
import { Odometer } from "@/components/Odometer";
import { IconArrowRight, IconEye, IconImport, IconLeak } from "@/components/icons";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const limits = plan(user.plan);
  const [closed, findings, accounts, open] = await Promise.all([
    closedTradesFor(user.id),
    listFindings(user.id),
    listAccounts(user.id),
    listTrades(user.id, { status: "open", limit: 20 }),
  ]);

  if (accounts.length === 0) {
    return <FirstRun />;
  }

  const summary = summarize(closed);
  const curve = equityCurve(closed).map((p) => Number(p.cumulativeCents));
  const watched = findings.filter((f) => f.watching);
  const topFinding = findings.slice(0, Math.max(1, visibleFindings(user.plan, findings.length)))[0];

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <p className="t-label">Net, all time, after fees</p>
        <h1 className={`t-stat mt-2 ${pnlClass(summary.netCents)}`} style={{ fontSize: 40 }}>
          <Odometer
            value={Number(summary.netCents)}
            kind="money"
            sessionKey="dashboard-net"
          />
        </h1>
        <p className="t-secondary mt-2">
          {summary.closedCount} closed {summary.closedCount === 1 ? "trade" : "trades"}
          {open.length ? ` · ${open.length} still open` : ""} · {accounts.length}{" "}
          {accounts.length === 1 ? "account" : "accounts"} on {limits.name}
        </p>
      </header>

      {watched.length ? (
        <section className="mb-6 flex flex-wrap gap-2" aria-label="Patterns you are watching">
          {watched.map((finding) => (
            <span key={finding.id} className="chip chip-static" data-active="true">
              <IconEye size={14} />
              {finding.statement.replace(/\.$/, "")}
            </span>
          ))}
        </section>
      ) : null}

      <div className="dash-split">
        <section className="mb-6">
          <h2 className="t-label mb-3">Equity curve · cumulative net P&amp;L</h2>
          <DrawOnce sessionKey="dashboard-curve">
            <EquityCurve
              values={curve}
              label={`Cumulative net profit and loss across ${summary.closedCount} closed trades, ending at ${formatCents(summary.netCents, { ascii: true })}`}
            />
          </DrawOnce>
        </section>

        <section className="mb-8">
          <div className="stat-grid">
            <Stat
              label="Win rate"
              value={formatPercent(summary.winRatePct)}
              note={`${summary.winners}W / ${summary.losers}L${summary.scratches ? ` / ${summary.scratches} scratch` : ""}`}
            />
            <Stat
              label="Profit factor"
              value={formatRatio(summary.profitFactor)}
              note={
                summary.profitFactor === null
                  ? "No losing trades yet"
                  : `${formatCents(summary.grossProfitCents)} won / ${formatCents(summary.grossLossCents)} lost`
              }
            />
            <Stat
              label="Expectancy"
              value={
                summary.expectancyCents === null
                  ? "—"
                  : formatCents(summary.expectancyCents, { signed: true })
              }
              money
              sparkFor={summary.expectancyCents ?? 0n}
              note="Average trade, after fees"
            />
            <Stat
              label="Max drawdown"
              value={
                summary.maxDrawdownCents === 0n
                  ? "$0.00"
                  : formatCents(-summary.maxDrawdownCents, { compact: true })
              }
              money
              sparkFor={-summary.maxDrawdownCents}
              note="Largest fall of the curve above"
            />
          </div>
          <p className="t-secondary mt-4">
            Fees paid: {formatCents(summary.feesCents)}. Drawdown is measured on realised trade
            P&amp;L — TradeLog never sees your deposits, so it does not claim to know your account
            equity.
          </p>
        </section>
      </div>

      <div className="mb-8">
        <MonthHeatmap closed={closed} timezone={user.timezone} />
      </div>

      {open.length ? (
        <section className="mb-8">
          <h2 className="t-label mb-2">Still open</h2>
          <ul>
            {open.map((trade) => (
              <li key={trade.id}>
                <Link href={`/journal/${trade.id}`} className="row">
                  <span className="t-cell flex-1">
                    {displaySymbol(trade.assetClass, trade.symbol)}
                  </span>
                  <span className="t-secondary">{trade.direction}</span>
                  {trade.unrealizedPnlCents !== null ? (
                    <Money cents={trade.unrealizedPnlCents} signed />
                  ) : (
                    <span className="t-cell" style={{ color: "var(--color-text-3)" }}>
                      no mark
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
          <p className="t-secondary mt-3">
            Open trades are marked at the last fill TradeLog has seen in the symbol, not a live
            quote.
          </p>
        </section>
      ) : null}

      <section className="mb-8">
        <h2 className="t-label mb-3">Your biggest leak</h2>
        {topFinding ? (
          <Link href="/insights" className="leak-card block no-underline">
            <p className="t-label" style={{ color: "var(--color-leak)" }}>
              Leak Nº 1 — highest cost
            </p>
            <p className="t-finding mt-3">{topFinding.statement}</p>
            <p className="t-leak-figure mt-4" style={{ color: "var(--color-leak)" }}>
              {formatCents(topFinding.dollarImpactCents)}
            </p>
            <p className="t-secondary mt-2">
              measured over {topFinding.sampleSize} trades
              {topFinding.monthlyImpactCents !== null
                ? ` · ${formatCents(topFinding.monthlyImpactCents)} a month at this rate`
                : ""}
            </p>
            <span className="btn-quiet mt-4 inline-flex items-center gap-2">
              All findings
              <IconArrowRight size={16} />
            </span>
          </Link>
        ) : (
          <div className="card p-5">
            <p className="t-finding">Not enough closed trades to say anything honest yet.</p>
            <p className="t-secondary mt-2">
              Leak detection needs 20 closed trades overall and 8 inside a pattern before it will
              name one. Below that it stays quiet rather than guessing —{" "}
              {summary.closedCount} of 20 so far.
            </p>
            <Link href="/import" className="btn-quiet mt-4 inline-flex items-center gap-2">
              <IconImport size={16} />
              Import more history
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}

/**
 * The month grid, built server-side so the client only decides an opacity.
 *
 * It opens on the current month, unless there is nothing in it — a trader who has
 * just imported last year's history should see last year's history, not a blank
 * grid that looks like a bug.
 */
function MonthHeatmap({ closed, timezone }: { closed: ClosedTrade[]; timezone: string }) {
  const now = new Date();
  const currentPrefix = zonedDateKey(now, timezone).slice(0, 7);
  const allDays = dailyPnl(closed, timezone);
  const hasThisMonth = [...allDays.keys()].some((date) => date.startsWith(currentPrefix));
  const latest = [...allDays.keys()].sort().at(-1);
  const anchor =
    hasThisMonth || !latest ? now : new Date(`${latest.slice(0, 7)}-15T12:00:00Z`);
  const here = zonedParts(anchor, timezone);
  const monthPrefix = `${here.year}-${String(here.month).padStart(2, "0")}`;
  const daysInMonth = new Date(Date.UTC(here.year, here.month, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(here.year, here.month - 1, 1)).getUTCDay();
  const monthLabel = new Date(Date.UTC(here.year, here.month - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const byDay = allDays;
  const tradeById = new Map(closed.map((t) => [t.id, t]));
  const days: HeatmapDay[] = [...byDay.values()]
    .filter((day) => day.date.startsWith(monthPrefix))
    .map((day) => ({
      date: day.date,
      netCents: Number(day.netCents),
      netLabel: formatCents(day.netCents, { signed: true }),
      count: day.count,
      trades: day.tradeIds.map((id) => {
        const trade = tradeById.get(id)!;
        return {
          id,
          symbol: trade.displaySymbol,
          pnlLabel: formatCents(trade.netPnlCents, { signed: true }),
          sign: trade.netPnlCents > 0n ? 1 : trade.netPnlCents < 0n ? -1 : 0,
        };
      }),
    }));

  return (
    <CalendarHeatmap
      monthLabel={monthLabel}
      firstWeekday={firstWeekday}
      daysInMonth={daysInMonth}
      days={days}
      monthPrefix={monthPrefix}
    />
  );
}

/** No account yet: one instruction, real broker names, nothing grey. */
function FirstRun() {
  return (
    <main className="screen screen-cta">
      <header className="pt-8 pb-6">
        <p className="t-label">Nothing imported yet</p>
        <h1 className="t-h2 mt-2">Your record starts with one file.</h1>
        <p className="t-secondary mt-2">
          Export your fills, drop them in, and TradeLog matches them into round-trip trades — scaling
          in and out included — before it says a word about your habits.
        </p>
      </header>

      <ul>
        {[
          {
            broker: "ThinkorSwim / Schwab",
            how: "Monitor → Account Statement → export CSV",
          },
          {
            broker: "Interactive Brokers",
            how: "Performance & Reports → Flex Queries → Trades, as CSV or XML",
          },
          { broker: "Tradovate", how: "Orders → History → export CSV, with the Fee column" },
          { broker: "Binance (spot)", how: "Orders → Spot Order → Trade History → Export" },
        ].map((row) => (
          <li key={row.broker} className="row">
            <div className="min-w-0">
              <p className="t-body">{row.broker}</p>
              <p className="t-secondary">{row.how}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="thumb-cta">
        <Link href="/import" className="btn btn-primary btn-full no-underline">
          <IconLeak size={18} />
          Import your first file
        </Link>
      </div>
    </main>
  );
}
