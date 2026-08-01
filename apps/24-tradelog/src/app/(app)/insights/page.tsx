import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { closedTradesFor } from "@/lib/trades";
import { listFindings } from "@/lib/findings";
import { byCloseTime, summarize } from "@/lib/analytics";
import { MIN_SEGMENT, MIN_TRADES } from "@/lib/leaks";
import { formatCents } from "@/lib/money";
import { zonedDateKey } from "@/lib/tz";
import { plan, visibleFindings } from "@/lib/plans";
import { CounterfactualCurve } from "@/components/CounterfactualCurve";
import { DrawOnce } from "@/components/DrawOnce";
import { Odometer } from "@/components/Odometer";
import { LeakActions, type EvidenceRow } from "./LeakActions";
import { dismissFindingAction, recomputeAction } from "./actions";
import { IconAlert, IconArrowRight, IconImport } from "@/components/icons";

export const metadata: Metadata = { title: "Insights" };
export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  time_leak: "Time of day",
  weekday_leak: "Day of week",
  revenge: "After a loss",
  winner_cut: "Hold-time asymmetry",
  size_drift: "Position size",
  overtrading: "Trade count",
  setup_decay: "Setup",
};

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ leak?: string }>;
}) {
  const user = await requireUser();
  const { leak } = await searchParams;
  const limits = plan(user.plan);

  const [findings, closed] = await Promise.all([listFindings(user.id), closedTradesFor(user.id)]);
  const summary = summarize(closed);

  if (findings.length === 0) {
    return <NotYet closedCount={summary.closedCount} />;
  }

  const readable = visibleFindings(user.plan, findings.length);
  const index = Math.min(Math.max(0, Number(leak ?? 0) || 0), findings.length - 1);
  const locked = index >= readable;
  const finding = findings[index];

  // The counterfactual: the same curve with this leak's trades struck out.
  const ordered = byCloseTime(closed);
  const excluded = new Set(finding.tradeIds);
  const actual: number[] = [];
  const without: number[] = [];
  let runningActual = 0n;
  let runningWithout = 0n;
  for (const trade of ordered) {
    runningActual += trade.netPnlCents;
    if (!excluded.has(trade.id)) runningWithout += trade.netPnlCents;
    actual.push(Number(runningActual));
    without.push(Number(runningWithout));
  }

  const tradeById = new Map(closed.map((t) => [t.id, t]));
  const evidence: EvidenceRow[] = finding.tradeIds
    .slice(0, 8)
    .map((id) => tradeById.get(id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t))
    .map((t) => ({
      id: t.id,
      symbol: t.displaySymbol,
      when: zonedDateKey(t.closedAt, user.timezone),
      pnlLabel: formatCents(t.netPnlCents, { signed: true }),
      sign: t.netPnlCents > 0n ? 1 : t.netPnlCents < 0n ? -1 : 0,
    }));

  const next = index + 1 < findings.length ? index + 1 : null;

  return (
    <main className="screen screen-cta">
      <header className="pt-8 pb-5">
        <h1 className="t-h2">Insights</h1>
        <p className="t-secondary mt-1">
          {findings.length} {findings.length === 1 ? "finding" : "findings"} from{" "}
          {summary.closedCount} closed trades, ranked by what they cost. One at a time, on purpose.
        </p>
      </header>

      {locked ? (
        <LockedLeak kind={finding.kind} rank={index} total={findings.length} />
      ) : (
        <>
          <section className="leak-card">
            <p className="t-label" style={{ color: "var(--color-leak)" }}>
              Leak Nº {index + 1} — {index === 0 ? "highest cost" : KIND_LABEL[finding.kind]}
            </p>
            <p className="t-finding mt-3">{finding.statement}</p>
            <p className="t-leak-figure mt-4" style={{ color: "var(--color-leak)" }}>
              <Odometer
                value={Number(finding.dollarImpactCents)}
                kind="money"
                sessionKey={`leak-${finding.id}`}
              />
            </p>
            <p className="t-secondary mt-2">
              {finding.monthlyImpactCents !== null
                ? `${formatCents(finding.monthlyImpactCents)} a month at the rate of the period measured`
                : `measured across ${finding.sampleSize} trades`}
            </p>
            <p className="t-body mt-4">{finding.detail}</p>

            <LeakActions
              findingId={finding.id}
              watching={finding.watching}
              evidence={evidence}
              moreCount={Math.max(0, finding.tradeIds.length - evidence.length)}
            />
          </section>

          <section className="mt-6">
            <h2 className="t-label mb-3">You, and you without this leak</h2>
            <DrawOnce sessionKey={`counterfactual-${finding.id}`}>
              {(animate) => (
                <CounterfactualCurve
                  actual={actual}
                  without={without}
                  animate={animate}
                  label={`Your cumulative net profit and loss ends at ${formatCents(
                    BigInt(Math.round(actual[actual.length - 1] ?? 0)),
                    { ascii: true },
                  )}; with the ${finding.sampleSize} trades behind this finding removed it would read ${formatCents(
                    BigInt(Math.round(without[without.length - 1] ?? 0)),
                    { ascii: true },
                  )}`}
                />
              )}
            </DrawOnce>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
              <span className="t-secondary flex items-center gap-2">
                <span
                  aria-hidden="true"
                  style={{ width: 16, height: 1.5, background: "var(--color-text-2)" }}
                />
                What happened
              </span>
              <span className="t-secondary flex items-center gap-2">
                <span
                  aria-hidden="true"
                  style={{ width: 16, height: 1.5, background: "var(--color-paper)" }}
                />
                The same trades without this pattern
              </span>
            </div>
            <p className="t-secondary mt-3">
              The upper line is not a projection: it is your own history with those{" "}
              {finding.sampleSize} trades struck out. The gap is the arithmetic difference, which is
              why every point of it is checkable in the journal.
            </p>
          </section>

          <section className="mt-8">
            <h2 className="t-label mb-2">All findings</h2>
            <ul>
              {findings.map((row, i) => (
                <li key={row.id}>
                  <Link
                    href={`/insights?leak=${i}`}
                    className="row no-underline"
                    aria-current={i === index ? "true" : undefined}
                  >
                    <span
                      className="t-label"
                      style={{ color: i === index ? "var(--color-blue)" : undefined }}
                    >
                      Nº {i + 1}
                    </span>
                    <span className="t-body min-w-0 flex-1 truncate">
                      {i < readable ? row.statement : `${KIND_LABEL[row.kind]} — Trader`}
                    </span>
                    <span className="t-cell" style={{ color: "var(--color-leak)" }}>
                      {i < readable ? formatCents(row.dollarImpactCents) : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-8">
            <h2 className="t-label mb-3">Housekeeping</h2>
            <div className="flex flex-wrap gap-3">
              <form action={dismissFindingAction.bind(null, finding.id)}>
                <button className="btn btn-secondary" type="submit">
                  Dismiss this finding
                </button>
              </form>
              <form action={recomputeAction}>
                <button className="btn btn-secondary" type="submit">
                  Recompute now
                </button>
              </form>
            </div>
            <p className="t-secondary mt-3">
              A dismissed finding stays dismissed while its sentence is unchanged. If the pattern
              comes back with a different cost, it comes back.
            </p>
          </section>
        </>
      )}

      {next !== null ? (
        <div className="thumb-cta">
          <Link href={`/insights?leak=${next}`} className="btn btn-primary btn-full no-underline">
            Next leak
            <IconArrowRight size={18} />
          </Link>
        </div>
      ) : null}
    </main>
  );
}

function LockedLeak({ kind, rank, total }: { kind: string; rank: number; total: number }) {
  return (
    <section className="leak-card" data-locked="true">
      <p className="t-label">
        Leak Nº {rank + 1} of {total} — {KIND_LABEL[kind]}
      </p>
      <p className="t-finding mt-3">
        The Free plan reads your biggest leak in full. This one is measured and waiting.
      </p>
      <p className="t-secondary mt-3">
        Trader unlocks every finding, the segment breakdowns behind them, your own playbook with its
        expectancy, and chart snapshots — $19/mo, or $190 a year.
      </p>
      <Link href="/settings/billing" className="btn-quiet mt-5 inline-flex items-center gap-2">
        See the plans
        <IconArrowRight size={16} />
      </Link>
    </section>
  );
}

function NotYet({ closedCount }: { closedCount: number }) {
  return (
    <main className="screen">
      <header className="pt-8 pb-5">
        <h1 className="t-h2">Insights</h1>
      </header>
      <section className="card p-5">
        <p className="t-finding flex items-start gap-3">
          <IconAlert size={20} className="mt-1 shrink-0" />
          <span>
            {closedCount === 0
              ? "Nothing to analyse yet."
              : `${closedCount} closed trades — not enough to say anything honest.`}
          </span>
        </p>
        <p className="t-secondary mt-3">
          A finding needs {MIN_TRADES} closed trades overall and {MIN_SEGMENT} inside the pattern
          before TradeLog will name it. Below that it says nothing at all, because a confident number
          from six trades is astrology with a dollar sign on it.
        </p>
        <Link href="/import" className="btn-quiet mt-4 inline-flex items-center gap-2">
          <IconImport size={16} />
          Import more history
        </Link>
      </section>

      <section className="mt-8">
        <h2 className="t-label mb-3">What it looks for</h2>
        <ul>
          {[
            ["Time of day", "Whether everything after a certain hour is net negative."],
            ["Day of week", "Whether one weekday carries your losses."],
            ["After a loss", "How the trade you take within 30 minutes of a loss performs."],
            ["Hold-time asymmetry", "Whether losers are held longer than winners, and what that cost."],
            ["Position size", "Whether the trades where you sized up are the ones that lost."],
            ["Trade count", "The trade number of the day at which you start giving it back."],
            ["Setup", "Which of your own setups has stopped working."],
          ].map(([title, detail]) => (
            <li key={title} className="row items-start">
              <div>
                <p className="t-body">{title}</p>
                <p className="t-secondary mt-1">{detail}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="t-secondary mt-4">
          Every finding is a descriptive statistic about your own closed trades. None of it is advice,
          a prediction, or a signal.
        </p>
      </section>
    </main>
  );
}
