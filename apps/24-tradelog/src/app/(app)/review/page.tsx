import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { currentWeekStart, getReview, listReviews, reviewStreak, weekInReview } from "@/lib/review";
import { listFindings } from "@/lib/findings";
import { formatCents, formatPercent } from "@/lib/money";
import { formatDateKey } from "@/lib/tz";
import { pnlClass, Stat } from "@/components/Money";
import { ReviewForm } from "./ReviewForm";
import { IconArrowRight } from "@/components/icons";

export const metadata: Metadata = { title: "Weekly review" };
export const dynamic = "force-dynamic";

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const user = await requireUser();
  const { week } = await searchParams;
  const thisWeek = currentWeekStart(user);
  const weekStart = /^\d{4}-\d{2}-\d{2}$/.test(week ?? "") ? week! : thisWeek;

  const [review, reviews, findings, summary] = await Promise.all([
    getReview(user.id, weekStart),
    listReviews(user.id),
    listFindings(user.id),
    weekInReview(user, weekStart),
  ]);

  const streak = reviewStreak(reviews, thisWeek);
  const topFinding = findings[0] ?? null;

  return (
    <main className="screen">
      <header className="pt-8 pb-6">
        <p className="t-label">
          Week of {formatDateKey(summary.weekStart)} — {formatDateKey(summary.weekEnd)}
        </p>
        <h1 className="t-h2 mt-2">Weekly review</h1>
        <p className="t-secondary mt-2">
          {streak === 0
            ? "No streak yet. One honest week starts it."
            : `${streak} consecutive ${streak === 1 ? "week" : "weeks"} reviewed.`}
        </p>
      </header>

      <section className="mb-8">
        <h2 className="t-label mb-2">The week, in numbers</h2>
        <div className="stat-grid">
          <Stat
            label="Net"
            value={formatCents(summary.summary.netCents, { signed: true })}
            money
            sparkFor={summary.summary.netCents}
            note={`${summary.summary.closedCount} closed`}
          />
          <Stat
            label="Win rate"
            value={formatPercent(summary.summary.winRatePct)}
            note={`${summary.summary.winners}W / ${summary.summary.losers}L`}
          />
          <Stat
            label="Best day"
            value={
              summary.bestDay ? formatCents(summary.bestDay.netCents, { signed: true }) : "—"
            }
            money
            sparkFor={summary.bestDay?.netCents ?? 0n}
            note={summary.bestDay ? formatDateKey(summary.bestDay.date, { year: false }) : "no trades"}
          />
          <Stat
            label="Worst day"
            value={
              summary.worstDay ? formatCents(summary.worstDay.netCents, { signed: true }) : "—"
            }
            money
            sparkFor={summary.worstDay?.netCents ?? 0n}
            note={
              summary.worstDay ? formatDateKey(summary.worstDay.date, { year: false }) : "no trades"
            }
          />
        </div>
      </section>

      {topFinding ? (
        <section className="mb-8">
          <h2 className="t-label mb-3">The leak to answer this week</h2>
          <div className="leak-card">
            <p className="t-finding">{topFinding.statement}</p>
            <p className="t-secondary mt-2">
              {formatCents(topFinding.dollarImpactCents)} across {topFinding.sampleSize} trades.
            </p>
            <Link href="/insights" className="btn-quiet mt-4 inline-flex items-center gap-2">
              See the evidence
              <IconArrowRight size={16} />
            </Link>
          </div>
        </section>
      ) : null}

      <section className="mb-8">
        <ReviewForm
          weekStart={weekStart}
          initial={{
            wentWell: review?.wentWell ?? "",
            wentWrong: review?.wentWrong ?? "",
            oneChange: review?.oneChange ?? "",
          }}
          findingKind={topFinding?.kind ?? null}
          completed={Boolean(review?.completedAt)}
        />
      </section>

      {summary.trades.length ? (
        <section className="mb-8">
          <h2 className="t-label mb-2">This week&rsquo;s trades</h2>
          <ul>
            {summary.trades.map((trade) => (
              <li key={trade.id}>
                <Link href={`/journal/${trade.id}`} className="row">
                  <span className="t-cell flex-1">{trade.displaySymbol}</span>
                  <span className={`t-cell ${pnlClass(trade.netPnlCents)}`}>
                    {formatCents(trade.netPnlCents, { signed: true })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="t-secondary mb-8">
          No closed trades in this week. A week with no trades is still worth writing down.
        </p>
      )}

      {reviews.length ? (
        <section>
          <h2 className="t-label mb-2">Earlier weeks</h2>
          <ul>
            {reviews.map((row) => (
              <li key={row.id}>
                <Link href={`/review?week=${row.weekStart}`} className="row">
                  <span className="t-cell flex-1">{formatDateKey(row.weekStart)}</span>
                  <span className="t-secondary">
                    {row.completedAt ? "Reviewed" : "Draft"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
